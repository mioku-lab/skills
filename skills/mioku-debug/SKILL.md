---
name: mioku-debug
description: Diagnose Mioku runtime problems — a plugin that will not load, a missing service, an adapter that will not connect, commands that do not trigger, duplicate replies across bots, permissions that silently do nothing, capability errors, or config that does not hot-reload. Use when debugging Mioku behaviour from console output, the logs/ directory, the .log / .status / .adapter / .plugin commands, or the example playground.
license: MIT
---

# Debugging Mioku

Mioku hides two failure modes behind silence, and they cause most "it does not work"
reports:

- **Permission denial is invisible.** A command the sender may not use is dropped with no
  reply and no error.
- **Discovery rejection is quiet.** A package in `devDependencies`, or a local service
  without a `package.json`, never appears in the log at all.

Before hunting a bug, rule both out.

## Locate the layer first

```
services → plugins → adapters → commands → events → capabilities
```

Ask which layer could produce the symptom, and check that layer's precondition before
reading any code. The table below maps the usual symptom to the layer that owns it.

## Symptom → cause

| Symptom | Most likely cause |
|---|---|
| Plugin never loads; its name is absent from the log | Installed in `devDependencies`; or not listed in `mioku.plugins` |
| `Plugin canonical ID mismatch` | Package short name ≠ `definePlugin.name` ≠ folder name |
| Adapter rejected at startup | `apiVersion` is not `1`, or the name does not match the package short name |
| Adapter never discovered | Package is in `devDependencies`, not `dependencies` |
| `getService` returns `undefined` | Local service has **no `package.json`**; entry is not package-root `index.ts`/`index.js`; `init()` threw; wrong `services_dir` |
| `requireService` throws at startup | Provider loads later than the consumer — fix with `priority`, not with a retry |
| Command does not respond | `permission` not satisfied (**silent**); blocked by `access-control.json`; wrong prefix; a higher-priority command consumed the text |
| A `ctx.handle` listener never fires for a trigger that works as a command | The command manager consumed the message first |
| Opposite: a command never fires but the listener does | The same text is also registered via `ctx.handle` |
| Everything replies twice | Cross-adapter/multi-bot duplicate delivery; check `ctx.correlation(event)` and reply with `ctx.pickReplyBot(event)` |
| The @-mentioned bot stays silent | Dedup primary is the first arrival, not the mentioned bot — use `ctx.pickReplyBot` |
| `UnsupportedCapabilityError` | The adapter never registered that capability for this target; pre-check with `ctx.capabilities.supports(...)` |
| Messages silently do not send | `setup` ran before adapters started (`ctx.bot` is `undefined`); or the bot lacks platform permission |
| Config edit changes nothing | `registerConfig` was never called; the edit was to a **nested** object (replaced wholesale, not deep-merged); `updateConfig` returned `false` |
| Data disappears on restart | `db.data` was mutated without `await db.write()` |
| Plugin fails to load with a cron error | The cron expression is invalid — `ctx.cron` validates at registration and throws |
| Plugin's cleanup never seems to run | Shutdown has a **15 s** budget; slow cleanup is killed |
| `.adapter` / `.status` shows empty entries | The adapter never called `registerStatusProvider` |
| A poke / notice handler fires twice | Missing or incomplete `identity` in the adapter's event; `sub_type` and `operator_id` are used in the dedup key |
| Works on OneBot but not icqq | Route not adapter-qualified, or a platform-specific field assumed |

## Evidence, strongest first

1. **The console.** consola output with level, tag and timestamp.
2. **`logs/<timestamp>.log`.** A new file per launch, append-only, written by the same
   logger. The `.log` command reads the **most recently modified** file, so when comparing
   runs, check which file you are looking at.
3. **`mioku.log_level`.** Raise it to `debug` or `trace` to surface the detail that is
   deliberately not logged at `info`. Set it back afterwards — `trace` on a busy bot is
   heavy.
4. **`.log`** — the last 100 lines of the newest log file, forwarded as a merged-forward
   card with `info / warn / error` counts. This is what a user should paste.
5. **`.status`** and **`.adapter`** — runtime, bot and per-adapter status, including the
   statistics adapters report.
6. **`.plugin list`** — which plugins actually loaded.

`.status` and `.adapter` are readable by everyone by default; the rest of the core commands
(`.log`, `.plugin`, `.settings`, `.install`, `.restart`, `.exit`) are `master`-only.

## Reproduce without a real account

`mioku-adapter-stdin` is always installed and turns stdin lines into private messages:

```
mioku> .hello
```

That exercises the real command manager, permissions, event bus, capability binding and
reply path. For a bug that needs real platform data, use `example/` — every workspace
package is linked with `workspace:*`, so a restart picks up framework changes.

## Quick checks worth running first

```bash
bun run typecheck                     # shape-level errors
bun skills/skills/mioku-plugin-dev/scripts/validate-plugin.ts <dir>
bun skills/skills/mioku-service-dev/scripts/validate-service.ts <dir>
bun skills/skills/mioku-adapter-dev/scripts/validate-adapter.ts <dir>
```

These catch the naming, manifest, entry and packaging causes in the table above without
booting anything. Run them before adding log statements.

## References

- `references/diagnostics.md` — log files, log levels, core commands, what each surface tells you
- `references/troubleshooting.md` — the expanded symptom table, with the check for each cause

Related: `mioku-code-style/references/logging.md` for what belongs at each level when you
are the one adding the logging.
