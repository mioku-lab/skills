# Messages and segments

A message is an **array of segments**, not a string. Each segment has a `type` and `data`.

```ts
[ { type: "at", data: { qq: "12345" } }, { type: "text", data: { text: " 早啊" } } ]
```

`event.raw_message` is the concatenation of the text segments.

## Reading

```ts
const text = ctx.text(event);                 // plain text, trimmed by default
const ats = event.message.filterByType("at"); // all @ segments
const first = event.message.find((s) => s.type === "image");

import { atOf } from "mioku";
const target = atOf(event.message);           // first @ target, or undefined
```

Message event fields:

```ts
event.message;      // segment array
event.raw_message;  // raw text
event.message_type; // "private" | "group"
event.user_id;      // sender
event.group_id;     // group, for group messages
event.sender;       // { user_id, nickname, role }
event.is_to_me;     // this event's own bot was @-mentioned — see events.md for the caveat
event.quote_id;     // quoted message id, when replying
```

## Building segments

`ctx.segment` and the top-level `segment` export are the same builder:

```ts
segment.text("hello")
segment.at("12345")
segment.image("https://.../a.png")
segment.image("/tmp/a.png", { local: true })   // local path needs the flag
segment.image(buffer)                          // Buffer is base64-encoded automatically
segment.reply("message_id")
segment.video(url)
segment.record(url)
segment.file(path)
segment.face("1")
segment.forward("forward_id")
segment.node({ user_id, nickname, content })
segment.json({...})
segment.markdown("# 标题\n**markdown** 内容")
segment.button({ label, action, data })
segment.raw(type, data)
```

A local path without `{ local: true }` is sent to the platform as a URL — a frequent bug.

## Sending

`MessageInput` accepts a string, a single segment, or an array:

```ts
await event.reply("早上好");

await event.reply([segment.at(event.user_id), segment.text(" 早上好")]);

await event.reply([
  segment.image("https://example.com/miku.png"),
  segment.text("\n这是我们的初音"),
]);
```

`event.reply(input, quote = true)` replies with a quote by default. Pass `false` to send
without quoting.

To quote an arbitrary message, use `segment.reply` explicitly:

```ts
await event.bot.sendGroupMsg(event.group_id, [
  segment.reply(messageId),
  segment.text("你说得对"),
]);
```

## `ctx.match`

A keyword → response table, useful for short reactions. It replies with a quote by default;
pass `false` as the second argument to disable that.

```ts
ctx.handle("message", async (event) => {
  await ctx.match(event, {
    "ping": "pong",
    "/天气/*": async (matches, e) => `天气信息：${matches[0]}`,
    "/^roll$/": () => String(Math.floor(Math.random() * 100) + 1),
  });
});
```

Keys support three forms: exact text, `*` wildcard, and `/regex/`. A string value is sent
directly; a function value is called with the match result.

`ctx.match` is sugar over `ctx.handle`. It is not a command — it produces no help entry and
no permission check. Use `ctx.command()` when the user should be able to discover it.
