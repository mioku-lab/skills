# Troubleshooting, layer by layer

Each section gives the check to run before reading any code.

## Services

**Symptom:** `getService` returns `undefined`; the log says a plugin is missing a service.

Check, in order:

1. **Does the folder have a `package.json`?** A local service without one is skipped
   silently — it will not even appear in the "N services discovered" count. This is the
   single most common cause.
2. **Is the entry the package-root `index.ts` or `index.js`?** The `main` field is not
   consulted for local services. `src/index.ts` does not load.
3. **Is `init` exported as a function** on the default export? Otherwise: "invalid: missing
   init()".
4. **Did `init()` throw?** A throwing `init` fails the whole service; the framework logs it
   and the api is never registered. Look for the error immediately above the absence.
5. **Is the name right?** `mioku-service-sentence` provides `sentence`. A mismatch means the
   registry key is not what the consumer asked for.
6. **Is the consumer's `priority` lower than the provider's?** `requireService` runs in
   `setup`; if the provider has not loaded yet it throws. Fix the priorities rather than
   wrapping in a retry.

Verify with `mioku-service-dev/scripts/validate-service.ts`.

## Plugins

**Symptom:** the plugin does not appear at all.

1. **Is it in `dependencies`?** Not `devDependencies`, not transitively.
2. **Is it listed in `mioku.plugins`?** Discovery finds candidates; the list enables them.
3. **Does the short name equal `definePlugin.name`?** Otherwise
   `Plugin canonical ID mismatch`. For a local plugin the folder name must match too.
4. **Is there a `mioku` manifest warning in the log?** An unknown key means a typo, and the
   intended setting was ignored.
5. **Did `setup` throw?** Anything thrown during `setup` — including an invalid `ctx.cron`
   expression — fails the load.

**Symptom:** two plugins at the same `priority` behave inconsistently.

Same-priority plugins load in parallel; `setup` order is not defined. Separate their
priorities or register a service and consume it with `requireService`.

## Adapters

**Symptom:** no bots, no messages, `.adapter` empty.

1. **Is `apiVersion` exactly `1`?** Anything else is rejected outright with a startup error.
2. **Is the package in the consuming project's `dependencies`?** The most common cause.
3. **Does `name` equal the package short name?** `mioku-adapter-onebotv11` → `onebotv11`.
4. **Is it configured** under `mioku.adapters.<name>`? An adapter with no config may fail
   `validateConfig`.
5. **Did `start()` resolve?** A `connectTimeout` that is too low, or an unreachable host,
   fails the start and the adapter never registers a bot.
6. **Did it register a status provider?** Without one, `.adapter` shows an empty entry even
   when everything works.

Verify with `mioku-adapter-dev/scripts/validate-adapter.ts`.

## Commands

**Symptom:** typing the command does nothing.

Work down the matching pipeline:

1. **Prefix.** Default is `["."]` from `mioku.prefix`. `prefixes: false` accepts bare and
   prefixed; `[""]` matches the same but displays differently. The manager strips prefixes
   longest-first.
2. **Match order.** `match` → `name` → `aliases[0]` → … A `match` regex that does not match
   stops the chain even if `name` would have.
3. **Priority.** Lower wins, and the first match **consumes** the message. A broad command at
   a low priority can starve a specific one.
4. **Permission.** Denial is silent and does not reply. Check the sender's role against the
   command's `permission` by hand — there is no log line.
5. **Access control.** `config/core/access-control.json` can block a plugin or command id.
   Precedence is user > group > global, and within a scope `commands` beats `plugins`.
   Privileged roles bypass this — but not `permission`.
6. **Command `id`.** `access-control.json` keys on `id`, which defaults to `name` and is
   **never** an alias. Rules written against an alias silently miss.
7. **A listener ate it.** `ctx.handle("message")` registered on the same text runs
   *after* the command manager, so it cannot preempt — but a command registered on a coarser
   pattern can.

## Events

**Symptom:** a listener never fires for events you can see arriving.

1. **Route specificity.** `message` matches only the route `message`, not the subtree;
   `message.*` matches the subtree. A OneBot group message carries
   `onebotv11:message.group`, `onebotv11:message`, `onebotv11`, `message.group`, `message`,
   which is why a coarse `ctx.handle("message")` does work — but a *misspelled*
   intermediate route matches nothing.
2. **Adapter-qualified routes need that adapter.** `ctx.handle("icqq:message")` never fires if
   icqq is not connected.
3. **Dedup.** A normal route skips deliveries marked duplicate. If you expect every delivery,
   use `!message`.
4. **Filter.** Access control applies to listeners too. A plugin blocked by
   `access-control.json` receives nothing, even on a bare `ctx.handle("message")`.

**Symptom:** a handler fires twice.

- Two bots or two adapters delivered the same logical message and dedup did not collapse
  them. Check `ctx.correlationStats()`.
- Or the adapter's events lack `identity` fields: `event_type`, `timestamp`, `message_id`,
  `sub_type`, `operator_id` all feed the dedup key. An adapter that omits them produces
  uncorrelated duplicates.
- Or the same `Event` object matched multiple registrations — the `WeakSet` guard covers one
  handler per object, not one per route.

## Replies and multi-account

**Symptom:** the bot that was @-mentioned does not answer, but another one does.

Cross-adapter dedup gives primary status to the **first arrival**. `event.bot` and
`event.self_id` therefore point at the first bot to deliver, not the mentioned one. Use
`ctx.pickReplyBot(event)`, whose order is: mentioned-and-connected → primary → `event.bot`.
`event.is_to_me` describes only the event's own bot and is unreliable across adapters — use
`ctx.mentionedBots(event)`.

**Symptom:** the same person is treated as two users.

icqq and OneBot identify by QQ number; QQ official uses **openid**. The framework does not
bridge them. Do not attempt nickname matching — it is explicitly rejected in the correlator
because nicknames change with group cards.

## Capabilities

`UnsupportedCapabilityError` means the target has no registration for that capability.
Adapters register per target `{ adapter, bot_id, resource_id }`; a capability registered for
one `bot_id` is not available on another.

Pre-check instead of catching:

```ts
if (ctx.capabilities.supports(target, messageSend)) { ... }
else ctx.logger.warn("该平台不支持此能力，跳过");
```

Note that only the **built-in** capabilities get bot methods. A custom capability must be
invoked through `ctx.capabilities.invoke(...)` or `bot.sendApi(...)`.

## Config and data

**Config edit has no effect.**

- Was `registerConfig` called in `setup`? Without it the file is not registered and
  `updateConfig` returns `false`.
- Editing a **nested** object replaces it wholesale — there is no deep merge. Supply the
  whole object.
- Deleting a top-level key makes the default reappear on the next start; it does not stay
  deleted.

**Data lost on restart.** You mutated `db.data` without `await db.write()`. Mutations are
memory-only until written.

**Config hot-reload fires twice.** `updateConfig` writes to disk, the file watcher fires
`onConfigChange`, and assigning your local variable as well double-applies. Do not assign —
let the subscription own the state.

## Loading and shutdown

**An invalid cron expression fails the plugin load.** `ctx.cron` validates immediately, so
this is a load failure, not a runtime one.

**Cleanup seems not to run.** Shutdown is capped at 15 s; slow or network-dependent cleanup
is killed. Keep it local and fast.

**`.status` is empty.** `.status` and `.adapter` are readable by everyone by default; if
`status_permission` is `admin-only`, low-privilege users see nothing — that is policy, not a
bug.
