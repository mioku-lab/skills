# Config and data

Two separate places, deliberately:

| | `config/<plugin>/` | `data/<plugin>/` |
|---|---|---|
| Written by | the user, `updateConfig`, the WebUI | the plugin |
| Read by | `getConfig` (cached, hot-reloaded) | direct `db.data` access |
| Typical | toggles, group lists, messages | counters, word books, sessions, caches |
| Change applies | immediately on file save | when the plugin calls `write()` |
| Migrates by | copying `config/` | copying `data/` |

Ask "would the user want to edit this value?" — yes means config, no means data.

## Config service

```ts
import { getService, Services } from "mioku";

const cfgSvc = getService(ctx, Services.Config);
if (!cfgSvc) ctx.logger.warn("config 服务未加载，使用内置默认配置");
```

Declare the dependency in the plugin `package.json`:

```json
{ "mioku": { "services": ["config"] } }
```

| Method | Behaviour |
|---|---|
| `registerConfig(plugin, name, initial)` | Creates the file from defaults when absent. `initial` may be an object or a JSON path. Returns success. |
| `getConfig(plugin, name)` | Cached read. `null` when the file is missing. |
| `updateConfig(plugin, name, updates)` | Shallow-merges into the current content and writes. |
| `onConfigChange(plugin, name, cb)` | Subscribe; returns an unsubscribe function. |
| `getPluginConfigs(plugin)` | All config files for a plugin at once. |

Full example:

```ts
interface GreetingConfig { enabled: boolean; groups: string[]; message: string }

const DEFAULT_CONFIG: GreetingConfig = {
  enabled: true,
  groups: ["123456789"],
  message: "早上好！今天也要元气满满哦～",
};

export default definePlugin({
  name: "greeting",
  async setup(ctx) {
    const cfgSvc = getService(ctx, Services.Config);
    let cfg = DEFAULT_CONFIG;

    if (cfgSvc) {
      await cfgSvc.registerConfig("greeting", "base", DEFAULT_CONFIG);
      cfg = ((await cfgSvc.getConfig("greeting", "base")) as GreetingConfig) ?? cfg;
      cfgSvc.onConfigChange("greeting", "base", (next) => {
        cfg = next as GreetingConfig;
        ctx.logger.info("greeting 配置已热更新");
      });
    }

    ctx.cron("0 9 * * *", async (c) => {
      if (cfg.enabled) await c.noticeGroups(cfg.groups, cfg.message);
    });
  },
});
```

## Three merge rules that surprise people

1. **Defaults only fill missing top-level keys.** Once a key exists in the file, the user's
   value wins — including a shortened array.
2. **Nested objects are replaced wholesale**, not deep-merged. Changing one field of a
   nested object means supplying the whole object.
3. **Deleting a top-level key** makes the default reappear on the next start.

Also: `updateConfig` writes to disk, so it returns `false` if the config was never
registered. The convention is `registerConfig` first in `setup`, then update later.

And after `updateConfig` succeeds, **do not also assign your local variable** — the file
watcher fires `onConfigChange` and the state updates itself.

## Data storage

`ensureDataDir(name)` returns (and creates) `<project>/data/<name>/`.

```ts
import { ensureDataDir } from "mioku";
import * as path from "path";

const dir = ensureDataDir("wordbook");
const db = await ctx.createDB<WordBook>(path.join(dir, "words.json"), {
  defaultData: { words: {} },
});

db.data.words["miku"] = "初音未来";
await db.write();   // without this, the change is memory-only
```

| Method | Use |
|---|---|
| `ctx.createDB(filename, { defaultData, compress })` | You supply the full path, usually under `ensureDataDir`. Lazy — no file until the first `write()`. |
| `ctx.createStore(defaultData, { importMeta, filename })` | File lives next to the calling source, located via `import.meta`. Writes once at init. |

Both are `lowdb` wrappers; `db.data` is the object and `db.write()` persists. `compress`
stores JSON on one line — smaller, but no longer hand-editable.

**Always `await db.write()` after mutating.** A forgotten write loses everything on exit.
For high-frequency data, batch writes; for large volumes, use SQLite instead.

## Custom WebUI config forms: `config.md`

Drop a `config.md` at the package root and the WebUI renders a real form instead of a JSON
editor. YAML frontmatter declares fields; the Markdown body places them with
`mioku-field` code blocks.

```markdown
---
title: 早安问候
description: 配置每日问候语与推送目标
fields:
  - key: base.enabled
    label: 启用
    type: switch
    description: 是否开启每日问候
    defaultValue: true

  - key: base.message
    label: 问候语
    type: text
    placeholder: 早上好！

  - key: base.groups
    label: 目标群
    type: array
    itemFields:
      - key: group
        label: 群号
        type: number
---

# 早安问候

```mioku-field
key: base
```
```

### Field definition

| Key | Required | Notes |
|---|---|---|
| `key` | yes | `<configName>.<path>`; dots address nested fields. `base.enabled` → `enabled` in `base.json`. |
| `label` | yes | Shown on the form. |
| `type` | yes | See below. |
| `description` | no | Helper text. |
| `placeholder` | no | Input placeholder. |
| `required` | no | |
| `defaultValue` | no | |
| `options` | no | `select` / `multi-select`, as `{ value, label }`. |
| `itemFields` | no | For `array`; keys are relative (`group`, not `base.group`). |

Types: `text`, `textarea`, `number`, `switch`, `select`, `multi-select`, `secret`, `json`,
`array`.

### Where it goes and what the first key segment means

| Package | File location | First `key` segment |
|---|---|---|
| Plugin (local) | `plugins/<name>/config.md` | config file name |
| Plugin (npm) | package root | config file name |
| Service (local) | `services/<name>/config.md` | config file name |
| Service (npm) | package root | config file name |
| Adapter | package root only | **adapter name** — adapter config lives at `mioku.adapters.<name>` |

`config.md` is declarative and fails soft: a field missing `key` / `label` / `type` is
skipped with a warning, and a `key` without a dot is warned about. If the file cannot be
parsed at all, the WebUI falls back to the JSON editor.

## Service config

Services use a parallel set under `config/service/<name>/`:

| Function | Purpose |
|---|---|
| `registerServiceConfig(name, key, defaults)` | Write defaults if absent |
| `getServiceConfig(name, key)` | Read; `{}` if missing or broken |
| `updateServiceConfig(name, key, value)` | Overwrite |
| `getServiceConfigs(name)` | All config files for a service |

`getServiceDataDir("sentence")` gives a service its `data/<name>/` directory.
