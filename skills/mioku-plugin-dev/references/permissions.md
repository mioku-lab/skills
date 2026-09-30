# Permissions and access control

Two independent layers:

- **`permission`** on a command answers *who is this user* in the current context.
- **`config/core/access-control.json`** answers *is this plugin or command allowed here*,
  per user, per group, or globally.

## Roles

Declared in the project `package.json` under `mioku`:

| Source | Role |
|---|---|
| `mioku.owners` | `master` — highest |
| current group's owner | `owner` — only inside that group |
| `mioku.admins`, or current group's admins | `admin` |
| everyone else | `member` |

Mapping to a command's `permission`:

| Value | Who may trigger |
|---|---|
| `member` | everyone |
| `admin` | master, configured admins, group owner, group admins |
| `owner` | master, or the current group's owner |
| `master` | only ids in `mioku.owners` |

```ts
ctx.command({ name: "weather", permission: "member", handler: ... });
ctx.command({ name: "stats",   permission: "admin",  handler: ... });
ctx.command({ name: "shutdown", permission: "master", handler: ... });
```

**Denial is silent** — the handler never runs and the user gets no reply, so a low-privilege
user cannot discover that the command exists.

## Predicate helpers

Use these for non-command branches only: poke callbacks, a second check after a keyword
match, cooldown exemptions. Re-checking a command's own `permission` inside its handler is
redundant.

| Method | True when | Equivalent `permission` |
|---|---|---|
| `ctx.isMaster(event)` | sender is in `mioku.owners` | `master` |
| `ctx.isOwner(event)` | owner, or current group's owner | `owner` |
| `ctx.isAdmin(event)` | owner, configured admin, group owner or admin | `admin` |
| `ctx.isOwnerOrAdmin(event)` | same as `isAdmin` | `admin` |
| `ctx.hasRight(event)` | same as `isAdmin` | `admin` |

Finer-grained: `ctx.isEventGroupOwner(event)`, `ctx.isEventGroupAdmin(event)`,
`ctx.isEventAdminConfigOnly(event)` for the configured list only, and `ctx.toUserId(event)`
to flatten an event to a user id.

The framework extracts the sender id from several event shapes (`user_id`,
`sender.user_id`, bare ids) so adapters' structural differences do not leak into your code.

## access-control.json

Created by the core plugin on first start at `config/core/access-control.json`. Rules are
per scope, and each scope holds two levels: `plugins` (whole plugin) and `commands`
(per command id, then per sub-key).

```json
{
  "version": 1,
  "global": {
    "plugins": { "music": { "action": "block" } },
    "commands": {}
  },
  "groups": {
    "123456789": {
      "plugins": { "impact": { "action": "block" } },
      "commands": { "weather": { "上海天气": { "action": "allow" } } }
    }
  },
  "users": {
    "10001": {
      "commands": { "weather": { "查询": { "action": "block" } } }
    }
  }
}
```

- `version` is always `1`.
- Scopes: `global`, `groups` (keyed by group id string), `users` (keyed by user id string).
- The only rule field is `action`: `allow` or `block`.
- **No rule means allowed.** An empty file allows everything.

Precedence: **user > group > global**, and within one scope **`commands` > `plugins`**.

The command id is the `id` from `ctx.command()`, which defaults to `name` — aliases are
never ids, so `access-control.json` keys on the primary name.

Privileged roles (master, admins, group owner, group admins) bypass access rules entirely —
but they do **not** bypass a command's own `permission`.

The file can be edited by hand or through the WebUI; both are equivalent.

## Core command defaults

System commands are `master`-only: `.plugin`, `.settings`, `.install`, `.uninstall`,
`.restart`, `.log`, `.update`, `.exit`.

Exceptions: `.status` and `.adapter` are visible to everyone by default. Setting
`status_permission` to `"admin-only"` in `mioku` restricts them.

`.settings add-owner` / `remove-owner` / `add-admin` / `remove-admin` rewrite the
`owners` / `admins` arrays in `package.json` — it can grant privileges, which is why it is
locked to master. `remove-owner` refuses to remove the first owner.

Core commands are registered in the command manager, so `access-control.json` can block
them by id too.
