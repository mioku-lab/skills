# Platform references

Links first — protocol details belong in the platform's own docs, not paraphrased here.

## OneBot v11

| Resource | Link | Use for |
|---|---|---|
| Protocol specification | https://onebot.dev/ | The normative event and action definitions |
| Specification source | https://github.com/botuniverse/onebot-11 | Event schemas, action list, segment definitions |
| NapCat API reference | https://napcat.apifox.cn/ | The de-facto implementation Mioku targets; richest action coverage |
| 幸运莉莉娅 API reference | https://api.luckylillia.com/ | Full OneBot 11 action list with request/response schemas, plus Milky and Satori variants and message-segment data models |
| NapCat docs | https://napcat.napneko.icu/ | Deployment, login, forward WebSocket setup |

`mioku-adapter-onebotv11` speaks the v11 protocol over WebSocket. When implementing a new
OneBot-compatible platform, start from the NapCat reference — it is what the shipped
adapter was written against, and it documents extensions beyond upstream v11.

### Notes when writing against OneBot v11

- Actions are `snake_case` (`send_group_msg`, `set_group_ban`); Mioku's capability methods
  are the camelCase equivalent. The adapter's job is exactly that translation.
- Responses are wrapped in `{ status, retcode, data, echo? }`. `retcode !== 0` is a failure
  even when the HTTP status is 200 — surface it, do not return `data` blindly.
- `message` arrives either as a segment array or as a CQ-code string depending on the
  implementation's `post_format`. Normalise both.
- The `at` segment carries `data.qq`, which is what Mioku's `ctx.mentionedBots` reads.
- Media may be delivered as a local path, a `file://` URI, or an HTTP URL. Handle all three
  before handing to `segment.image`.

## icqq

| Resource | Link |
|---|---|
| icqq documentation | https://icqq.pages.dev/ |
| Vendored source in this repo | `packages/mioku-adapter-icqq/vendor/icqq` |

icqq is a QQ protocol library rather than a protocol spec, so the adapter talks to its
client API directly and exposes it:

```ts
ctx.handle("icqq:message", async (event) => {
  await event.bot.sendLike(event.user_id);
  await event.bot.pickGroup(event.group_id);
  event.bot.client;   // the underlying icqq Client
});
```

Platform-specific methods like `sendLike`, `getCookie` and `pickGroup` are declared on
`IcqqBot` in `packages/mioku-adapter-icqq/src/bot.ts`, and registered into
`AdapterBotMap` so plugins get them typed. Check the vendored source when documenting a new
method — the pages.dev docs cover the client, not Mioku's wrapper.

icqq media can be `protobuf://…` local references rather than downloadable URLs. That is
why cross-adapter dedup deliberately does not hash video, voice and file payloads.

## QQ official bot

| Resource | Link |
|---|---|
| Official bot platform docs | https://bot.q.qq.com/wiki/ |

Distinct identity model: the official platform uses **openid**, not QQ numbers. The
framework does **not** bridge the two, so the same person appears as two different senders
across `qq-official` and `onebotv11`/`icqq`. Do not attempt nickname-based correlation —
see `mioku-core-dev/references/event-bus-and-dedup.md`.

Other differences worth remembering when writing or extending this adapter: markdown and
button segments are supported more richly than elsewhere, and passive-reply windows limit
how many messages may be sent in response to one event (the shipped adapter exposes
`passiveWindowMs` and `maxPassiveReplies` config for exactly that).

## stdin

`mioku-adapter-stdin` reads lines from standard input and dispatches them as private
messages. It is a system adapter, always installed, and it is the fastest way to exercise a
plugin end to end without a real account:

```
mioku> .hello
```

Use it for local verification before touching a live platform.

## Cross-platform checklist

When adding or changing an adapter, confirm:

- [ ] `kind`, `routes` and `identity` are complete — see `event-construction.md`
- [ ] `at` segments carry `data.qq` or `data.target`
- [ ] Every implemented capability is registered per `bot_id`, not globally
- [ ] Multi-account: one bot per account, each with its own capability targets
- [ ] A status provider is registered, so `.adapter` and `.status` are populated
- [ ] `AdapterBotMap` declares the bot type
- [ ] The package is in the consuming project's `dependencies`
- [ ] Reconnect is guarded against re-entrancy and stops cleanly on `stop()`
