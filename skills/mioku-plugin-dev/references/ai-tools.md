# AI tools, AISkills and ChatRuntime

Two distinct things share the word "skill". This file is about Mioku's runtime concept:

- **AISkill** — `AISkill` / `AITool` from the `mioku` package. A plugin registers it on the
  `ai` service so the bot's LLM can call your plugin's functions.
- **Agent Skill** — the `SKILL.md` format this repository is written in. Unrelated.

## Vocabulary

| Term | Meaning |
|---|---|
| `provider` | One API connection: base URL, key, protocol (`openai-chat` / `openai-response` / `anthropic` / `gemini`) |
| `model` | A model under a provider, with capability flags (`text` / `vision` / `tool-use` / `reasoning`) and context size |
| `instance` | provider + model bound into a callable handle — what plugins use |
| `skill` | A named bundle of tools, with a permission |
| `tool` | One function exposed to the model; the model decides when to call it |

## Getting an instance

Instances come in three roles: `main` (conversation), `working` (background, cheaper),
`vision` (images). Use the fallback chain so a single-model setup still works:

```ts
import { getService, Services } from "mioku";
import type { AIInstance } from "mioku";

const ai = getService(ctx, Services.AI);
if (!ai) {
  ctx.logger.warn("ai 服务未加载，本插件不注册 AI 功能");
  return;
}

const main: AIInstance | undefined = ai.getInstanceByRole?.("main") ?? ai.getDefault();
const working = ai.getInstanceByRole?.("working") ?? main;
const vision  = ai.getInstanceByRole?.("vision")  ?? working;
```

Both `getInstanceByRole` and `getDefault` may return `undefined` — the user may not have
configured any model. Check in `setup` and skip registering, or check at call time.

`ai.get(name)` fetches by instance name; `ai.listInstances?.()` lists everything with its
provider, model and role. Use the fallback chain for almost everything.

## Calling the model

```ts
const text = await main.generateText({
  prompt: "你是一个简洁的助手，回答不超过三句话。",   // optional, prepended as system
  messages: [{ role: "user", content: "用一句话解释什么是闭包" }],
});
```

`messages` is `{ role: "system" | "user" | "assistant", content }[]`. Multi-turn means
appending the assistant's earlier replies in order.

For images, use the `vision` instance and an array `content`:

```ts
const desc = await vision.generateMultimodal({
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "这张图里是什么？一句话回答" },
      { type: "image_url", image_url: { url: imageUrl, detail: "auto" } },
    ],
  }],
});
```

`detail` is `auto` / `low` / `high`. Do not send images to `main` — the user may have bound
vision to a different model.

For streaming or a hand-rolled tool loop, drop to `complete()`:

```ts
const res = await instance.complete({
  messages: [{ role: "user", content: "讲个冷笑话" }],
  stream: true,
  onTextDelta: (d) => process.stdout.write(d),
});

res.content;    // full text
res.reasoning;  // reasoning trace, when the model emits one
res.toolCalls;  // tool calls the model requested
```

Useful `CompleteOptions`: `stream` / `onTextDelta`, `executableTools`,
`executableToolsProvider` (refetched each iteration, for dynamic tool sets),
`maxIterations`, `model`, `temperature`, `max_tokens`.

## Defining a tool

```ts
import type { AITool } from "mioku";

const weatherTool: AITool = {
  name: "query_weather",
  description: "查询指定城市的当前天气，用户问到天气相关问题时调用",
  parameters: {
    type: "object",
    properties: { city: { type: "string", description: "城市名，比如：上海" } },
    required: ["city"],
  },
  handler: async (args, runtimeCtx?) => {
    const res = await fetch(`https://wttr.in/${encodeURIComponent(args.city)}?format=3`);
    return res.text();
  },
};
```

- `name` and `description` are read by the model. A description that says **when** to call
  it is worth more than one that says what it is.
- `parameters` is a JSON Schema for the arguments.
- `handler(args, runtimeCtx?)` is your implementation. **Validate `args`** — never trust
  what the model passed.
- `runtimeCtx` is the call site, present when the chat plugin invoked the tool. It carries
  `ctx` and `event`, so a tool can send a message itself:

```ts
handler: async (args, runtimeCtx?) => {
  const ctx = runtimeCtx?.ctx;
  const event = runtimeCtx?.event ?? runtimeCtx?.rawEvent;
  if (ctx && event) await event.reply("图片已生成");
  return "done";
},
```

`runtimeCtx` is optional; other callers may omit it. Always guard.

## Registering an AISkill

Tools are only reachable through a skill — there is no API to register a bare tool.

```ts
import type { AISkill } from "mioku";

const weatherSkill: AISkill = {
  name: "weather",
  description: "天气查询",
  permission: "member",
  tools: [weatherTool, forecastTool, alertTool],
};

ai.registerSkill(weatherSkill);
```

Registering a skill with an existing name overwrites it and logs a warning.

### How many skills

**Keep the count low.** A runtime skill catalogue is context the model must route through,
so:

- Prefer **one skill with several tools** over several single-tool skills.
- Group by *domain the user asks about*, not by internal module.
- Only split when the permission boundary genuinely differs — permissions are per skill,
  so a `master`-only tool cannot live in a `member` skill.

### Permission

| Value | Who |
|---|---|
| `member` | anyone — also the fallback for an invalid value |
| `admin` | master or admins |
| `master` | master only |
| `owner` | legacy spelling of `master` |

Enforcement happens in the **caller**, not in the service: the chat plugin filters skills
by the triggering user's role, so an under-privileged skill never reaches the model. The
`ai` service itself only stores. Therefore a tool inside a privileged skill still needs its
own argument validation.

## How the tool loop works

`generateWithTools` collects the tools of every registered skill, prefixes each tool name
with its skill name (`weather.query_weather`) to avoid collisions, and hands them to the
model. When the model calls one, the framework runs the handler, feeds the result back, and
repeats until the model produces a final answer.

```ts
const result = await instance.generateWithTools({
  messages: [{ role: "user", content: "上海天气怎么样" }],
});

result.content;      // final answer text
result.iterations;   // tool-loop rounds actually run
result.allToolCalls; // every call: name, args, result
```

## ChatRuntime

`mioku-plugin-chat` registers a higher-level runtime on the `ai` service. It lets you get a
naturally-worded message out of the bot, or collect structured data through conversation,
without writing prompts or driving the tool loop yourself.

```ts
const ai = getService(ctx, Services.AI);
const chatRuntime = ai?.getChatRuntime();   // undefined when the chat plugin is disabled
```

The chat plugin is a system plugin and normally installed, but a user can disable it — so
check for `undefined`.

### `generateNotice` — say something in natural language

```ts
if (chatRuntime) {
  await chatRuntime.generateNotice({
    event,                      // reuse this event's context (group, sender)
    instruction: "提醒大家明天下午三点团建，楼下集合",
    send: true,                 // generate and send
    promptInjections: [         // optional tone constraints
      { title: "Notice", content: "用轻松的语气，不要提到任何插件或命令。" },
    ],
  });
}
```

| Parameter | Notes |
|---|---|
| `event` / `selfId` + `groupId` / `selfId` + `userId` | Where to send |
| `instruction` | Required. What to express. |
| `send` | Send after generating. Default `true`. |
| `targetMessage` | Extra context for the model. |
| `promptInjections` | Extra prompt blocks constraining tone and behaviour. |

Returns a `ChatRuntimeResult`; with `send: true` the message has already gone out.

### `requestInformation` — collect structured data

```ts
const result = await chatRuntime.requestInformation({
  event,
  task: "询问用户的生日、所在城市和星座",
  schema: {
    type: "object",
    properties: {
      birthday: { type: "string", description: "生日，格式 YYYY-MM-DD" },
      city: { type: "string" },
      zodiac: { type: "string", description: "星座" },
    },
    required: ["birthday", "city", "zodiac"],
  },
});

const data = result.collectedInfo?.data;   // may be undefined if incomplete
```

`collectedInfo` also carries `isComplete`, `confidence` and `notes`. Treat `data` as
optional — the conversation can end before everything is collected.

## Thinking level

`AIThinkingLevel` has six values: `off` / `low` / `medium` / `high` / `xhigh` / `max`. The
Gemini protocol only honours up to `high`. Set it with
`ai.setModelThinkingLevel?.(modelFullId, level)` — normally a user-facing WebUI setting,
not something a plugin should decide.
