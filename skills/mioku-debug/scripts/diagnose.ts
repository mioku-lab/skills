#!/usr/bin/env bun
/**
 * Collect Mioku diagnostic evidence in one pass.
 *
 *   bun diagnose.ts [<project-dir>]        # defaults to the current directory
 *
 * Read-only. Prints the project manifest state, package inventory, config and
 * data directories, the newest log file's tail, and runs the manifest checks
 * that catch the silent failure modes. Nothing is modified.
 */

import * as fs from "node:fs";
import * as path from "node:path";

const root = path.resolve(process.argv[2] ?? ".");
const log = (s = "") => console.log(s);
const head = (s: string) => {
  log();
  log(`──── ${s} ${"─".repeat(Math.max(0, 56 - s.length))}`);
};

// --- project manifest -------------------------------------------------------
head("project");
const pkgPath = path.join(root, "package.json");
if (!fs.existsSync(pkgPath)) {
  log("  package.json 不存在 — 这里看起来不是 Mioku 项目根目录");
  process.exit(1);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
const mioku = pkg.mioku ?? {};
log(`  name            ${pkg.name ?? "(none)"}`);
log(`  mioku.prefix    ${JSON.stringify(mioku.prefix ?? ".")}`);
log(`  log_level       ${JSON.stringify(mioku.log_level ?? "info")}`);
log(`  owners          ${JSON.stringify(mioku.owners ?? [])}`);
log(`  admins          ${JSON.stringify(mioku.admins ?? [])}`);
log(`  status_perm     ${JSON.stringify(mioku.status_permission ?? "all")}`);
log(`  plugins_dir     ${JSON.stringify(mioku.plugins_dir ?? "plugins")}`);
log(`  dedup           ${JSON.stringify(mioku.dedup ?? "(default)")}`);

if (!Array.isArray(mioku.owners) || mioku.owners.length === 0) {
  log("  ⚠ owners 为空 — 所有 master 权限命令（.log/.plugin/.settings）都无法触发");
}

// --- package inventory ------------------------------------------------------
const deps = pkg.dependencies ?? {};
const devDeps = pkg.devDependencies ?? {};
const kinds: Array<[string, string]> = [
  ["mioku-plugin-", "plugins"],
  ["mioku-service-", "services"],
  ["mioku-adapter-", "adapters"],
];

head("packages discovered in dependencies");
let found = 0;
for (const [prefix, label] of kinds) {
  const names = Object.keys(deps).filter((d) => d.startsWith(prefix));
  log(`  ${label.padEnd(9)} ${names.length ? names.map((n) => n.slice(prefix.length)).join(", ") : "—"}`);
  found += names.length;
}
if (!found) log("  (none)");

const misplaced = Object.keys(devDeps).filter(
  (d) => d.startsWith("mioku-plugin-") || d.startsWith("mioku-service-") || d.startsWith("mioku-adapter-"),
);
if (misplaced.length) {
  log();
  log("  ⚠ 以下包在 devDependencies 里 — 加载器只读 dependencies，它们不会被发现：");
  for (const m of misplaced) log(`      ${m}`);
}

// --- enabled plugins --------------------------------------------------------
head("enabled plugins (mioku.plugins)");
const enabled: unknown = mioku.plugins;
if (!Array.isArray(enabled)) {
  log("  ⚠ mioku.plugins 不是数组或缺失 — 没有任何用户插件会被启用");
} else {
  log(`  ${enabled.length ? enabled.join(", ") : "(empty)"}`);
  const installed = new Set([
    ...Object.keys(deps).map((d) => d.replace(/^mioku-plugin-/, "")),
    ...(fs.existsSync(path.join(root, mioku.plugins_dir ?? "plugins"))
      ? fs.readdirSync(path.join(root, mioku.plugins_dir ?? "plugins"))
      : []),
  ]);
  const missing = enabled.filter((n) => typeof n === "string" && !installed.has(n));
  if (missing.length) {
    log(`  ⚠ 这些在启用列表里但既不是已安装依赖也不是本地目录：${missing.join(", ")}`);
  }
}

// --- adapters ---------------------------------------------------------------
head("adapter config (mioku.adapters)");
const adapters = mioku.adapters ?? {};
log(`  ${Object.keys(adapters).length ? Object.keys(adapters).join(", ") : "(none configured)"}`);

// --- services ---------------------------------------------------------------
head("services");
const servicesDir = path.join(root, mioku.services_dir ?? "services");
if (fs.existsSync(servicesDir)) {
  for (const entry of fs.readdirSync(servicesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(servicesDir, entry.name);
    const hasPkg = fs.existsSync(path.join(dir, "package.json"));
    const hasRootEntry = ["index.ts", "index.js"].some((f) => fs.existsSync(path.join(dir, f)));
    const flags = [
      hasPkg ? null : "缺 package.json(会被静默跳过)",
      hasRootEntry ? null : "缺包根 index.ts/index.js(不会被加载)",
    ].filter(Boolean);
    log(`  ${entry.name.padEnd(20)} ${flags.length ? "⚠ " + flags.join(" + ") : "ok"}`);
  }
} else {
  log("  (no local services/ directory)");
}

// --- plugin dir -------------------------------------------------------------
head(`local plugins (${mioku.plugins_dir ?? "plugins"}/)`);
const pluginsDir = path.join(root, mioku.plugins_dir ?? "plugins");
if (fs.existsSync(pluginsDir)) {
  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(pluginsDir, entry.name);
    const entryFile = ["index.ts", "index.js"].map((f) => path.join(dir, f)).find((p) => fs.existsSync(p));
    let mismatch = "";
    const p = path.join(dir, "package.json");
    if (fs.existsSync(p)) {
      const sp = JSON.parse(fs.readFileSync(p, "utf8"));
      const short = String(sp.name ?? "").replace(/^mioku-plugin-/, "");
      if (short && short !== entry.name) mismatch = `包短名 "${short}" ≠ 目录名`;
    }
    if (entryFile) {
      const m = fs.readFileSync(entryFile, "utf8").match(/definePlugin\s*\([\s\S]{0,400}?\bname\s*:\s*["'`]([^"'`]+)["'`]/);
      if (m && m[1] !== entry.name) mismatch = `definePlugin.name "${m[1]}" ≠ 目录名`;
    }
    const flags = [
      entryFile ? null : "缺 index.ts/index.js",
      mismatch || null,
    ].filter(Boolean);
    log(`  ${entry.name.padEnd(20)} ${flags.length ? "⚠ " + flags.join(" + ") : "ok"}`);
  }
} else {
  log("  (no local plugins directory)");
}

// --- config / data ----------------------------------------------------------
head("config and data");
for (const d of ["config", "config/core", "config/service", "data"]) {
  const p = path.join(root, d);
  const n = fs.existsSync(p) ? fs.readdirSync(p).length : 0;
  log(`  ${d.padEnd(16)} ${fs.existsSync(p) ? `${n} entries` : "missing"}`);
}
const ac = path.join(root, "config/core/access-control.json");
if (fs.existsSync(ac)) {
  try {
    const cfg = JSON.parse(fs.readFileSync(ac, "utf8"));
    const count = (o: any) => (o ? Object.keys(o.plugins ?? {}).length + Object.keys(o.commands ?? {}).length : 0);
    log(
      `  access-control  global:${count(cfg.global)} groups:${count(cfg.groups ? { plugins: {}, ...cfg.groups } : null)} users:${Object.keys(cfg.users ?? {}).length} user(s)`,
    );
  } catch (e) {
    log(`  ⚠ access-control.json 解析失败: ${e}`);
  }
} else {
  log("  access-control.json 缺失 — core 插件尚未创建它，或该项目从未启动过");
}

// --- logs -------------------------------------------------------------------
head("logs");
const logsDir = path.join(root, "logs");
if (fs.existsSync(logsDir)) {
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.endsWith(".log"))
    .map((f) => ({ f, mtime: fs.statSync(path.join(logsDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime);
  log(`  ${files.length} log file(s); newest: ${files[0]?.f ?? "—"}`);

  if (files.length) {
    const tail = fs
      .readFileSync(path.join(logsDir, files[0].f), "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-15);
    const errs = tail.filter((l) => /\bERROR\b/.test(l)).length;
    const warns = tail.filter((l) => /\bWARN\b/.test(l)).length;
    log(`  tail: ${errs} error, ${warns} warn (last 15 lines)`);
    log();
    for (const l of tail) log(`    ${l}`);
  }
} else {
  log("  logs/ 不存在 — 项目可能从未启动过");
}

head("next");
log("  先看上面的 ⚠ 项；再看日志尾部的 ERROR/WARN。");
log("  需要更细的运行时信息时，把 mioku.log_level 提到 debug 再复现一次。");
log("  包级校验：");
log("    bun <skills>/mioku-plugin-dev/scripts/validate-plugin.ts <dir>");
log("    bun <skills>/mioku-service-dev/scripts/validate-service.ts <dir>");
log("    bun <skills>/mioku-adapter-dev/scripts/validate-adapter.ts <dir>");
