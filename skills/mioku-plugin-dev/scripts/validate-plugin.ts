#!/usr/bin/env bun
/**
 * Validate a Mioku plugin package against the loader's rules.
 *
 *   bun validate-plugin.ts <plugin-dir>
 *
 * Checks the things that make a plugin silently invisible or fail to load:
 * package.json presence, name/prefix agreement, entry resolution, the mioku
 * manifest field, service declarations, and whether definePlugin.name matches.
 *
 * Works for both layouts: a monorepo package (dir named by the full package
 * name, sources in src/, built to dist/) and a local plugins/<name>/ folder.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun validate-plugin.ts <plugin-dir>");
  process.exit(1);
}

const root = path.resolve(dir);
const errors: string[] = [];
const warnings: string[] = [];

const pkgPath = path.join(root, "package.json");
if (!fs.existsSync(pkgPath)) {
  errors.push("package.json 缺失 — 加载器会直接跳过这个目录");
  report();
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const pkgName: string = pkg.name ?? "";
const folder = path.basename(root);

// --- name and prefix -------------------------------------------------------
let short = folder;
if (!pkgName.startsWith("mioku-plugin-")) {
  errors.push(`package name "${pkgName}" 必须以 mioku-plugin- 开头`);
} else {
  short = pkgName.slice("mioku-plugin-".length);
  // monorepo: dir === full package name. local plugins/<name>/: dir === short name.
  if (folder !== pkgName && folder !== short) {
    errors.push(`目录名 "${folder}" 既不是完整包名 "${pkgName}" 也不是短名 "${short}" — 本地插件会报 Plugin canonical ID mismatch`);
  }
}

// --- resolve files to inspect ---------------------------------------------
const SCAN = [
  pkg.mioku?.entry,
  typeof pkg.exports?.["."] === "string" ? pkg.exports["."] : undefined,
  pkg.exports?.["."]?.import,
  pkg.exports?.["."]?.require,
  pkg.main,
  pkg.module,
  "src/index.ts",
  "src/plugin.ts",
  "index.ts",
  "index.js",
  "index.mjs",
  "dist/index.mjs",
  "dist/index.js",
].filter((c): c is string => typeof c === "string");

const seen = new Set<string>();
const files: string[] = [];
for (const c of SCAN) {
  const p = path.join(root, c);
  if (seen.has(p)) continue;
  seen.add(p);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) files.push(p);
}

if (!files.length) {
  errors.push('找不到任何入口文件；加载器只认 mioku.entry / main / module / exports["."]，以及包根 index.ts|js');
}

const src = files.map((f) => ({ f, text: fs.readFileSync(f, "utf8") }));
const allText = () => src.map((s) => s.text).join("\n");

/** Read `name: "x"` or `name: CONST` followed by `const CONST = "x"`. */
function readStringField(text: string, field: string, limit = 800): string | undefined {
  const m = text.match(new RegExp(`definePlugin[\\s\\S]{0,${limit}}?\\b${field}\\s*:\\s*([^,\\n]+)`));
  if (!m) return undefined;
  const raw = m[1].trim().replace(/\s*\/\/.*$/, "");
  const lit = raw.match(/^["'`]([^"'`]+)["'`]$/);
  if (lit) return lit[1];
  if (/^[A-Za-z_$][\w$]*$/.test(raw)) {
    const c = text.match(new RegExp(`\\b(?:const|let|var)\\s+${raw}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`));
    return c?.[1];
  }
  return undefined;
}

// --- definePlugin.name -----------------------------------------------------
const pluginFile = src.find((s) => /definePlugin/.test(s.text));
if (!pluginFile) {
  warnings.push("没有找到 definePlugin — 不是插件包？");
} else if (pkgName.startsWith("mioku-plugin-")) {
  const name = readStringField(pluginFile.text, "name");
  if (!name) {
    warnings.push(`在 ${path.relative(root, pluginFile.f)} 里没能解析出 definePlugin 的 name`);
  } else if (name !== short) {
    errors.push(`definePlugin.name "${name}" 与包短名 "${short}" 不一致 — 会报 Plugin canonical ID mismatch`);
  }
}

// --- manifest --------------------------------------------------------------
const ALLOWED = new Set(["services", "help", "accessHooks", "entry"]);
const mioku = pkg.mioku;
if (mioku && typeof mioku === "object") {
  for (const key of Object.keys(mioku)) {
    if (!ALLOWED.has(key)) {
      warnings.push(`mioku.${key} 会被忽略并告警；只认 services（help / accessHooks 仅旧插件兼容）`);
    }
  }
  if (mioku.services !== undefined && !Array.isArray(mioku.services)) {
    errors.push("mioku.services 必须是数组，否则会被整个丢弃");
  }
  for (const legacy of ["help", "accessHooks"]) {
    if (mioku[legacy] !== undefined) {
      warnings.push(`mioku.${legacy} 是旧 manifest 兼容项，新插件请改用 ctx.command()`);
    }
  }
}

// --- packaging -------------------------------------------------------------
if (pkg.dependencies?.mioku) errors.push("mioku 必须放在 peerDependencies，不能放 dependencies");
if (!pkg.peerDependencies?.mioku) warnings.push("建议声明 peerDependencies.mioku");
if (pkg.type !== "module") warnings.push(`type 建议设为 "module"（当前 ${JSON.stringify(pkg.type)}）`);
if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("mioku")) {
  errors.push('keywords 必须包含 "mioku"，否则市场里搜不到');
}

// --- config.md: only TOP-LEVEL keys matter for the "first segment" rule ----
const configMd = path.join(root, "config.md");
if (fs.existsSync(configMd)) {
  const hits = fs
    .readFileSync(configMd, "utf8")
    .split("\n")
    .map((line) => line.match(/^(\s*)-\s*key:\s*(\S+)/))
    .filter((m): m is RegExpMatchArray => !!m);
  const minIndent = hits.length ? Math.min(...hits.map((m) => m[1].length)) : 0;
  for (const m of hits.filter((x) => x[1].length === minIndent)) {
    if (!m[2].includes(".")) {
      warnings.push(`config.md 顶层 key "${m[2]}" 没有点号 — 应为 "<配置名>.<路径>"`);
    }
  }
}

// --- docs ------------------------------------------------------------------
if (mioku?.services?.length && !fs.existsSync(configMd)) {
  warnings.push("有服务依赖但没有 config.md — 如果插件有配置，建议补一个供 WebUI 渲染表单");
}
if (!fs.existsSync(path.join(root, "README.md")) && !fs.existsSync(path.join(root, "readme.md"))) {
  warnings.push("缺少 README.md（发布到市场建议补上）");
}

// --- informational: anything obviously off ---------------------------------
if (/\bconsole\.(log|error|warn|info)\s*\(/.test(allText())) {
  warnings.push("发现 console.* 调用 — 插件应统一使用 ctx.logger");
}

report();

function report(): never {
  for (const w of warnings) console.warn(`warn  ${w}`);
  for (const e of errors) console.error(`error ${e}`);
  if (errors.length) {
    console.error(`\n${errors.length} error(s), ${warnings.length} warning(s) — ${root}`);
    process.exit(1);
  }
  console.log(`ok — ${root}${warnings.length ? ` (${warnings.length} warning(s))` : ""}`);
  process.exit(0);
}
