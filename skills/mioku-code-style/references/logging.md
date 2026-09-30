# Logging

## Always through `ctx.logger`

`ctx.logger` is scoped to the plugin, carries a tag, and writes both to the console and to
`logs/<timestamp>.log` — a new file per launch. `console.log` bypasses all of that and is
never acceptable in a plugin, service or adapter.

Services that have no `ctx` import the module-level `logger` from `mioku`, or take a
logger through their `init()` options.

## Choosing a level

| Level | Use for | Frequency |
|---|---|---|
| `silent` | disable everything | — |
| `error` | a real failure the user must know about | rare |
| `warn` | degraded but continuing (service missing, optional step skipped) | rare |
| `log` | plain output, no severity | occasional |
| `info` | **progress and lifecycle** | a few lines per plugin load |
| `debug` | per-operation detail needed to diagnose | free at info level |
| `trace` | per-item detail, payloads, loop contents | free at info level |

The active level comes from `mioku.log_level` in the project `package.json`, default
`info`. So `debug` and `trace` cost nothing until a user turns them on — that is exactly
where verbose detail belongs.

## Rules

**`info` is for progress, not for events.** Good:

```
ctx.logger.info("sentence 服务已就绪");
ctx.logger.info(`已加载 ${count} 个词条`);
```

Bad — this fires on every message and floods the log:

```
ctx.handle("message", async (event) => {
  ctx.logger.info(`收到消息: ${ctx.text(event)}`);   // ✗
});
```

If you need per-message visibility while developing, use `ctx.logger.debug`.

**At `error`, always log the error code and message.** The user reads this level, and an
error without its code cannot be diagnosed:

```
ctx.logger.error(`[core] 读取日志失败: ${error}`);
```

**Push detail down, not up.** Stacks, request bodies, per-item failures and retry
decisions go to `debug` or `trace`:

```
ctx.logger.debug(`请求体: ${JSON.stringify(body)}`);
ctx.logger.trace(`第 ${i} 条处理完成`);
```

## Logger API

```ts
ctx.logger.error(...args)   // and warn / log / info / debug / trace
ctx.logger.withTag("status")            // same level, extra tag
ctx.logger.child({ bot_id: "10001" })   // structured scope
```

Tagging matters once several features log from the same plugin: `[core]`, `[status]`,
`[sentence]`. Keep tags short and stable.

## Where log files live

`<project>/logs/<ISO timestamp>.log`, created on first write, one file per run. The built-in
`.log` command reads the **most recently modified** file and forwards the last 100 lines as
a merged-forward card, prefixed with `info / warn / error` counts. That summary is what a
user pastes when reporting a problem — which is why the levels above matter.
