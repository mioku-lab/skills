# Commands

`ctx.command()` registers a message command. It returns an unregister function which the
context also stores, so unloading the plugin removes it automatically.

## Fields

| Field | Default | Notes |
|---|---|---|
| `id` | `name` | Stable key used by `access-control.json` and the WebUI. |
| `name` | — | Primary name, and the only one shown in help / WebUI. |
| `aliases` | — | Extra string names. Trigger-only: not displayed, not part of `id`. |
| `match` | — | A `RegExp` or string matcher. When omitted, `name` is matched exactly. |
| `prefixes` | `["."]` | Prefix list, seeded from `mioku.prefix`. See below. |
| `permission` | `"member"` | `member` / `admin` / `owner` / `master`. |
| `priority` | `0` | Ascending — lower matches first. |
| `description` | — | Shown in help and the WebUI. |
| `usage` | — | Example, e.g. `"weather <城市>"`. |
| `handler` | — | The function. |

## Handler arguments

```ts
ctx.command({
  name: "translate",
  match: /^翻译\s+(.+)$/,
  async handler({ ctx, event, command, text, body, args, match }) {
    // ctx       plugin context
    // event     the message event
    // command   the registered command object (read-only)
    // text      raw plain text of the message
    // body      text with the prefix stripped
    // args      whitespace-split argument array
    // match     regex capture result, present only for a RegExp `match`
  },
});
```

## Matching order

For each incoming message the manager tries:

```
match  →  name  →  aliases[0]  →  aliases[1]  →  …
```

Prefixes are stripped **longest first**, so `/` is tried before the empty prefix.

## Prefixes

| Value | Effect |
|---|---|
| omitted | `["."]` (from `mioku.prefix`) |
| `["/", "#"]` | only those |
| `false` | prefix optional — both `weather` and `.weather` work |
| `[""]` | same matching as `false`, but help displays `.weather` instead of `weather` |

`prefixes: false` and `[""]` behave identically when matching; they differ only in how the
command is displayed to users. Use `false` to signal "this is meant to be typed bare".

`["#", "/", ""]` accepts `#help`, `/help` and `help`.

## Shorthand

When you only need a name and a handler:

```ts
ctx.command("ping", ({ event }) => event.reply("pong"), { description: "连通性测试" });

ctx.command(/^echo\s+(.+)$/, ({ event, match }) => event.reply(match![1]), {
  name: "echo",
  prefixes: ["."],
});
```

## Priority and conflicts

Lower `priority` wins; ties break on registration order. The first match **consumes** the
message. So register specific commands at a low number and broad catch-alls at a high one:

```ts
ctx.command({ name: "roll-d6",  match: /^roll\s+d6$/i, priority: 1 });
ctx.command({ name: "roll-d20", match: /^roll(?:\s+d(\d+))?$/i, priority: 10 });
```

Command priority is independent of plugin priority, and independent of listener priority.

## Permission

Enforced by the command manager at dispatch time. See `references/permissions.md` for the
role table. Two things to remember:

- **Denial is silent** — no reply, no error, by design, so the command's existence is not
  leaked. `ctx.isMaster(event)` and friends exist for non-command branches (cooldowns,
  confirmations), not for re-checking a command's own role.
- Privileged roles bypass `access-control.json` but **not** the command's `permission`.

## Unregistering

```ts
const off = ctx.command({ ... });
off();   // usually unnecessary — unload handles it
```

Only call it yourself if you are managing the command outside `setup`.

## Legacy

`mioku.help` and `mioku.accessHooks` in `package.json` are compatibility keys for old
plugins. New plugins declare everything through `ctx.command()` inside `setup`, which
feeds the help catalogue and access control automatically. Do not write prefix matching or
`ctx.isMaster(event)` gates by hand.
