# Runtime lifecycle

## Startup

```
start({ cwd })
 ├─ read mioku config from package.json
 ├─ serviceManager.discoverServices()      services/ dir + mioku-service-* in node_modules
 ├─ startRuntime()
 │   ├─ create Driver / EventBus / BotRegistry / CapabilityRegistry
 │   ├─ discoverAdapters()                 candidates from dependencies
 │   ├─ setupPlugins()
 │   │   ├─ load builtin core plugin       priority -Infinity
 │   │   └─ load user plugins              priority groups, Promise.allSettled per group
 │   └─ startAdapter() for each
 │       ├─ create(definition) → Adapter
 │       └─ adapter.start(context)
 │           ├─ registerBot / registerCapability
 │           ├─ dispatch adapter:started
 │           └─ dispatch runtime:ready
 └─ online push (mioku.online_push)
```

Two ordering guarantees plugins depend on:

1. **Services before plugins.** `getService` inside `setup` is authoritative — `undefined`
   means the service genuinely failed, not that it is late.
2. **Plugins before adapters.** Every command and listener is registered before a message
   can arrive. The cost: `setup` runs with no bot connected and no capability registered.

Parallel loading inside a priority group means same-priority plugins have an unspecified
`setup` order. Anything order-sensitive needs distinct priorities.

## Shutdown

```
runtime:shutdown
  → adapter.stop(reason) for each adapter
  → release adapter resources and gateways
  → unload plugins (cleanup functions, then drop listeners)
  → clear capability registry, bot registry
  → driver.shutdown()
  → service dispose(), in reverse load order
```

The whole sequence is capped at **15 seconds**, after which the process exits. Slow network
work in a cleanup path is a bug.

## Runtime objects

`MiokuRuntime` is the single owner of state: driver, bus, bots, capabilities, commands,
plugin registry, correlator. Plugin-facing `ctx` is a projection — a per-plugin, read-only
window built by the context factory in `src/runtime/mioku-context.ts`. The projection is
what makes `ctx.pluginName`, per-plugin cleanup tracking and per-plugin log tagging
possible.

When adding a capability to `ctx`, ask whether it belongs on the projection (plugin-visible,
safe) or on the runtime (internal). Leaking runtime internals through `ctx` is a
compatibility liability — every field added is a field you can never remove.

## Lifecycle events

| Event | Emitted | Payload |
|---|---|---|
| `adapter:started` | per adapter, after `start` resolves | `{ name }` |
| `bot:connected` | when an adapter registers a bot | `{ bot }` |
| `bot:disconnected` | on disconnect | `{ bot, reason? }` |
| `runtime:ready` | after all adapters started | — |
| `runtime:shutdown` | at the start of shutdown | `{ reason? }` |

These are dispatched as `adapter`-kind events on named routes, so they go through the same
bus as everything else and any plugin can listen. `ctx.onBot` is sugar over the first two.

## Config surface

Framework config lives in the project `package.json` under `mioku`:

| Key | Default | Meaning |
|---|---|---|
| `prefix` | `"."` | system command prefix |
| `owners` | `[]` | master ids; required in practice |
| `admins` | `[]` | admin ids |
| `plugins` | `[]` | enabled plugin names |
| `plugins_dir` | `"plugins"` | local plugin directory |
| `services_dir` | `"services"` | local service directory |
| `log_level` | `"info"` | silent / error / warn / log / info / debug / trace |
| `online_push` | `false` | notify the first owner on ready |
| `error_push` | `false` | push on error |
| `status_permission` | `"all"` | `all` or `admin-only` for `.status` / `.adapter` |
| `adapters` | `{}` | per-adapter config |
| `dedup` | — | `{ cross_adapter: boolean }` to toggle cross-adapter dedup |

Changing `package.json` requires a restart; `.settings` commands rewrite these fields at
runtime.

Note that the docs list `fatal` as a log level and omit `silent` and `log`. The code's
actual ladder is the one in `src/logger/types.ts` — treat that as the source of truth and
fix the docs when you touch them.
