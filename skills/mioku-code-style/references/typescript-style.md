# TypeScript style

## Baseline

- ESM only. `"type": "module"` in every package.
- Target Node 22+ (the framework runs on Bun and Node). Use modern syntax — optional
  chaining, nullish coalescing, `structuredClone`, top-level `await` where it helps.
- `strict` is on at the repo root. Never silence it with `any`; give the value a real type
  instead of widening it to `unknown`.

## Quotes, semicolons, whitespace

The repository is **not** uniformly formatted and there is no enforced formatter, so:

- **Match the file you are editing.** Do not reformat a whole file to satisfy a personal
  preference — it buries the real change in noise.
- For **new** files, double quotes and semicolons are the dominant style in the plugin,
  service and adapter packages. Two-space indent, trailing commas in multiline literals.
- `index.ts` entries and the core package's `logger/` module use the opposite (single
  quotes, no semicolons). Follow the neighbours.

## Types

- **Avoid `any` and `unknown`.** Give values a concrete type. `any` disables checking
  outright; `unknown` is safer but still pushes the problem downstream. Where a value truly
  arrives from outside — a platform payload, JSON read off disk, `JSON.parse`, a
  model-supplied tool argument — accept `unknown` at that one boundary, narrow it
  immediately, and never let it travel through your own code.
- Public types live in the `mioku` package and are re-exported from its top level. Import
  them with `import type`:
  ```ts
  import { definePlugin } from "mioku";
  import type { MiokuContext, AITool, AISkill } from "mioku";
  ```
- A service's public surface is a named, exported interface. Consumers import the type
  from the service package so the object is typed end to end.
- Prefer interfaces for object shapes that cross a package boundary; `type` for unions and
  aliases.
- Type registries use declaration merging, not casts:
  ```ts
  declare module "mioku" {
    interface AdapterBotMap {
      echo: EchoBot;
    }
  }
  ```
  Once an adapter registers here, plugins get `event.bot` narrowed automatically and no
  assertions are needed.
- Reach for `as` only when nothing else works — for example a bot obtained from a service
  rather than from an event or `ctx.bots`, where narrowing cannot apply.

## Exports

- One default export when the file is a plugin, service or adapter definition.
- Named exports for helpers, types and capability constants.
- Do not re-export an entire module's internals from `index.ts`; export the definition and
  the public types consumers actually need.

## Errors

- Throw `Error` subclasses with a clear message; the framework already defines typed
  network and capability errors (`HttpRequestError`, `WebSocketConnectTimeoutError`,
  `UnsupportedCapabilityError`, `DriverShutdownError`). Reuse them.
- Never swallow an error silently. If continuing is correct, log it at the level that
  matches its severity and say why in a short comment.
- Catch narrowly. A bare `catch` around a large block hides the next bug.

## Complexity and memory

- Per-message handlers are the hot path. Keep them allocation-light and avoid per-message
  scans over global collections.
- Bound every cache: a `Map` without an eviction rule is a leak in a long-running bot.
- Prefer lazy work — compute on first use rather than at load, when the cost is not always
  paid.
- Release what you allocate: close sockets, clear intervals, `dispose()` services. Plugins
  return a cleanup function; anything not covered by `ctx.handle` / `ctx.cron` /
  `ctx.addService` must be cleaned up by hand.

## Don'ts

- Do not restate version or description inside `definePlugin` / `MiokuService` — those come
  from `package.json`.
- Do not write the legacy `mioku.help` or `mioku.accessHooks` manifest keys. Register
  commands with `ctx.command()` inside `setup` instead.
- Do not add a `README.md`, changelog or duplicated quick reference inside a **skill**
  folder; that is a skill convention, not a code one.
