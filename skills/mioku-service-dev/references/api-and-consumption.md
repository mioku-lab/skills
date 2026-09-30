# Service api design, loading and the built-in services

## Designing the `api`

`api` is the whole contract. Design it as if it were a public library interface, because it
is one.

- **Export the interface as a named type.** `<Domain>Api`, exported from the package, so
  consumers get completion end to end.
  ```ts
  export interface SentenceAPI { getOne(): Promise<string> }
  ```
- **Expose verbs, not internals.** A consumer should never need to know your HTTP client,
  your cache, or your file layout.
- **Return plain data.** Framework types are fine; leaking a third-party SDK's object
  couples every consumer to that dependency's version.
- **Make optional capabilities optional in the type.** If a method may not be available,
  mark it optional and let consumers check, rather than throwing.
- **Fail soft on reads, loud on writes.** A read that cannot be satisfied should return
  `null` / `undefined` and log a warning; a write that fails should throw.
- **Do not re-export the service object.** Consumers get `api` only — that is intentional.

## Lifecycle

```
init()          framework awaits it; fill this.api here
  ↓
register api    keyed by the service short name (mioku-service-audio → audio)
  ↓
plugins load    getService now returns api
  ↓
dispose()       shutdown, in reverse load order
```

`init` is the only place to do async preparation. Throwing from `init` fails the service
load — the framework logs it and the service is simply absent, so `getService` returns
`undefined` at every call site. Prefer to catch, log, and expose a degraded `api` when a
partial service is still useful; throw only when a half-working service would be worse than
none.

`dispose` is optional. Define it when you hold something: a socket, a database handle, a
timer, a child process. Shutdown has a 15 s budget overall.

## Discovery and loading

```
1. scan <project>/services/            (directory, name configurable via mioku.services_dir)
2. scan node_modules for mioku-service-*
        ↓ both feed one table
3. same short name → the npm package wins
```

Per-candidate pipeline:

| Step | Failure |
|---|---|
| `package.json` present | skipped entirely, no log line |
| entry `index.ts`, then `index.js` | "entry missing" |
| default export has a function `init` | "invalid: missing init()" |
| `await init()` succeeds | api registered |

Services load **before** the runtime starts and before any plugin, so a plugin's `setup` can
rely on `getService` being authoritative: `undefined` means it genuinely is not available.

## Built-in services

| Reference | Name | Provides |
|---|---|---|
| `Services.AI` | `ai` | providers, models, instances, AISkill registration, ChatRuntime |
| `Services.Config` | `config` | plugin config registration, read, hot reload |
| `Services.Screenshot` | `screenshot` | render HTML / Markdown / URL to an image |
| `Services.Help` | `help` | collect and query plugin help entries |

These four are installed by the framework scaffolder and are present in any normal
deployment. `screenshot` is what makes image-based help and status output work; it needs a
Chromium-based browser on the host.

Third-party services in the official market include `audio`, `netease`, `applemusic`,
`ncmdump`, `60s` and `webui`. Their interfaces are exported from their packages.

## Registering help

A service normally has no commands, but if the plugin around it does, register help through
the help service rather than maintaining a separate list:

```ts
const help = getService(ctx, Services.Help);
help?.registerHelp("demo", {
  title: "演示",
  description: "一个演示插件",
  commands: [{ cmd: "#demo", desc: "演示指令" }],
});
```

Plugins that use `ctx.command()` get their help entries collected automatically — this
manual form is for anything registered outside the command manager.

## Adding a service to the typed map

Type registries use declaration merging so consumers do not need casts:

```ts
declare module "mioku" {
  interface ServiceMap {
    weather: WeatherApi;
  }
}
```

Place this alongside the exported interface in the providing package. Without it,
`ctx.services.weather` is `unknown` and every consumer writes an assertion.
