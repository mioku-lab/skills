---
name: mioku-code-style
description: Mioku coding conventions for any mioku-* package or the framework itself — package layout, file splitting, naming, TypeScript style, comment length, logging with ctx.logger, complexity and memory awareness, git behaviour, and when to bump a package version. Use when writing or reviewing code in the mioku monorepo or in mioku-plugin-* / mioku-service-* / mioku-adapter-* packages, or when the user asks about Mioku code conventions.
license: MIT
---

# Mioku code style

The conventions below are binding for new code in this ecosystem. They are deliberately
short: structure first, comments last.

## Structure

**Split by function, not by convenience.** A file should have one reason to exist. When a
file grows a second unrelated responsibility, move it to its own file or folder.

```
mioku-plugin-help/
├── index.ts            entry: definePlugin + setup only
├── theme.ts            presentation constants
├── config.md           WebUI config form definition
├── status/             one feature
│   ├── index.ts
│   ├── data-collector.ts
│   └── html-generator.ts
└── skills/             one feature (AISkill registration)
    ├── index.ts
    └── help.ts
```

Keep the entry `index.ts` thin — declaration and wiring. Push logic into named modules.

**Never pile unrelated logic into one file or one directory.** If you are adding to a file
and cannot name what that file is responsible for, create a new one.

## Naming

- Packages: `mioku-plugin-<short>`, `mioku-service-<short>`, `mioku-adapter-<short>`.
  `<short>` equals the folder name and the `name` inside the definition object.
- Files: `kebab-case.ts` for modules, `index.ts` for entry points.
- Types and interfaces: `PascalCase`. Public service interfaces are named `<Domain>Api`.
- Functions and variables: `camelCase`.
- **Abbreviate the way a person would.** `ctx`, `cfg`, `db`, `seg`, `req`, `res`, `opts`,
  `cb`, `i`, `n` are all fine and expected. Do not spell out `context` when the whole
  codebase says `ctx`; do not invent cryptic one-letter names for domain concepts.

## Types

- **Avoid `any` and `unknown`.** Give values a concrete type; narrow at the boundary where
  external data enters instead of letting it widen through your code.

## Comments

- No long explanatory blocks. No restating what the code already says.
- A comment is a marker for a non-obvious *reason*, at most roughly a dozen characters —
  `// 需要倒序剥除`, `// 避免重复注册`, `// 平台不返回该字段`.
- Document public API with a single-line JSDoc when the name alone is not enough:
  `/** 随机取一条一言 */`.
- If you feel the need for a paragraph of comment, the code should be split or renamed
  instead.

## Correctness and cost

- Think about time and space complexity before choosing a data structure. Per-message
  paths are hot; an `O(n)` scan over all groups on every message is a defect.
- Watch allocations and GC pressure on those hot paths — reuse, avoid building throwaway
  arrays and objects inside per-message handlers, and avoid unbounded caches (cap them and
  evict).
- Prefer streaming or batching for high-frequency writes; `lowdb` rewrites the whole file.

## Logging

- **Always use `ctx.logger`**, never `console.*`. It carries the plugin tag and writes to
  `logs/<timestamp>.log`.
- `info` marks **progress and lifecycle only** — "service ready", "loaded N plugins".
  Never per message, never per loop iteration.
- At `error`, log the **error code and message**. The user sees this level.
- Detailed diagnostics — stacks, request payloads, per-item failures — belong at `debug`
  or `trace`.
- Level ladder: `silent` · `error` · `warn` · `log` · `info` · `debug` · `trace`.
  (Note: `silent` and `log` exist in code, and a `fatal` level does **not** exist even
  though some docs list it.)

## Git

- **Never commit, `git add`, or stage anything unless the user explicitly asks.** Leave
  the working tree dirty and report what changed.
- Never rewrite history, force-push, or touch branches.

## Version bumps

Applies to whichever package actually changed (`mioku`, `mioku-plugin-*`,
`mioku-service-*`, `mioku-adapter-*`).

- **Do not bump on every edit.** Iterating on one feature, fixing your own just-written
  code, or any work the user has not committed yet is the *same* change — one bump at most,
  when it is actually done.
- Bump when the change has grown into something a consumer would care about: a new
  feature (minor), a fix to released behaviour (patch), or a breaking change to a call
  signature, config shape, capability contract, or route (major).
- A refactor that a consumer cannot observe is normally **not** worth a bump.
- When unsure, ask. Version numbers are a public interface.

## Decisions

Confirm with the user before: choosing an architecture, adding a runtime dependency,
changing a public type or exported interface, altering a capability contract, changing
default behaviour, or doing anything that writes to a live bot's data or a user's
accounts. Small, local, reversible edits do not need a round trip.

## References

- `references/layout-and-naming.md` — package layout, entry points, file and symbol naming
- `references/typescript-style.md` — the TypeScript subset used here, types, exports, errors
- `references/logging.md` — level choice, what belongs at each level, logger API
- `references/change-management.md` — git behaviour and the version-bump decision in detail
