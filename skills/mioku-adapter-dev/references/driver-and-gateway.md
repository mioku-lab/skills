# Driver and gateways

## Why the driver exists

Adapters need HTTP and WebSocket access. Instead of calling `fetch` and `WebSocket`
directly, they go through a driver:

```ts
const driver = context.getDriver();

const res = await driver.http.request({
  method: "GET",
  url: "https://api.example.com/status",
});
const data = res.json();

const ws = await driver.websocket.connect("ws://localhost:3001", {
  headers: { Authorization: "Bearer token" },
  connectTimeout: 10_000,
});
```

Three reasons it is worth the indirection:

1. **Replaceable.** Proxies, TLS settings and network policy can be swapped without
   touching adapter code.
2. **Consistent errors.** `WebSocketConnectTimeoutError` and `HttpRequestError` are shared
   types, so error handling follows the same pattern everywhere.
3. **Consistent lifecycle.** `driver.shutdown()` closes every connection on framework
   shutdown; adapters do not track them individually.

The default implementation is `createDefaultDriver`, built on Node 22's native `fetch` and
`WebSocket`, with timeout and close protection.

## Typical WebSocket adapter loop

```ts
const build = (cfg: MyConfig, logger: Logger): Adapter => {
  let ws: WebSocketClient | undefined;
  let stopped = false;

  const connect = async () => {
    if (stopped) return;
    ws = await driver.websocket.connect(cfg.url, { connectTimeout: 15_000 });

    ws.onMessage((data) => {
      const ev = parseEvent(data);
      if (ev) context.dispatch(ev);
    });

    ws.onClose(() => {
      if (!stopped) void connect();
    });

    ws.onError((err) => logger.error(`[my] ws 错误: ${err}`));
  };

  return {
    name: "my-adapter",
    version: "1.0.0",
    async start(ctx) {
      driver = ctx.getDriver();
      await connect();
    },
    async stop() {
      stopped = true;
      await ws?.close(1000, "adapter stop");
    },
  };
};
```

Notes that matter:

- The `stopped` flag prevents a close handler from resurrecting a socket during shutdown.
- `connectTimeout` should always be set; without it a dead endpoint hangs the adapter start.
- Back off between reconnect attempts — an immediate retry loop against a down endpoint
  burns CPU and floods the log.
- Never `throw` out of `onMessage`. Dispatch failures are the framework's problem; a throw
  here can kill the socket handler.

## Driver vs gateway

Two different connection concepts:

| | Driver | Gateway |
|---|---|---|
| Owned by | the framework | the adapter |
| Scope | one HTTP + WebSocket client for the whole runtime | one business connection unit |
| Typical use | all network access | one connection per bot in a multi-account adapter |
| Shutdown | `driver.shutdown()` by the framework | adapter releases them in `stop()` |

Gateways matter for multi-account adapters: each account gets its own connection, its own
reconnect state and its own failure isolation, so one account dropping does not disturb the
others. The gateway interface is `AdapterGateway`.

## Plugins and the driver

`ctx.getDriver()` returns the same instance. Plugins rarely need it — a plain `fetch` is
simpler and perfectly acceptable for calling an HTTP API. Reach for the driver in a plugin
only when you specifically want its timeout and error semantics, or you are doing something
the framework must shut down cleanly.

## Config for an adapter

Adapter config is not stored under `config/`; it lives in the project `package.json`:

```json
{
  "mioku": {
    "adapters": {
      "echo": { "prefix": "echo> " }
    }
  }
}
```

`validateConfig` receives that raw value and must return a fully-normalised object — every
field defaulted, every type checked, because `create` receives its output and should never
have to re-validate:

```ts
interface EchoConfig { prefix?: string }

function normalizeConfig(input: unknown): EchoConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  return { prefix: typeof raw.prefix === "string" ? raw.prefix : undefined };
}
```

Never throw from `validateConfig` for an optional field — fall back to a default and let the
adapter start. Throw only when the config is unusable, and say precisely which field is
wrong.
