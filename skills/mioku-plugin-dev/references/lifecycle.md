# Plugin lifecycle

## Load and unload

The framework calls `setup(ctx)` on load. On disable, reload, or process exit it cleans up.

| Cleaned up for you | You must clean up |
|---|---|
| `ctx.handle` listeners | intervals and timeouts |
| `ctx.cron` tasks | sockets, database handles, file descriptors |
| `ctx.addService` registrations | background loops, child processes |
| `ctx.command` registrations | temporary files |

Put your own cleanup in the function `setup` returns. It may be async, and the framework
waits for it — but the whole shutdown is capped at **15 seconds**, so keep it fast and
offline.

```ts
async setup(ctx) {
  const timer = setInterval(() => ctx.logger.debug("heartbeat"), 60_000);

  ctx.cron("0 9 * * *", async (c) => {
    await c.noticeGroups(["123456789"], "记得喝水");
  });

  return () => {
    clearInterval(timer);   // framework does not know about this one
  };
}
```

Every registration API returns its own unregister function if you need to stop it early:

```ts
const off = ctx.handle("message", async (event) => {
  if (ctx.text(event).includes("别听了")) off();
});
```

## Cron

```ts
ctx.cron(expression, handler)   // node-cron, returns a ScheduledTask
```

| Expression | Meaning |
|---|---|
| `0 9 * * *` | daily at 09:00 |
| `30 8 * * 1-5` | weekdays 08:30 |
| `0 */2 * * *` | every two hours |
| `0 22 * * 0` | Sundays at 22:00 |
| `*/30 * * * * *` | every 30 s (six-segment form) |

Five segments are `minute hour day month weekday`; a sixth leading segment adds seconds.

**An invalid expression throws immediately at registration**, which fails the plugin load.
Never build an expression from a runtime string without testing it.

The handler receives `ctx` itself as the first argument, so `ctx.noticeGroups`,
`ctx.logger` and the rest are available unchanged. The second argument is node-cron's
`TaskContext` (`task.date`, `task.triggeredAt`, `task.dateLocalIso`).

A throwing handler is caught and logged; it does not stop future runs or affect other
plugins.

`ScheduledTask` gives `stop()`, `start()` and `getNextRun()`. Most plugins never need it —
unload stops registered tasks automatically.

## Bot connection

```ts
ctx.onBot("connected", async ({ bot }) => {
  ctx.logger.info(`bot ${bot.bot_id} 上线了`);
  await bot.sendGroupMsg("87654321", `bot ${bot.bot_id} 已上线`);
});

ctx.onBot("disconnected", ({ bot, reason }) => {
  ctx.logger.warn(`bot ${bot.bot_id} 掉线了：${reason ?? "未知原因"}`);
});
```

## The ordering trap

Plugins load **before** adapters start, so during `setup` there is no bot and no
capability:

```ts
async setup(ctx) {
  // ✗ ctx.bot is undefined here
  await ctx.bot?.sendGroupMsg("123456789", "插件加载完成！");

  // ✓ wait for a connection
  ctx.onBot("connected", async ({ bot }) => {
    await bot.sendGroupMsg("123456789", "插件加载完成！");
  });

  // ✓ or wait for full readiness
  ctx.handle("runtime:ready", () => {
    ctx.logger.info(`框架就绪，在线 bot：${ctx.bots.length} 个`);
  });
}
```

The same applies to cron: a bot may be offline when the task fires. Guard with `ctx.bot`, or
use `ctx.noticeGroups` / `ctx.noticeFriends` / `ctx.noticeOwners` — those log a warning and
no-op rather than throwing when nothing is connected.

## Lifecycle routes

| Route | When | Payload |
|---|---|---|
| `adapter:started` | an adapter started | `{ name }` |
| `bot:connected` | a bot connected | `{ bot }` |
| `bot:disconnected` | a bot dropped | `{ bot, reason? }` |
| `runtime:ready` | all adapters started, `ctx.bots` complete | — |
| `runtime:shutdown` | shutdown begins | `{ reason? }` |

Shutdown order is the reverse of startup: stop adapters → release resources and gateways →
run plugin cleanup and drop listeners → clear registries → shut the driver down and dispose
services in reverse load order.

## Priority

`definePlugin.priority` (default `100`, lower first) controls both load order and the order
in which a plugin's listeners receive events. Plugins in the same priority group load in
parallel with `Promise.allSettled`, so their `setup` order is **not** guaranteed.

When one plugin must register a service before another consumes it, either separate their
priorities or have the consumer use `requireService` and accept the hard failure.
