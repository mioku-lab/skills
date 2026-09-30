#!/usr/bin/env bun
/**
 * Validate a Mioku service against the loader's rules.
 *
 *   bun validate-service.ts <service-dir>
 *
 * The four failure modes this catches are the ones that produce a silent or
 * confusing absence: no package.json, a non-standard entry filename, a missing
 * init(), and a name that does not match the folder / package short name.
 *
 * Works for both layouts: a monorepo package (dir named by the full package
 * name, sources in src/, built to dist/) and a local services/<name>/ folder.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("usage: bun validate-service.ts <service-dir>");
  process.exit(1);
}

const root = path.resolve(dir);
const errors: string[] = [];
const warnings: string[] = [];

const pkgPath = path.join(root, "package.json");
if (!fs.existsSync(pkgPath)) {
  errors.push("package.json 缺失 — 加载器会静默跳过本地服务，日志里都不会出现");
  report();
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const pkgName: string = pkg.name ?? "";
const folder = path.basename(root);

// --- name ------------------------------------------------------------------
let short = folder;
if (pkgName.startsWith("mioku-service-")) {
  short = pkgName.slice("mioku-service-".length);
  if (folder !== pkgName && folder !== short) {
    errors.push(`目录名 "${folder}" 既不是完整包名 "${pkgName}" 也不是短名 "${short}"`);
  }
} else if (pkgName) {
  warnings.push(`package name "${pkgName}" 不是 mioku-service-* 形式；发布到市场时必须是`);
}

// --- entry: only index.ts / index.js at the package root are recognised -----
const rootEntry = ["index.ts", "index.js"].map((c) => path.join(root, c)).find((p) => fs.existsSync(p));
const stray = ["src/index.ts", "src/index.js", "main.ts", "index.mts", "index.mjs", "dist/index.mjs"]
  .map((c) => path.join(root, c))
  .filter((p) => fs.existsSync(p));

// A built monorepo package legitimately points at dist/ via exports; that is
// fine for npm consumers, but a LOCAL services/<name>/ folder must use the root
// entry. Report only when there is no root entry at all.
const scan = [rootEntry, ...stray].filter((p): p is string => !!p);
if (!rootEntry) {
  errors.push(
    "包根没有 index.ts / index.js — 本地服务只认这两个文件名，main 字段无效" +
      (stray.length ? `；发现 ${stray.map((p) => path.relative(root, p)).join(", ")}，不会被加载` : ""),
  );
}

// --- init() / api ----------------------------------------------------------
if (scan.length) {
  const text = scan.map((p) => fs.readFileSync(p, "utf8")).join("\n");

  if (!/\binit\s*[:(]/.test(text)) {
    errors.push('没有找到 init() — 加载器会报 "invalid: missing init()"');
  }
  if (!/\bapi\s*[:(]/.test(text)) {
    warnings.push("没有找到 api 字段 — 服务对外暴露的一切都必须在 init() 里填进 this.api");
  }
  if (!/\bdispose\s*[:(]/.test(text)) {
    warnings.push("没有 dispose() — 仅在服务持有 socket / 定时器 / DB 句柄时才需要");
  }

  const nameMatch = text.match(/\bname\s*:\s*["'`]([^"'`]+)["'`]/);
  if (!nameMatch) {
    warnings.push("没有找到 MiokuService 的 name 字段");
  } else if (nameMatch[1] !== short) {
    errors.push(`MiokuService.name "${nameMatch[1]}" 与短名 "${short}" 不一致`);
  }
}

// --- packaging -------------------------------------------------------------
if (pkg.dependencies?.mioku) errors.push("mioku 必须放在 peerDependencies，不能放 dependencies");
if (!pkg.peerDependencies?.mioku) warnings.push("建议声明 peerDependencies.mioku");
if (pkg.type !== "module") warnings.push(`type 建议设为 "module"（当前 ${JSON.stringify(pkg.type)}）`);
if (!Array.isArray(pkg.keywords) || !pkg.keywords.includes("mioku")) {
  warnings.push('keywords 建议包含 "mioku"，否则市场里搜不到');
}
if (pkg.main && !["index.ts", "index.js", "./index.ts", "./index.js", "dist/index.mjs"].includes(pkg.main)) {
  warnings.push(`main 指向 "${pkg.main}"；本地服务只认包根 index.ts / index.js`);
}

// --- docs ------------------------------------------------------------------
if (!fs.existsSync(path.join(root, "README.md")) && !fs.existsSync(path.join(root, "readme.md"))) {
  warnings.push("缺少 README.md — 建议写明对外暴露的 api 与配置");
}
const configMd = path.join(root, "config.md");
if (fs.existsSync(path.join(root, "config")) && !fs.existsSync(configMd)) {
  warnings.push("存在 config/ 目录但没有 config.md — 建议补上供 WebUI 渲染表单");
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
