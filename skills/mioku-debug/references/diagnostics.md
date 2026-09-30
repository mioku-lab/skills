# Diagnostics

## Where evidence comes from

### Console

consola output with a coloured level, an optional tag and a timestamp. Plugins log through
`ctx.logger`, which carries the plugin tag, so `[core]`, `[status]` and `[help]` are
distinguishable in one stream.

### Log files

`<project>/logs/<ISO timestamp>.log`, one file per launch, appended by the same logger that
writes the console. The format is `[iso] [LEVEL] [tag] message`.

The `.log` command reads the **most recently modified** `.log` file — not necessarily the
one from your current run if an older file was touched. When comparing runs, confirm which
file you are reading before drawing conclusions.

Because every launch creates a new file, `logs/` grows without bound. That is a known
housekeeping gap, not a bug to work around in a plugin.

### Log levels

| Level | Rank | Use |
|---|---|---|
| `silent` | -1 | everything off |
| `error` | 0 | real failures |
| `warn` | 1 | degraded but continuing |
| `log` | 2 | plain output |
| `info` | 3 | progress and lifecycle (default) |
| `debug` | 4 | per-operation detail |
| `trace` | 5 | per-item detail |

Set via `mioku.log_level` in the project `package.json`. Changing it requires a restart.

Two things to know:

- The docs list a `fatal` level. **It does not exist.** The ladder above is the code's.
- `info` is deliberately not per-message. If you need per-message visibility, raise the
  level to `debug` rather than adding `info` lines — that is the design intent, and it also
  means `debug`/`trace` cost nothing by default.

### Core commands

| Command | Permission | Tells you |
|---|---|---|
| `.log` | master | Last 100 lines of the newest log file, forwarded as a card with `info/warn/error` counts |
| `.status` | all (or `admin-only`) | Runtime status: uptime, message counts, bot list |
| `.adapter` | all (or `admin-only`) | Per-adapter and per-bot status, from the adapters' status providers |
| `.plugin list` | master | Which plugins actually loaded |
| `.plugin reload <name>` | master | Reload one plugin in place — the fastest edit/test loop |
| `.settings` | master | Rewrite `owners` / `admins` in `package.json` |

`.status` and `.adapter` read the data adapters publish through `registerStatusProvider`.
An adapter that never registers one shows an empty entry — that is the adapter's gap, not a
framework failure.

`.plugin reload` is the loop to prefer when iterating: it re-runs `setup` and the cleanup
function, so it also verifies that your cleanup is correct.

### What each surface answers

| Question | Surface |
|---|---|
| Did the package get discovered at all? | Startup log; `.plugin list` |
| Did validation reject it? | Startup log — a specific message per cause |
| Did `setup` run? | Your own `info` line, or `.plugin list` |
| Did the service load? | Startup log ("N services discovered"), plus the service's own `info` |
| Did the adapter connect? | `.adapter`; `bot:connected` handler output |
| Did the command match? | Only indirectly — add `debug`, since a non-match is silent |
| Was a command denied by permission? | Not logged by design; check the role table manually |
| Was a message deduplicated? | `ctx.correlationStats()` — `observed` vs `duplicates` |
| Why did the wrong bot reply? | `ctx.correlation(event)` and `ctx.mentionedBots(event)` |

## Instrumenting without polluting

When you add temporary logging, put it at `debug` or `trace` and remove it before
finishing. An `info` line inside a per-message handler is the single most common cause of
an unreadable log, and it survives into released plugins.

If a problem only reproduces in production, leave the `debug` line in place permanently —
`debug` is free at the default level, so that is exactly what it is for.
