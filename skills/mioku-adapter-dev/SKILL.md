---
name: mioku-adapter-dev
description: Build or modify Mioku adapters — mioku-adapter-* packages — that connect a platform to the framework. Use when the task involves defineAdapter, apiVersion, AdapterContext, buildRoutes, createMessage, registerBot, registerCapability, registerStatusProvider, AdapterBotMap type registration, the driver and gateway abstraction, or OneBot v11 / NapCat / icqq / QQ official protocol work.
license: MIT
---

# Mioku adapter development

An adapter is the connection layer: it turns platform payloads into unified `Event`s, and
implements framework capabilities as platform calls.

```
platform → adapter → Event → command manager → event bus → plugins
plugins  → bot methods → capabilities → adapter → platform
```

## Definition

```ts
import { defineAdapter } from "mioku";
import type { AdapterFactoryOptions } from "mioku";

export const myAdapter = defineAdapter<MyConfig>({
  name: "my",
  version: "1.0.0",
  apiVersion: 1,
  validateConfig: (input) => normalizeConfig(input),
  create: (opts: AdapterFactoryOptions<MyConfig>) => build(opts.config, opts.logger),
});
```

| Field | Notes |
|---|---|
| `name` | **Must equal the package short name** (`mioku-adapter-my` → `my`) |
| `version` | Adapter version |
| `apiVersion` | Protocol version with the framework. **Must be `1`** — any other value rejects the load outright |
| `validateConfig` | Optional. Normalises `mioku.adapters.<name>` into your config type; runs before `create` |
| `create` | Returns the adapter instance |

```ts
interface Adapter {
  name: string;
  version: string;
  start(context: AdapterContext): void | Promise<void>;
  stop(reason?: string): void | Promise<void>;
}
```

`start` connects, registers bots and registers capabilities. `stop` disconnects and releases.
The framework calls them one adapter at a time and awaits each.

## What `start` does

```ts
async start(context: AdapterContext) {
  const bot = bindCapabilities(createEchoBot(), context.getCapabilityRegistry());
  const botCtx = context.registerBot(bot);

  const unregister = context.registerCapability(
    messageSend,
    { adapter: "echo", bot_id: BOT_ID },
    async (req) => bot.sendMessage(req.target, req.message),
  );

  bindSocket(onLine: (line) => context.dispatch(buildMessageEvent(bot, line)));

  await context.emitLifecycle({ type: "bot:connected", bot });

  cleanup = () => {
    unregister();
    botCtx.unregister();
  };
}
```

`bindCapabilities` fills in every capability method the bot does not implement itself;
`registerBot` makes it visible as `ctx.bot` / `ctx.bots`; `dispatch` feeds the pipeline;
`emitLifecycle` raises `bot:connected` and friends.

## Registering a capability

```ts
context.registerCapability(
  messageSend,                            // definition, imported from "mioku"
  { adapter: "onebotv11", bot_id: "10001" },  // target
  async (req) => platformSend(req.target, req.message),
);
```

The target has three dimensions:

| Field | Meaning |
|---|---|
| `adapter` | Required |
| `bot_id` | A specific account; omit for an adapter-level implementation |
| `resource_id` | Finer still — e.g. a particular gateway |

Registering the same capability, same version, same target twice **throws** — that guard
stops two adapters quietly fighting over one implementation.

## Reporting status

`.adapter` and `.status` render from these callbacks:

```ts
const off = registerStatusProvider(
  { adapter: "echo", bot_id: BOT_ID },
  async ({ bot }) => ({
    adapter: "echo",
    bot_id: bot.bot_id,
    impl: "echo-server",        // optional
    version: "1.2.3",           // optional
    protocol: "v11",            // optional
    platform: "aPad",           // optional
    platform_version: "9.3.50", // optional
    stats: { friends: 128, groups: 32, sent: 3312, received: 51234 },
    data: { anything: "插件可读，core 不展示" },
  }),
);
```

An adapter without a status provider shows up as an empty entry — worth wiring early
because it is the first thing a user checks when something looks wrong.

## Packaging rules that silently break discovery

| Rule | Consequence |
|---|---|
| `name` must be `mioku-adapter-*` | otherwise never discovered |
| **Must be installed in the consuming project's `dependencies`** | `devDependencies` → invisible |
| `main` points at the package-root entry (`index.ts` is fine, jiti compiles it) | entry not found |
| `keywords` includes `"mioku"` | not findable in the market |
| `mioku` goes in `peerDependencies` | otherwise the framework gets bundled twice |

```json
{
  "name": "mioku-adapter-echo",
  "version": "1.0.0",
  "main": "index.ts",
  "type": "module",
  "keywords": ["mioku"],
  "peerDependencies": { "mioku": "^1.0.0" }
}
```

Always verify by installing the package into a scratch project with `bun add` before
publishing.

## Split the work

A real adapter is not one file. The shape that scales:

```
mioku-adapter-<name>/
├── index.ts              defineAdapter + create
├── config.ts             validateConfig / normalizeConfig, config type
├── bot.ts                bot class, bot type, AdapterBotMap declaration
├── event.ts              platform payload → Event
├── capabilities/         one module per capability domain
├── gateway.ts            per-connection units, reconnect
└── config.md             WebUI form; key's first segment is the ADAPTER name
```

Adapter `config.md` is special: its config does not live under `config/`, it lives in
`package.json` → `mioku.adapters.<name>`. So the first `key` segment is the adapter name:

```yaml
fields:
  - key: onebotv11.instances
    label: 连接实例
    type: array
    itemFields:
      - key: protocol
        label: 连接协议
        type: select
        options:
          - { value: ws, label: "ws (未加密)" }
          - { value: wss, label: "wss (加密)" }
      - key: host
        label: 主机地址
        type: text
      - key: port
        label: 端口
        type: number
      - key: token
        label: 访问令牌
        type: secret
```

## References

- `references/event-construction.md` — building a valid `Event`: routes, identity, at-normalisation
- `references/capabilities.md` — the built-in capability catalogue, bot type registration, custom capabilities
- `references/driver-and-gateway.md` — the framework driver and per-connection gateways
- `references/platforms.md` — protocol documentation links and per-platform notes

Script: `scripts/validate-adapter.ts` checks apiVersion, naming, and packaging.
