# Change management

## Git

**Never commit, stage, or add files unless the user explicitly asks.** Your job is to make
the change and report it. The user decides when it becomes a commit.

Concretely, do not run:

- `git commit`, `git add`, `git stage`, `git stash`
- `git push`, `git rebase`, `git reset`, `git checkout -- <file>`
- `git tag`, `git merge`, `git cherry-pick`, branch creation or deletion

Safe and encouraged: `git status`, `git diff`, `git log` — read-only commands that tell
you what state the tree is in.

When you finish a change, report the files you touched and what changed. Do not offer to
commit as a default next step.

## Version bumps

Applies to every package in this ecosystem: `mioku`, `mioku-plugin-*`,
`mioku-service-*`, `mioku-adapter-*`.

### The rule

Bump **once per finished, consumer-visible change** — not once per edit.

A change is *not* finished while:

- the user has not committed it yet, or
- you are still iterating on the same feature, or
- you are fixing code you just wrote in this session.

All of that is one change. One bump, at the end, if it earns one.

A change *has* finished, and may earn a bump, when it has grown into something a consumer
would notice: a new feature, a behaviour fix, or a refactor that altered the shape of the
code others depend on.

### Which number

| Bump | When |
|---|---|
| **major** | Breaking. A call signature, exported type, capability contract, route, or config key changed in a way that requires consumers to update. |
| **minor** | New capability or option, backward compatible. |
| **patch** | Fix to released behaviour, no interface change. |
| **no bump** | Internal refactor with no observable effect; iteration on unreleased work; comment, docs or formatting changes. |

### Examples

| Situation | Action |
|---|---|
| Added a `weather` command to a brand-new plugin, then renamed it twice before the user committed | One bump, at the end, if the plugin is being published at all |
| Added `ctx.config.timeout` to an existing published plugin | minor |
| Fixed a crash when `group_id` was missing | patch |
| Renamed the service's `query()` to `fetch()` | major — consumers break |
| Split a 900-line `index.ts` into five modules, behaviour identical | no bump |
| Updated only `README.md` | no bump |

### When unsure

Ask. A version number is a public interface and users pin against it. Do not guess at
whether something counts as breaking — describe the change and let the user decide.

## Decisions that always need confirmation

- Choosing or changing the architecture of a feature
- Adding a runtime dependency
- Changing a public type, exported interface, or capability contract
- Changing default behaviour that existing users rely on
- Anything that writes to a live bot's data, a user's config, or an external account
- Deleting files the user did not ask you to delete

Small local edits — fixing a bug, renaming a private function, adjusting a log line — do
not need a round trip. Use judgement on blast radius, not on line count.
