# Loader: discovery, validation, entry resolution

## Discovery

The loader reads the project `package.json` → **`dependencies` only** and classifies by
prefix:

| Prefix | Class |
|---|---|
| `mioku-plugin-*` | plugin candidate |
| `mioku-adapter-*` | adapter candidate |
| `mioku-service-*` | handled by the service manager |

The **short name** is the package name minus its prefix: `mioku-plugin-60s` → `60s`. That
short name is the plugin name, the service registry key and the adapter name.

Two consequences worth remembering when debugging:

- A package in `devDependencies`, or reached only transitively, is invisible.
- Local plugins are resolved **first** from `plugins_dir` (default `plugins/`), then from
  dependencies. A local folder shadows the installed package of the same name.

## Validation

Before loading a candidate:

1. **Name agreement.** The package short name must equal `definePlugin.name` /
   `defineAdapter.name` / `MiokuService.name`. A mismatch for a plugin raises
   `Plugin canonical ID mismatch`.
2. **`apiVersion` (adapters only).** Must equal the framework's current requirement (`1`).
   When an adapter protocol change is breaking, bump the required value so stale adapters
   are rejected at load rather than failing at runtime.
3. **Manifest legality (plugins).** `mioku` recognises `services`; `help` and `accessHooks`
   are legacy-compatible. Unknown keys are ignored **with a warning** — a warning here
   almost always means a typo, so treat it as an error when reviewing.

## Entry resolution

```
1. an explicit entry in the package's mioku field
2. main / module / exports["."]
3. fallback: dist/index.mjs, dist/index.js, index.mjs, index.js
```

Entries are imported through **jiti**, so TypeScript sources load without a build step —
`main: "index.ts"` is legitimate. Production packages should still ship built JS to avoid
compiling on every consumer's startup.

For **services specifically** the entry rule is stricter: only the package-root
`index.ts` / `index.js` is recognised, and the `main` field is not consulted. A service
whose entry is elsewhere loads as "entry missing".

## Plugin load order

```
builtin core plugin        priority -Infinity, always first
user plugins               grouped by priority ascending
                           Promise.allSettled inside each group
```

`mioku.plugins` is the enable list. For each name the loader looks in `plugins_dir` first,
then in dependencies.

Because groups load in parallel, two plugins at the same priority have no defined `setup`
order. Cross-plugin dependencies must be expressed through distinct priorities, through
`ctx.addService` + `requireService`, or through the `dependencies` field on the definition.

## Runtime plugin management

The core plugin exposes:

```
.plugin list              enabled plugins
.plugin enable <name>     enable and persist into mioku.plugins
.plugin disable <name>    disable
.plugin reload <name>     reload in place
```

Enable/disable writes back to `package.json`, so those commands are `master`-only by
default and must stay that way.

## Service discovery

Separate from the plugin path:

```
1. <project>/services/                 directory; each subfolder is a service
2. node_modules/mioku-service-*        npm packages
```

Both feed one registry. **On a name collision the npm package wins** — a local override of
an installed service does not work, which surprises people who expect the plugin's
local-first behaviour.

A local service folder **must contain a `package.json`** or it is skipped silently.

## Where to change what

| Change | File |
|---|---|
| Discovery rules, prefix handling | `src/loader/package.ts`, `src/loader/manifest.ts` |
| Plugin loading and priority groups | `src/loader/plugin.ts` |
| Adapter loading and validation | `src/loader/adapter.ts` |
| Service scanning and lifecycle | `src/services/manager.ts` |
| Entry resolution | `src/loader/index.ts` |

When you change discovery or validation, check the three consumers together — plugin,
adapter and service paths share the conventions but not the code.
