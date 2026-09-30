# Mioku glossary

Short definitions, plus the terms that are easy to mix up.

| Term | Meaning |
|---|---|
| **adapter** | Package (`mioku-adapter-*`) connecting one platform. Translates events in, capabilities out. |
| **bot** | One connected account. A single adapter may hold several (multi-account). Methods on it come from bound capabilities. |
| **capability** | A typed contract (`message.send`, `member.ban`) with a name, a version, and request/response types. The adapter implements it per target. |
| **command** | A message trigger registered with `ctx.command()`. Handled by the command manager before the event bus. |
| **context (`ctx`)** | The per-plugin read-only projection of the runtime, passed into `setup`. |
| **driver** | Framework-level HTTP + WebSocket client handed to adapters. Replaceable, with unified timeouts and error types. |
| **gateway** | An adapter's own connection unit (for example one connection per bot). Distinct from the driver, which is the framework's network client. |
| **instance** | In the `ai` service: a provider + model binding that plugins actually call. |
| **listener** | A handler registered with `ctx.handle()` on a route. Runs after the command manager. |
| **plugin** | Package (`mioku-plugin-*`) or folder under `plugins/` holding business logic. |
| **provider** | In the `ai` service: one API connection (base URL, key, protocol). |
| **route** | A dotted path (`message.group`) optionally prefixed by an adapter name (`onebotv11:message.group`). |
| **segment** | One piece of a message (`text`, `at`, `image`, `reply`, …). Messages are arrays of segments, not strings. |
| **service** | A reusable capability provider (`mioku-service-*`) exposing an `api` object. No listeners. |
| **skill (Agent Skill)** | This file format: `SKILL.md` + supporting files, consumed by a coding agent. |
| **skill (AISkill)** | Mioku runtime concept: a named bundle of `AITool`s a plugin registers with the `ai` service so the bot's LLM can call them. |

## The naming collision

Two different things are called "skill":

- **Agent Skill** — `SKILL.md`, read by a coding agent (Codex, Claude Code, …) to learn how
  to work on Mioku. Static documentation. This repository.
- **AISkill** — `AISkill` / `AITool` from the `mioku` package. Registered at runtime by a
  plugin via `aiService.registerSkill(...)`, callable by the bot's model, optionally
  gated by `permission`. Documented in `mioku-plugin-dev/references/ai-tools.md`.

When the user says "add a skill to my plugin", they almost always mean the second.
When they say "skill" while asking about agent behaviour or this repository, they mean
the first.

## Roles

| Role | Who | Notes |
|---|---|---|
| `master` | QQ ids in `mioku.owners` | Highest. Only role that may run `.settings`, `.install`, `.restart`. |
| `owner` | master, plus the current group's owner | Group-scoped elevation. |
| `admin` | owner, plus `mioku.admins`, plus current group's admins | |
| `member` | everyone else | Default for commands. |

Role checks answer "who is this user". `access-control.json` answers "is this plugin or
command allowed here" and is a separate, finer mechanism. Privileged users bypass
access rules but **not** a command's own `permission`.

## Abbreviations seen in the codebase

`ctx` context · `bot` one account · `api` a service's public surface · `seg` message
segment · `cfg` config · `db` a lowdb store · `cb` callback · `opts` options ·
`req` / `res` capability request and response.
