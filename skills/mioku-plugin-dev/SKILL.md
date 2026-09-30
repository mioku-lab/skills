---
name: mioku-plugin-dev
description: Develop, modify, or review Mioku plugins — mioku-plugin-* packages and local plugins/ directories. Use when the task involves definePlugin, ctx.command, ctx.handle, ctx.match, ctx.cron, ctx.onBot, event routes, message segments, plugin config or data storage, config.md forms, plugin permissions, access-control.json, publishing to npm, or registering AISkill / AITool and ChatRuntime with the ai service.
license: MIT
---

# Mioku plugin development

A plugin is a `mioku-plugin-*` package or a folder under `plugins/`. It exports one
`definePlugin` object. The framework calls `setup(ctx)` on load and your returned cleanup
function on unload.

## Minimal plugin

```ts
import { definePlugin } from "mioku";

export default definePlugin({
  name: "hello",
  async setup(ctx) {
    ctx.command({
      name: "hello",
      aliases: ["你好"],
      description: "打招呼",
      async handler({ event, args }) {
        await event.reply(`你好呀，${args.join(" ") || "世界"}`);
      },
    });

    return () => {
      ctx.logger.info("hello 插件已卸载");
    };
  },
});
```

Enable it in the project `package.json`: `"mioku": { "plugins": ["hello"] }`.

Only `name` is required. `priority` (default `100`, lower loads first) and `dependencies`
are optional. Version and description come from `package.json` — do not restate them here.

## First decision: command, handler, or match

The command manager runs **before** the event bus and consumes any message it matches. A
message handled by `ctx.command()` never reaches `ctx.handle()`.

| Use | When |
|---|---|
| `ctx.command()` | A user-typed instruction with a prefix, alias, permission, and help entry. This is the default. |
| `ctx.handle("message", …)` | Free-form reactions that are not commands — keyword triggers, conversational hooks, anything with no place in `.help`. |
| `ctx.match(event, {...})` | A quick keyword → response table. Sugar over `handle`, not a command. |

**Never register the same trigger text as both a command and a handler.** One of them will
win and the other will silently never fire.

Use `ctx.handle()` for everything that is not a message: pokes, join requests, media
notices, bot lifecycle.

## Hard rules that are easy to get wrong

1. **`name` must equal the folder name** for local plugins, and the package short name for
   published ones. Otherwise the load fails with `Plugin canonical ID mismatch`.
2. **Discovery reads `dependencies` only.** A plugin in `devDependencies` is invisible.
3. **`setup` runs before adapters start.** `ctx.bot` is normally `undefined` there, and no
   capability is registered yet. Do bot-dependent work in `ctx.onBot("connected", …)` or
   `ctx.handle("runtime:ready", …)`.
4. **Permission denial is silent.** A command whose `permission` the sender fails is
   dropped without a reply, so it is not a bug when nothing happens.
5. **`aliases` are trigger-only.** They never appear in help or the WebUI, and never become
   the command `id` — `access-control.json` still keys on `name`.
6. **`ctx.cron` validates immediately.** An invalid expression throws during load and takes
   the whole plugin down.
7. **Framework-managed cleanup.** `ctx.handle`, `ctx.cron` and `ctx.addService` are
   unregistered automatically. Everything else — intervals, sockets, file handles — must be
   cleaned up in the function `setup` returns.

## Supporting multiple adapters

Mioku ships `onebotv11`, `icqq` and `qq-official` as first-class adapters. A plugin should
work on all three unless the feature is genuinely platform-specific.

**Prefer an adapter-qualified route** when you need a platform-specific field or method —
it also narrows `event.bot` to that platform's bot type, so no casts are needed:

```ts
ctx.handle("onebotv11:message.group", async (event) => {
  await event.bot.getCookie("qun.qq.com");
});

ctx.handle("icqq:message", async (event) => {
  await event.bot.sendLike(event.user_id);
});
```

For platform-agnostic logic, listen on the coarse route and branch on `bot.adapter`, which
TypeScript narrows automatically:

```ts
ctx.handle("message", async (event) => {
  for (const bot of ctx.bots) {
    if (bot.adapter === "icqq") await bot.sendLike(bot.bot_id);
    else if (bot.adapter === "onebotv11") await bot.getCookie("qun.qq.com");
  }
});
```

Guard platform-only calls with a capability check so the plugin degrades instead of
throwing: `ctx.capabilities.supports(target, messageSend)`. When several bots may have
received the same message, reply to the right one with `ctx.pickReplyBot(event)` rather
than `event.bot`.

## Deliverables for a plugin

Ship these together, not just `index.ts`:

| File | Required | Notes |
|---|---|---|
| `index.ts` | yes | entry at package root |
| `package.json` | yes | `main: "index.ts"`, `type: "module"`, `keywords: ["mioku"]`, `mioku.services`, `peerDependencies.mioku` |
| `README.md` | yes | what it does, commands, config, install |
| `config.md` | if it has config | WebUI form definition; falls back to a JSON editor without it |
| AISkill | if it should be model-callable | one skill with several tools, registered on the `ai` service |

Keep the number of AISkills low. **One skill with several tools** that map to different
plugin functions is better than several single-tool skills — the model picks a tool, and a
smaller skill catalogue means less context spent on routing. See
`references/ai-tools.md`.

## References

- `references/commands.md` — every `ctx.command` field, matching order, prefixes, priority
- `references/events.md` — routes, event kinds, dedup, multi-bot semantics
- `references/messages.md` — message segments, replies, quoting, text extraction
- `references/config-data.md` — config vs data, config service, `createStore` / `createDB`, `config.md`
- `references/lifecycle.md` — `setup`, cleanup, `ctx.cron`, `onBot`, runtime events
- `references/permissions.md` — roles, `permission`, `access-control.json`
- `references/ai-tools.md` — `AITool` / `AISkill`, registration, permissions, ChatRuntime
- `references/publish.md` — package.json checklist and the `mioku` manifest field

Script: `scripts/validate-plugin.ts` (manifest, naming and packaging checks).
