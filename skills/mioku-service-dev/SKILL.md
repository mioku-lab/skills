---
name: mioku-service-dev
description: Create or modify Mioku services — mioku-service-* packages and local services/ directories — that expose a reusable api object to plugins. Use when the task involves MiokuService, init/dispose, designing a service api interface, defineService, getService/requireService/hasService, ctx.addService, registerServiceConfig, getServiceDataDir, the built-in ai/config/screenshot/help services, or publishing a service package.
license: MIT
---

# Mioku service development

Plugins do features; **services do interfaces**. Whenever two plugins would otherwise
implement the same capability, that capability belongs in a service.

| | Plugin | Service |
|---|---|---|
| Purpose | react to events, run business logic | provide a reusable capability |
| Reached by | the framework dispatching events | plugins pulling it from the registry |
| Listeners | yes — `ctx.handle` | none; it is just an object |
| Lifecycle | `setup` / returned cleanup | `init()` / `dispose()` |

## Skeleton

```ts
import { logger, registerServiceConfig, getServiceConfig } from "mioku";
import type { MiokuService } from "mioku";

/** sentence 服务暴露给插件的接口 */
export interface SentenceAPI {
  /** 随机取一条一言 */
  getOne(): Promise<string>;
}

const DEFAULT_WORDS = ["人生若只如初见", "今晚月色真美"];

const sentenceService: MiokuService = {
  name: "sentence",
  api: {} as SentenceAPI,

  async init() {
    await registerServiceConfig("sentence", "words", { words: DEFAULT_WORDS });
    const cfg = await getServiceConfig("sentence", "words");
    const words = Array.isArray(cfg.words) ? cfg.words : DEFAULT_WORDS;

    this.api = {
      getOne: async () => words[Math.floor(Math.random() * words.length)],
    };

    logger.info("sentence 服务已就绪");
  },

  async dispose() {
    logger.info("sentence 服务已卸载");
  },
};

export default sentenceService;
```

**`init()` must fill `this.api`.** That is the service's entire public surface — after
`init` resolves, the framework registers `service.api` and `getService` returns exactly
that object. Anything not on `api` is unreachable by consumers.

Do asynchronous setup (connecting, fetching, reading files) inside `init` — the framework
awaits it before loading any plugin.

Version and description come from `package.json`; do not restate them on the object.

## Four rules that break services

1. **A local service still needs a `package.json`.** The loader skips any folder without
   one, silently — it will not even appear in the log. This is the most common failure.
2. **The entry must be `index.ts` or `index.js`.** The `main` field is not consulted for
   local services. `src/index.ts` is not found.
3. **`init` must be a function.** Otherwise the loader reports "invalid: missing init()".
4. **Load order is `services/` first, then `node_modules`.** For the same short name the
   **npm package overwrites the local one** — a local override of an installed service does
   not work.

Load sequence per candidate:

```
package.json exists?  no → skipped
entry index.ts → index.js?  no → "entry missing"
import, is init a function?  no → "invalid: missing init()"
call init() → on success register api
```

`dispose()` runs on shutdown in reverse load order. Only define it if you hold a resource.

## Consuming a service

```ts
import { getService, requireService, hasService, defineService, Services } from "mioku";

const api = getService(ctx, Services.Config);   // undefined when absent
const ai = requireService(ctx, Services.AI);    // throws when absent
if (hasService(ctx, Services.Help)) { ... }     // feature probe
```

| Function | Use when |
|---|---|
| `getService` | the service is optional and you can degrade without it |
| `requireService` | the plugin cannot function at all without it — fail loudly at startup, not mid-run |
| `hasService` | probing for an optional capability |

`defineService<T>(id)` builds a **typed reference only** — it performs no lookup, so it is
safe at module scope and can be passed around:

```ts
const Weather = defineService<WeatherApi>("weather");
const weather = requireService(ctx, Weather);
```

Built-in references live on `Services` — `Services.AI`, `Services.Config`,
`Services.Screenshot`, `Services.Help` — so you do not define those yourself.

`ctx.services["name"]` also works but is typed `unknown`; assert it or, better, declare the
reference. Third-party services are typed by importing their exported interface:

```ts
import type { AudioServiceApi } from "mioku-service-audio";
const audio = ctx.services.audio as AudioServiceApi | undefined;
```

## Providing a service from a plugin

A full `mioku-service-*` package is right when the capability is meant to be reused. When
the capability only exists to let another plugin extend yours, register it inline:

```ts
export interface WeatherApi {
  query(city: string): Promise<string>;
}

export default definePlugin({
  name: "weather",
  priority: 50,          // lower loads first, so consumers see it
  async setup(ctx) {
    ctx.addService("weather", {
      query: async (city) => (await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=3`)).text(),
    } satisfies WeatherApi);
  },
});
```

`ctx.addService(name, value, cover = true)` returns an unregister function and is cleaned up
on unload automatically. Pass `cover: false` to register only when the name is free.
Re-registering the same name overwrites the previous value.

Declaration merging gives typed access:

```ts
declare module "mioku" {
  interface ServiceMap {
    weather: WeatherApi;
  }
}
```

Ordering: a consumer's `setup` runs after the provider's **only if** the provider has a
lower `priority`, or the two are in different priority groups. Same-priority plugins load in
parallel. Declare `mioku.services` in the package manifest so the installer pulls the
service in and startup warns when it is missing.

## Deliverables for a service package

| File | Required | Notes |
|---|---|---|
| `index.ts` | yes | entry at package root; exports the `MiokuService` as default |
| `package.json` | yes | `name: mioku-service-<short>`, `main: "index.ts"`, `type: "module"`, `keywords: ["mioku"]`, `peerDependencies.mioku` |
| `README.md` | yes | exported api surface and config |
| `config.md` | if it has config | key's first segment is the **config file name**, e.g. `base.baseUrl` |

## References

- `references/api-and-consumption.md` — designing `api`, the loading pipeline, built-in services
- `references/config-and-data.md` — the four service config functions, data directory, `config.md` for services

Script: `scripts/validate-service.ts` checks the four failure modes above.
