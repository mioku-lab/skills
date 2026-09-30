# Events

## Routes

`ctx.handle(route, handler)` registers a listener. Routes are hierarchical — the more
specific the route, the fewer events arrive.

| Route | Receives |
|---|---|
| `message` | every message, all platforms |
| `message.private` / `message.group` | one conversation type |
| `notice` / `notice.group` | notifications |
| `request` / `request.friend` | friend and group requests |
| `meta_event` | lifecycle |
| `onebotv11:message.group` | only OneBot v11 group messages |
| `icqq:message.private` | only icqq private messages |

An array registers several routes at once:

```ts
ctx.handle(["message.group", "message.private"], async (event) => { ... });
```

## Route chains and type narrowing

Adapters attach a whole chain to each event — a OneBot group message carries
`onebotv11:message.group`, `onebotv11:message`, `onebotv11`, `message.group`, `message`.
Any layer matches.

Putting the adapter name in the route also **changes the type of `event.bot`**, so
platform-specific methods are available with no assertion:

```ts
ctx.handle("icqq:message", async (event) => {
  await event.bot.sendLike(event.user_id);
  event.bot.client;
});
```

Without a route prefix you get the union of bot types; narrow it with `bot.adapter`.

## Event kinds

| `kind` | Typical |
|---|---|
| `message` | private / group messages |
| `notice` | member changes, pokes, file uploads |
| `request` | friend and group join requests |
| `meta_event` | lifecycle |
| `adapter` | adapter-defined, including bot connection and runtime ready |

Notice and request subtypes differ in their fields — always check `event.notice_type` (or
`request_type`) before reading subtype-specific data:

```ts
ctx.handle("notice.group", async (event) => {
  if (event.notice_type === "group_poke" && event.user_id !== ctx.self_id) {
    await event.bot.sendGroupMsg(event.group_id, "别戳了别戳了");
  }
});
```

Requests can be answered directly:

```ts
ctx.handle("request.friend", async (event) => {
  if (event.comment?.includes("暗号")) await event.approve();
  else await event.reject("请输入暗号");
});
```

## Lifecycle routes

| Route | When |
|---|---|
| `bot:connected` | a bot connected — payload `{ bot }` |
| `bot:disconnected` | a bot dropped — `{ bot, reason? }` |
| `adapter:started` | an adapter started — `{ name }` |
| `runtime:ready` | all adapters started; `ctx.bots` is complete |
| `runtime:shutdown` | shutdown begins |

`ctx.onBot("connected" | "disconnected", cb)` is sugar for the first two. These routes are
the right place for anything that needs a live bot, since `setup` runs before adapters.

## Deduplication

A multi-adapter, multi-account runtime can receive the same logical message more than
once. The core marks later deliveries as duplicates, and a normal `ctx.handle` skips them:

```ts
ctx.handle("message", async (event) => {
  // runs once per logical message inside the dedup window
});
```

Prefix a route with `!` to bypass that filter and receive every delivery:

```ts
ctx.handle("!message", async (event) => {
  // every delivery, including duplicates
});
```

`!` bypasses only the fingerprint filter — the per-object `WeakSet` guard still applies.
`!` is **not** a permission mechanism and not a loop guard. If you use it you own
idempotency.

Windows: messages 15 s, notices and requests 60 s.

## Choosing the replying bot

Dedup marks the first arrival as primary. If a user @-mentions bot B but bot A's event
arrives first, `event.bot` and `event.self_id` point at **A**. Use:

| Call | Meaning |
|---|---|
| `ctx.pickReplyBot(event)` | the @-mentioned bot if connected, else primary, else `event.bot` |
| `ctx.mentionedBots(event)` | all connected bots that were @-mentioned |
| `ctx.botsForEvent(event)` | every bot that delivered this logical event |
| `ctx.correlation(event)` | the correlation record, readable even for duplicates |

`event.is_to_me` describes only "this event's own bot" and is therefore unreliable
cross-adapter — prefer `ctx.mentionedBots(event)`. The built-in `chat` plugin already
picks its speaker with `pickReplyBot`.

For per-bot semantics, combine `!` with `ctx.botsForEvent` and dispatch yourself.

## Listening order

Listener order comes from the registering plugin's `priority` (lower first), then
registration order. The core plugin is `-Infinity`, so it always runs first. One listener
throwing does not affect the others — the bus uses `Promise.allSettled` per priority group.

Command priority and listener priority are separate systems.
