# Constructing events

This is the adapter's core boilerplate. A malformed event does not throw — it silently
fails to match routes, fails to dedup, or fails to be seen as a mention. Every field below
matters.

```ts
import { buildRoutes, createMessage, segment } from "mioku";
import type { MessageEvent } from "mioku";

function buildMessageEvent(bot: EchoBot, line: string): MessageEvent {
  const id = `echo:${Date.now()}:${Math.random().toString(16).slice(2)}`;

  return {
    kind: "message",
    type: "message",
    routes: buildRoutes("echo", "message", "private"),

    identity: {
      adapter: "echo",
      bot_id: BOT_ID,
      event_type: "message.private",
      message_id: id,
      timestamp: Date.now(),
    },

    self_id: BOT_ID,
    bot,
    time: Date.now(),
    raw: { line },

    message_type: "private",
    user_id: "echo-user",
    message_id: id,
    raw_message: line,
    sender: { user_id: "echo-user", nickname: "echo", role: "owner" },
    message: createMessage([segment.text(line)], line),

    is_to_me: true,
    reply: (input) => bot.sendMessage({ type: "private", user_id: "echo-user" }, input),
    recall: async () => {},
  };
}
```

## The parts you must not omit

### `kind`

One of `message`, `notice`, `request`, `meta_event`, `adapter`. The framework dispatches on
it and picks the corresponding type guard. A wrong `kind` means no listener ever matches.

### `routes`

Build with `buildRoutes(adapter, ...parts)` — it expands from fine to coarse:

```
echo:message.private
echo:message
echo
message.private
message
```

A plugin listening on any level receives the event. Hand-writing a single route string
breaks the coarse listeners that `ctx.handle("message", …)` depends on.

### `identity`

The event-level identifiers, and the **only** source the core correlator reads for
cross-adapter dedup. Fill every strong identifier the platform gives you:

| Field | Meaning |
|---|---|
| `adapter` | Adapter name |
| `bot_id` | The account that received it |
| `event_type` | `message.private`, `notice.group_increase`, … |
| `message_id` | Platform message id, when there is one |
| `timestamp` | Event time |

Adapters **never dedup**. They deliver losslessly and describe the event accurately; the
core decides what is a duplicate. Dropping an event in the adapter permanently removes it
from any `!`-registered handler.

### The `at` segment

Normalise platform mentions into an `at` segment with `data.qq` **or** `data.target`.
`ctx.mentionedBots(event)` depends on this to decide which connected bot was mentioned — so
without it, multi-bot and multi-adapter replies pick the wrong speaker.

### `bot` and `self_id`

The bot that produced the event. On `event.bot` plugins rely for replying, and dedup's
primary semantics make `event.self_id` "the first bot that delivered", not necessarily the
mentioned one. That is expected — provide accurate data and let `ctx.pickReplyBot` sort it
out.

### `reply` and `recall`

Convenience methods that forward to the bot's capabilities. `reply` should quote the source
message when the platform supports it.

## Other kinds

`notice` and `request` follow the same skeleton with `kind: "notice"` / `"request"` and
kind-specific fields (`notice_type`, `request_type`, `sub_type`, `operator_id`). Fill
`sub_type` and `operator_id` where the platform has them — the correlator keys on them, and
omitting them causes over- or under-deduplication.

## Multi-account adapters

Register one bot per account, each with its own `bot_id` in capability targets and status
providers. An adapter-level capability (no `bot_id`) is the fallback for anything not
account-specific.

## Reconnect

Reconnect loops belong in the adapter, not the framework. Guard against re-entrancy with a
flag, back off between attempts, and stop cleanly when `stop()` has been called:

```ts
let stopped = false;

ws.onClose(() => {
  if (!stopped) void connect();
});

async stop() {
  stopped = true;
  await ws?.close(1000, "adapter stop");
}
```

Use the driver for the socket so timeouts and shutdown are handled consistently.
