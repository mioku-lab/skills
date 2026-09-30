#!/usr/bin/env bun
/**
 * Validate a Mioku adapter package.
 *
 *   bun validate-adapter.ts <adapter-dir>
 *
 * Catches the failures that make an adapter invisible or rejected: wrong
 * package prefix, name mismatch, apiVersion != 1, a missing create(), and the
 * packaging fields the loader depends on.
 *
 * Works for both layouts: a monorepo package (dir named by the full package
 * name, sources in src/, built to dist/) and a plain package at any path.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun validate-adapter.ts <adapter-dir>");
  process.exit(1);
}

const root = path.resolve(dir);
const errors: string[] = [];
const warnings: string[] = [];

const pkgPath = path.join(root, "package.json");
if (!fs.existsSync(pkgPath)) {
  errors.push("package.json 缺失 — 适配器无法被发现");
  report();
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const pkgName: string = pkg.name ?? "";
const folder = path.basename(root);

// --- name and prefix -------------------------------------------------------
let short = folder;
if (!pkgName.startsWith("mioku-adapter-")) {
  errors.push(`package name "${pkgName}" 必须以 mioku-adapter- 开头`);
} else {
  short = pkgName.slice("mioku-adapter-".length);
  // monorepo: dir === full package name. local/plain: dir === short name.
  if (folder !== pkgName && folder !== short) {
    errors.push(`目录名 "${folder}" 既不是完整包名 "${pkgName}" 也不是短名 "${short}"`);
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
  "src/adapter.ts",
  "src/plugin.ts",
  "src/service.ts",
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
const firstWith = (re: RegExp) => src.find((s) => re.test(s.text));
const allText = () => src.map((s) => s.text).join("\n");

/** Read `field: "x"`, `field: 1`, or `field: CONST` plus `const CONST = ...`. */
function readStringField(text: string, factory: string, field: string): string | undefined {
  const m = text.match(new RegExp(`${factory}[\\s\\S]{0,600}?\\b${field}\\s*:\\s*([^,\\n]+)`));
  if (!m) return undefined;
  const raw = m[1].trim().replace(/\s*\/\/.*$/, "");
  const lit = raw.match(/^["'`]([^"'`]+)["'`]$/);
  if (lit) return lit[1];
  if (/^\d+$/.test(raw)) return raw;
  if (/^[A-Za-z_$][\w$]*$/.test(raw)) {
    const c = text.match(new RegExp(`\\b(?:const|let|var)\\s+${raw}\\s*=\\s*["'\`]?([\\w.-]+)["'\`]?`));
    return c?.[1];
  }
  return undefined;
}

// --- defineAdapter ---------------------------------------------------------
const def = firstWith(/defineAdapter/);
if (!def) {
  warnings.push("没有找到 defineAdapter — 不是适配器包？");
} else {
  const name = readStringField(def.text, "defineAdapter", "name");
  if (!name) warnings.push(`在 ${path.relative(root, def.f)} 里没能解析出 defineAdapter 的 name`);
  else if (name !== short) {
    errors.push(`defineAdapter.name "${name}" 与包短名 "${short}" 不一致`);
  }

  const api = readStringField(def.text, "defineAdapter", "apiVersion");
  if (api === undefined) errors.push("没有找到 apiVersion — 必须显式写 apiVersion: 1");
  else if (api !== "1") {
    errors.push(`apiVersion 是 ${api}，框架当前只接受 1 — 会被直接拒绝加载`);
  }

  if (!/\bcreate\s*[:(]/.test(def.text)) errors.push("没有找到 create() — 适配器定义必须提供 create");
  if (!/registerStatusProvider/.test(allText())) {
    warnings.push("没有调用 registerStatusProvider — .adapter / .status 里这个实例会是空的");
  }
  if (!/AdapterBotMap/.test(allText())) {
    warnings.push("没有声明 AdapterBotMap — 插件侧拿不到该平台的 bot 类型，只能手写断言");
  }
}

// --- packaging -------------------------------------------------------------
if (pkg.dependencies?.mioku) errors.push("mioku 必须放在 peerDependencies，不能放 dependencies");
if (!pkg.peerDependencies?.mioku) warnings.push("建议声明 peerDependencies.mioku");
if (pkg.type !== "module") warnings.push(`type 建议设为 "module"（当前 ${JSON.stringify(pkg.type)}）`);
if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("mioku")) {
  errors.push('keywords 必须包含 "mioku"，否则市场里搜不到');
}

// --- config.md: only TOP-LEVEL keys, whose first segment is the adapter name
const configMd = path.join(root, "config.md");
if (fs.existsSync(configMd)) {
  const lines = fs.readFileSync(configMd, "utf8").split("\n");
  const hits = lines
    .map((line) => line.match(/^(\s*)-\s*key:\s*(\S+)/))
    .filter((m): m is RegExpMatchArray => !!m);
  const minIndent = hits.length ? Math.min(...hits.map((m) => m[1].length)) : 0;
  const topKeys = hits.filter((m) => m[1].length === minIndent).map((m) => m[2]);

  for (const k of topKeys) {
    if (!k.includes(".")) {
      warnings.push(`config.md 顶层 key "${k}" 没有点号 — 第一段必须是适配器名 "${short}"`);
      continue;
    }
    const head = k.split(".")[0];
    if (head !== short) {
      errors.push(`config.md 顶层 key "${k}" 的第一段是 "${head}"，但适配器配置位于 mioku.adapters.${short}`);
    }
  }
  if (!topKeys.length) warnings.push("config.md 没有解析到任何顶层字段定义");
} else {
  warnings.push("缺少 config.md — 用户只能编辑 package.json 里的 mioku.adapters 原始 JSON");
}

if (!fs.existsSync(path.join(root, "README.md")) && !fs.existsSync(path.join(root, "readme.md"))) {
  warnings.push("缺少 README.md");
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
