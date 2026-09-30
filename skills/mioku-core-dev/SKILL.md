---
name: mioku-core-dev
description: Work on the Mioku framework itself, inside packages/mioku — runtime lifecycle, the loader and package discovery, event bus, command manager, capability registry, event correlator and dedup, driver, the builtin core plugin, and the CLI. Use when modifying mioku core source, adding or changing a core command, altering startup or shutdown order, changing plugin/service/adapter loading, or touching the workspace build, typecheck and docs tooling.
license: MIT
---

# Mioku core development

This skill is for changing **the framework**, not for building on it. If the request is
about a plugin, service or adapter, use those skills instead.

## Repository map

```
mioku/
├── packages/
│   ├── mioku/                    the framework (this skill)
│   ├── mioku-adapter-*/          four adapters
│   ├── mioku-plugin-*/           ~14 plugins
│   └── mioku-service-*/          ~10 services
├── example/                      runnable playground (all packages linked)
├── docs/                         VitePress site; docs/developer is the plugin-dev manual
├── mioku-webui/                  management UI, served on 127.0.0.1:3339
├── config/                       runtime config (core/access-control.json)
├── .mioku/                       bootstrap
└── official-registry.json        market index: plugin/service/adapter → npm name
```

There are **no tests** in this repository. Correctness is established by running the
framework. See `references/build-and-verify.md` — read it before making a behavioural
change.

## Toolchain

```bash
bun run build        # per package: tsdown (cjs + esm + dts)
bun run dev          # packages/mioku in watch mode (tsdown -w)
bun run typecheck    # bunx tsc --noEmit across the workspace
bun run start        # run example/
bun run docs:dev     # typedoc + vitepress
```

The core package builds with tsdown: `target: 'node24'`, entries `src/index.ts` and
`src/cli/index.ts`, `format: ['cjs','esm']`, `dts`, `sourcemap`, `treeshake`.
Note the inconsistency to be aware of — `package.json` declares `engines.node >= 22.18.0`
while the build targets node24. Do not "fix" one without agreeing on the other.

TypeScript config: `strict`, `module: ESNext`, `moduleResolution: bundler`, `types: ["bun"]`,
with path aliases `mioku` → `packages/mioku/src/index.ts`.

## Where things live in the core package

```
src/
├── start.ts              entry: start({ cwd })
├── index.ts              public surface — everything re-exported here
├── plugin/               definePlugin, MiokuPlugin
├── adapter/              defineAdapter, AdapterContext, registry, bot types
├── capabilities/         built-in capability definitions, by domain
├── runtime/              MiokuRuntime, ctx projection, bus, commands, permissions,
│                         bots, event-correlator, lifecycle, plugin state
├── loader/               discovery, manifest, package, plugin and adapter loaders
├── driver/               HTTP + WebSocket abstraction
├── services/             service manager, registry, config helpers, builtin refs
├── builtin/core/         the core plugin: system commands, access control, status
├── cli/                  `npx mioku` — scaffold, install, update
└── internal/             module scanner, data paths, exec, registry
```

Public API discipline: **anything a plugin, service or adapter may import must be
re-exported from `src/index.ts`.** Adding a module under `src/` without wiring it into the
index makes it invisible downstream, even though internal imports still work.

## Adding a core command

Core commands live in `src/builtin/core/commands/<name>.ts` and are registered from
`src/builtin/core/index.ts`.

```ts
export function registerLogCommand(ctx: MiokuContext): () => void {
  return ctx.command({
    name: "log",
    aliases: ["日志"],
    permission: "master",
    priority: -1000,
    description: "查看最近100条日志",
    handler: async ({ event }) => { ... },
  });
}
```

Conventions for a core command:

- **`permission: "master"`** is the default for anything administrative. Exceptions are
  `.status` and `.adapter`, gated by `mioku.status_permission`.
- **A very low `priority`** (e.g. `-1000`) so system commands win over user commands.
- **`aliases`** carry the Chinese name; `name` stays ASCII, because it becomes the
  `access-control.json` id.
- Export a `register<Name>Command(ctx)` returning the unregister function; let the core
  plugin's own cleanup handle it.
- Doing `.settings add-owner` style privilege changes requires master — never relax this.

Add the help entry to the list in `src/builtin/core/index.ts` so it appears in the command
catalogue.

## Invariants you must not break

1. **Services load before plugins; plugins load before adapters.** Plugins rely on
   `getService` being authoritative in `setup`, and on having registered their commands
   before any message can arrive.
2. **The command manager consumes matched messages before the bus.** Removing this makes
   every command also reach `ctx.handle("message")`, doubling handler invocations.
3. **Dedup lives in the core, never in adapters.** Adapters deliver losslessly; dropping an
   event there permanently removes it from `!`-registered handlers.
4. **`ctx` is a read-only projection.** Do not hand plugins the runtime object itself;
   every mutation path is deliberate.
5. **Plugin cleanup has a 15 s budget.** Never make shutdown wait on the network.
6. **`apiVersion` is the compatibility gate.** Bump it only for a genuinely breaking
   adapter-protocol change, and expect every shipped adapter to be rejected until updated.
7. **Access rules and `permission` are separate.** Privileged roles bypass
   `access-control.json` but must still satisfy a command's own `permission`.

## References

- `references/runtime-lifecycle.md` — exact startup and shutdown sequences, and why each step is ordered that way
- `references/loader.md` — discovery, validation, entry resolution, plugin load ordering
- `references/event-bus-and-dedup.md` — bus matching, filters, the correlator, dedup keys and windows
- `references/build-and-verify.md` — build, typecheck, and how to verify a change with no test suite
