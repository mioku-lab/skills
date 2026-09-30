# Service config and data

Service config lives under `config/service/<serviceName>/` — a separate tree from plugin
config, so the two never collide.

```text
config/
└── service/
    ├── ai/
    │   ├── providers.json
    │   └── models.json
    └── sentence/
        └── words.json
```

## The four functions

All imported from `mioku`:

| Function | Behaviour |
|---|---|
| `registerServiceConfig(name, key, defaults)` | Writes the defaults when the file is absent; leaves an existing file untouched |
| `getServiceConfig(name, key)` | Reads and caches; returns `{}` when the file is missing or malformed |
| `updateServiceConfig(name, key, value)` | Overwrites the file |
| `getServiceConfigs(name)` | Reads every config file for the service at once |
| `deleteServiceConfig(name, key)` | Removes it |

The usual pattern in `init`:

```ts
async init() {
  await registerServiceConfig("sentence", "words", { words: DEFAULT_WORDS });

  const cfg = await getServiceConfig("sentence", "words");
  const words = Array.isArray(cfg.words) ? cfg.words : DEFAULT_WORDS;
  if (!Array.isArray(cfg.words)) {
    logger.warn("sentence.words 配置不是数组，回退到默认词库");
  }

  this.api = { getOne: async () => words[Math.floor(Math.random() * words.length)] };
}
```

Note the guard: `getServiceConfig` returning `{}` for a broken file means **never index into
the result directly**. Treat every field as optional and fall back to the default.

## Merge semantics

`registerServiceConfig` only fills **top-level keys** that are missing. A key that exists in
the file always wins, including a shortened array. Nested objects are replaced wholesale, not
deep-merged — changing one sub-field means supplying the whole object. Deleting a top-level
key makes the default return on the next start.

## Data directory

```ts
import { getServiceDataDir } from "mioku";

const dir = getServiceDataDir("sentence");   // <project>/data/sentence/
```

Use it for caches, downloaded assets and database files. `data/` is the service's own
storage and is never hand-edited by users — anything the user should be able to change
belongs in `config/` instead.

Migration is by copying the two directories: `config/` and `data/`.

## `config.md` for services

Identical to the plugin form, with one difference: the **first segment of `key` is the
config file name** under `config/service/<service>/`.

```markdown
---
title: 60s 服务配置
description: 配置 60s API 服务的连接参数
fields:
  - key: base.baseUrl
    label: 60s API 地址
    type: text
    description: 60s 服务地址。默认使用官方公开实例，也可以改成你自己部署的地址。
    placeholder: https://60s.viki.moe

  - key: base.timeoutMs
    label: 请求超时毫秒
    type: number
    placeholder: 15000
---

# 60s 服务配置

```mioku-field
key: base.baseUrl
```

```mioku-field
key: base.timeoutMs
```
```

`base` here is the config file name: `config/service/60s/base.json`. So `base.timeoutMs`
addresses `timeoutMs` inside that file.

Placement:

| Package form | `config.md` location |
|---|---|
| Local service | `services/<name>/config.md` |
| npm service | package root |

### Field definition

| Key | Required | Notes |
|---|---|---|
| `key` | yes | `<configName>.<path>`; dots address nested fields |
| `label` | yes | Form label |
| `type` | yes | `text`, `textarea`, `number`, `switch`, `select`, `multi-select`, `secret`, `json`, `array` |
| `description` | no | Helper text |
| `placeholder` | no | |
| `required` | no | |
| `defaultValue` | no | |
| `options` | no | `select` / `multi-select`, as `{ value, label }` |
| `itemFields` | no | For `array`; keys are relative to the item |

The body places each control with a `mioku-field` code block naming the key (or a parent
key, to render everything under it).

Bad definitions fail soft: a field missing `key` / `label` / `type` is skipped with a
warning, and the WebUI falls back to a raw JSON editor if the file cannot be parsed. So a
broken `config.md` degrades rather than breaks — but it also silently loses the form, which
is why a warning-free load matters.
