---
name: mioku-developer
description: Entry point for Mioku bot framework development. Covers the layered architecture (adapter → command manager → event bus → plugin/service), the four package types (mioku-plugin-*, mioku-service-*, mioku-adapter-*, mioku itself), startup order and its traps, and routing to the right specialised skill. Use when the request mentions Mioku, mioku-plugin, mioku-service, mioku-adapter, definePlugin, defineAdapter, MiokuService, or the mioku repo, and it is not yet obvious which development skill applies.
license: MIT
---

# Mioku Developer

Mioku is a plugin-based chat bot framework. Platforms are reached through adapters
(OneBot v11 / icqq / QQ official / stdin); everything else is plugins and services.

**Read this skill, then load the one specialised skill the task needs.** Do not work
from memory of other bot frameworks — Mioku's loader, dedup and permission rules are
specific.

## Not to be confused with

Mioku has its own **AISkill** (`AISkill` / `AITool`) — a bundle of tools that a *plugin*
registers so the bot's LLM can call them at runtime. That is a feature of the `ai`
service, not the Agent Skills format this file uses. See
`mioku-plugin-dev/references/ai-tools.md`.

## Route the task

| Task | Load |
|---|---|
| Write, change, or review a plugin / command / event handler | `mioku-plugin-dev` |
| Expose a reusable capability that other plugins consume | `mioku-service-dev` |
| Connect a new platform, implement or extend a capability | `mioku-adapter-dev` |
| Change the framework itself, add a core command, touch the loader | `mioku-core-dev` |
| Conventions: layout, naming, comments, logging, version bumps | `mioku-code-style` |
| Something is broken, or behaves unlike the docs | `mioku-debug` |

Most requests are plugin work. Only reach for `mioku-core-dev` when the change is inside
`packages/mioku` itself.

## Layers

```
platform (QQ / OneBot / stdin)
      ↓  adapter        receives: platform event → unified Event
      ↓  command manager matches prefixes, aliases, priority, permission, access-control
      ↓  event bus      routes remaining events to listeners
      ↓  plugin         business logic — ctx.command / ctx.handle
         service        shared capability provider, pulled by plugins (off this path)
```

Two consequences worth internalising:

- **The command manager consumes a message before the bus sees it.** A message handled by
  `ctx.command()` never reaches `ctx.handle()`. Never register the same trigger text twice.
- **Adapters translate both ways.** Receiving builds an `Event`; sending goes through a
  *capability*, which the adapter implements per platform. Plugins call bot methods and
  never touch the platform.

## Four package types

| Prefix | What it is | Entry |
|---|---|---|
| `mioku-plugin-*` | Feature implementation | `index.ts` at package root |
| `mioku-service-*` | Reusable capability provider | `index.ts` at package root |
| `mioku-adapter-*` | Platform connection layer | `index.ts` at package root |
| `mioku` | The framework | `dist/` |

The short name (package name minus prefix) **must equal** the `name` inside
`definePlugin` / `defineAdapter` / `MiokuService`, and for local plugins the folder name.
A mismatch fails the load with `Plugin canonical ID mismatch`.

## Startup order and its trap

```
read mioku config → discover services → load core plugin (-Infinity)
  → load user plugins (priority groups, in parallel within a group)
  → start adapters → runtime:ready → optional online push
```

Plugins load **before** adapters. So inside `setup(ctx)`, `ctx.bot` is normally
`undefined` and no capability is registered yet. Anything that needs a live bot belongs
in a handler on `bot:connected` or `runtime:ready`, not in `setup`.

Shutdown is the reverse and is capped at **15 seconds** — never do slow work in a plugin
cleanup function.

## Always

These apply to every change in this ecosystem. `mioku-code-style` has the full set.

- **Never commit or `git add` on your own.** Leave changes in the working tree.
- **Do not bump a package version per edit.** Bump only when the change has grown into a
  real feature, a breaking change, or a refactor; repeated edits to one unfinished feature
  share a single bump. Never bump for work the user has not committed.
- **Log through `ctx.logger`**, never `console`. `info` marks progress only — it must not
  be per-message. Log the error code and message at `error`; push stack-level detail to
  `debug` / `trace`.
- **Split by function.** Do not pile unrelated logic into one file or one directory.
- **Confirm before large decisions** — architecture, new dependencies, anything that
  changes a public interface or touches a live bot's data.
- **Assume all three real adapters**: `onebotv11`, `icqq`, `qq-official`. Prefer
  adapter-qualified routes such as `ctx.handle("onebotv11:message.group", ...)` when a
  platform detail matters.

## References

- `references/architecture.md` — layer contracts, startup/shutdown sequence, why the order matters
- `references/glossary.md` — Mioku vocabulary, including the AISkill/skill naming collision
