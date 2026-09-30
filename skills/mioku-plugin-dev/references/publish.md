# Publishing a plugin

## package.json checklist

```json
{
  "name": "mioku-plugin-weather",
  "version": "1.0.0",
  "description": "查天气插件",
  "main": "index.ts",
  "type": "module",
  "keywords": ["mioku"],
  "mioku": { "services": ["ai", "config"] },
  "peerDependencies": { "mioku": "^1.0.0" }
}
```

| Field | Requirement |
|---|---|
| `name` | `mioku-plugin-<short>`, and `<short>` must equal `definePlugin.name` |
| `main` | The entry, normally `index.ts` — jiti compiles it at load |
| `type` | `"module"` |
| `keywords` | **Must contain `"mioku"`** — the market searches on it. Omitting it makes the plugin undiscoverable. |
| `peerDependencies` | `mioku: "^1.0.0"` — never a regular dependency |
| `dependencies` | Only real third-party runtime deps. This is also the field the loader scans, so it must be here and not in `devDependencies`. |

## The `mioku` manifest field

Recognised keys:

| Key | Type | Purpose |
|---|---|---|
| `services` | `string[]` | Service short names this plugin needs (`["ai", "config"]`). The installer auto-installs missing service packages, and startup warns if one is absent. |

`help` and `accessHooks` are recognised **only** for legacy plugins. Any other key is
ignored with an "unknown field" warning. A `services` value that is not an array is dropped
entirely.

Do not write `help` or `accessHooks` in a new plugin. Register commands with
`ctx.command()` inside `setup` — the framework feeds them into the help catalogue and
access control automatically.

## Entry and registration

```ts
import { definePlugin } from "mioku";

export default definePlugin({
  name: "weather",
  async setup(ctx) {
    ctx.command({
      name: "weather",
      aliases: ["天气"],
      description: "查询城市天气",
      usage: "weather <城市>",
      permission: "member",
      async handler({ event, args }) {
        await event.reply(`查询 ${args.join(" ") || "当前城市"}`);
      },
    });
  },
});
```

## Files to ship

| File | Why |
|---|---|
| `index.ts` | Required entry at the package root |
| `package.json` | Manifest |
| `README.md` | Install, commands, config — the market listing links to it |
| `config.md` | Only if the plugin has config; gives users a real form instead of raw JSON |
| `LICENSE` | Recommended for a public package |

## Versioning

Semantic versioning: patch for a fix, minor for a feature, major when consumers must change
their code.

**Do not bump on every edit.** See `mioku-code-style/references/change-management.md` for
the full rule: one bump per finished, consumer-visible change — not per commit, and never
while the work is still uncommitted or still being iterated on.

## Publishing

```bash
npm publish
# or
bun publish
```

Publish the built output when you have one; shipping raw TypeScript works but makes every
consumer compile it at load. Verify locally first by installing the tarball into a scratch
project.

Users install and update through `mioku install plugin <name>` or `mioku update`, and the
plugin appears in the market via the `mioku` keyword. No registry submission is needed
beyond that.
