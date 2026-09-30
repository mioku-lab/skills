# Mioku architecture

## Layer contracts

### Adapter — the only layer that knows a platform

Responsibility is symmetric:

- **Inbound:** translate a platform payload into a framework `Event`, fill `identity`
  with every strong identifier available (`message_id`, `native_event_id`, `timestamp`),
  then `context.dispatch(event)`. Adapters deliver **losslessly** and never drop events,
  never dedup.
- **Outbound:** register capability implementations on `AdapterContext`. A capability is
  the adapter's promise that "on this target, this operation is implemented".

Adapters also register bots and report status. They never contain business logic.

### Command manager — runs before the event bus

For each incoming message it walks registered commands in ascending `priority`, tries
`match → name → aliases[0] → …`, strips the configured prefixes (longest first), then
checks `permission` and `access-control`. The **first match consumes the message**.

Non-message events (poke, friend request, bot lifecycle) bypass the command manager and
go straight to the bus.

### Event bus — fan-out

Matches listener routes against the routes the adapter attached to the event, groups by
priority, and runs each group with `Promise.allSettled`. One failing listener never
blocks another. A listener registered on a coarse route (`message`) receives every
finer event because adapters emit the whole route chain.

### Plugin / service — where your code goes

Plugins react to events and own business logic. Services hold no event listeners; they
publish an `api` object that plugins pull from the service registry. A service is the
right answer whenever two plugins would otherwise duplicate the same capability.

## Route chains

An adapter builds routes from fine to coarse via `buildRoutes(adapter, ...parts)`. One
OneBot group message carries:

```
onebotv11:message.group
onebotv11:message
onebotv11
message.group
message
```

This is why `ctx.handle("message", …)` is platform-agnostic while
`ctx.handle("onebotv11:message.group", …)` is platform-specific **and** narrows the type
of `event.bot` to the concrete bot class.

## Startup sequence

```
1. discover services      services/ directory, then mioku-service-* in node_modules
2. load core plugin       priority -Infinity; system commands, access control, status
3. load user plugins      grouped by priority ascending, Promise.allSettled inside a group
4. start adapters         create() then start(); registers bots and capabilities
5. ready                  dispatch runtime:ready, then optional online push
```

Why the order is fixed:

- **Services before plugins** — a plugin's `setup` can call `getService` and expect an
  answer. `getService` returning `undefined` therefore means the service genuinely failed
  to load, not that it is late.
- **Plugins before adapters** — plugins must be able to register commands before any
  message can arrive. The cost is that `setup` has no bot.
- **Parallel within a priority group** — two plugins at the same priority have an
  unspecified `setup` order. Use `priority` (or `ctx.addService` + `requireService`) when
  one must precede the other.

## Shutdown sequence

```
1. dispatch runtime:shutdown
2. adapter.stop(reason) for each adapter
3. release adapter resources and gateways
4. unload plugins: run cleanup functions, then drop their listeners
5. clear capability and bot registries
6. driver.shutdown(), then service dispose()
```

Services dispose in reverse load order. The whole shutdown has a **15 s** budget; after
that the process is killed, so cleanup functions must be quick and must not depend on
network round-trips.

## Where data lives

| Path | Owner | Notes |
|---|---|---|
| `package.json` → `mioku` | framework config | prefix, owners, admins, plugins, log_level, adapters |
| `config/<plugin>/<name>.json` | user | hot-reloaded; the user may edit it by hand |
| `config/service/<name>/*.json` | user | service-owned config |
| `config/core/access-control.json` | user | per-plugin / per-command allow & block rules |
| `data/<plugin>/` | plugin | counters, caches, databases; never hand-edited |

`config/` and `data/` are the two directories that carry over when migrating a bot to
another machine.

## Package discovery

The loader reads the project's **`dependencies`** only and classifies by prefix.
A package installed into `devDependencies` or pulled in transitively is invisible — this
is the single most common "my plugin does not load" cause.

Plugin entry resolution order:

1. an explicit entry in the package's `mioku` field
2. `main` / `module` / `exports["."]`
3. fallback to `dist/index.mjs`, `dist/index.js`, `index.mjs`, `index.js`

Entries are imported through **jiti**, so TypeScript source works without a build step.
Shipping plain JS is still the safer production choice.
