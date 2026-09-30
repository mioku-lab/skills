# Event bus and event dedup

## Dispatch

`bus.dispatch(event)` does three things:

1. **Filter.** The command manager first decides whether a command already consumed the
   message. Then `setFilter` hooks decide whether a given listener may see the event.
2. **Match.** Compare each registration's route pattern against the event's route list.
3. **Group and run.** Group by priority ascending, then within a group run
   `Promise.allSettled` so one throwing listener cannot affect the others.

```ts
const matched = this.#matching(event);
for (const [priority, regs] of groupByPriority(matched)) {
  await Promise.allSettled(regs.map((reg) => reg.handler(event)));
}
```

## Matching rules

| Pattern | Matches |
|---|---|
| `message` | exactly `message` |
| `message.*` | `message`, `message.group`, `message.group.poke`, … |
| `*` | everything |
| `onebotv11:message.group` | exactly that route |

An event carries a whole chain built by `buildRoutes` (fine → coarse), so a coarse pattern
matches because one of the chain entries equals it. A OneBot group message carries
`onebotv11:message.group`, `onebotv11:message`, `onebotv11`, `message.group`, `message`.

## Filters

`bus.setFilter((registration, event) => boolean)` injects a global gate; returning `false`
skips that listener. The command manager uses it to apply access control per plugin source:

```ts
bus.setFilter((registration, event) => commands.shouldDispatch(registration.source, event));
```

`shouldDispatch` lets privileged users' events through, checks the plugin's command or
legacy access hooks, and consults `config/core/access-control.json`.

The practical effect: a plugin that registers a bare `ctx.handle("message")` is **still**
subject to access control. This is intentional — it stops an access-controlled plugin from
bypassing the rules by using a listener instead of a command.

## Registration

```ts
const off = bus.register("message", handler, {
  source: "plugin:my-plugin",   // appears in error logs
  priority: 10,
});
```

`ctx.handle` wraps this, stores the unregister function in the plugin's cleanup set, and
adds the `!`-route and WeakSet behaviour described below.

## Dedup

### Division of responsibility

| Layer | Duty |
|---|---|
| Adapter | Lossless delivery. Translate and fill `identity` with strong ids. **Never drop, never dedup.** |
| Core | Sole owner of policy. Register correlations at the transport boundary, mark duplicates, let each handler decide. |

It has to be the core because only the core sees both all adapters and all handlers. If an
adapter dropped an event, a `!`-registered handler could never recover it.

### Flow

```
platform event
  → adapter builds Event, fills identity
  → AdapterContext.dispatch()
      ├─ EventCorrelator.observe()      correlate + mark duplicates
      ├─ runtime bot-loop guard
      └─ EventBus.dispatch()            fan out unchanged
           └─ ctx.handle wrapper
                ├─ normal route: skip deliveries marked duplicate
                └─ "!" route:     no filtering, every delivery runs
```

`EventCorrelator` is a **runtime singleton** (not per handler) and can be disabled with
`mioku.dedup.cross_adapter`.

### Message key

```
m | message_type | conversation | sender | content signature
```

- **conversation** — `group_id` for groups, `user_id` for private. Prevents "the same person
  posted the same text in two groups" from being treated as one message.
- **sender** — `user_id` only, never a nickname. Nicknames change with group cards and differ
  across adapters, so using one causes both false positives and missed duplicates.
- **content signature** — normalised per segment (below).

### Content signature

| Segment | Signature |
|---|---|
| `text` | the text, truncated to 256 chars |
| `at` | the target id |
| `face` | the face id |
| `json` / `xml` / `ark` | parsed then **stably serialised** (keys sorted, layout whitespace dropped), hashed |
| `image` / `flash` | content hash (`md5`/`sha1`) first, then an md5 embedded in the filename, then a normalised URL |
| `video` / `record` / `file` | segment type only |
| `reply` | not part of the signature |

Structured cards and images are digested so that "one person sent two different cards in
quick succession" is not collapsed. Video, voice and file deliberately keep only the type:
icqq references them as `protobuf://…` while OneBot uses download URLs, so there is no
shared hash and adding one would break cross-adapter dedup.

### Notice and request keys

Include `event_type`, `notice_type` / `request_type`, `sub_type`, `group_id`, `user_id`,
`operator_id` and the event time.

### Windows

| Kind | Window |
|---|---|
| message | 15 s |
| notice / request | 60 s |

Inside the window, later deliveries with the same key are marked duplicate. After it, the
same content can be processed again.

Beyond `MAX_SIZE`, correlation groups are evicted in insertion order; evictions are counted
in the `evicted` statistic.

## Handler layer

```ts
ctx.handle("message", async (event) => {
  // once per logical message inside the window
});

ctx.handle("!message", async (event) => {
  // every delivery, including duplicates
});
```

`!` bypasses the fingerprint filter only. The per-object `WeakSet` guard still applies, so
the same `Event` object dispatched twice still reaches one handler once.

`!` is **not** permission and **not** a loop guard. After using it you own idempotency.

If a route array contains any `!` route, the whole registration bypasses dedup. Do not mix
`!` and normal routes in one array — split them.

## Correlation views

| Call | Returns |
|---|---|
| `ctx.correlation(event)` | the correlation record, readable even for duplicates |
| `ctx.botsForEvent(event)` | every bot that delivered this logical event |
| `ctx.mentionedBots(event)` | connected bots that were @-mentioned |
| `ctx.pickReplyBot(event)` | mentioned-and-connected → primary → `event.bot` |
| `ctx.correlationStats()` | `groups` / `observed` / `duplicates` / `evicted` |

Cross-adapter dedup gives the **first arrival** primary status. If a user @-mentions bot B
but bot A's delivery lands first, then `event.bot` and `event.self_id` are A. Anything that
replies based on `event.bot` alone will answer from the wrong account. `ctx.pickReplyBot`
exists to remove that ambiguity, and the built-in `chat` plugin uses it.

## Known boundaries

- **No cross-namespace correlation.** icqq and OneBot use QQ numbers; QQ official uses
  openid. The framework does not bridge them with nicknames, so one person is two senders
  across those namespaces. Do not "fix" this by adding nickname matching.
- **Media can degrade to type-only** when neither side exposes a stable identifier, so two
  different videos posted moments apart may be treated as one.
- `MAX_SIZE` eviction is insertion-ordered; a very high-throughput burst can evict a group
  before its window expires.
