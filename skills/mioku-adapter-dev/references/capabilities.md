# Capabilities and bot typing

A capability is a typed contract: a name, a version, and request/response types. Adapters
implement it; plugins call it. This is why a plugin can run unchanged across platforms.

```ts
import { defineCapability } from "mioku";

export const messageSend = defineCapability<SendRequest, SendResult>("message.send", 1);
```

`defineCapability<I, O>(name, version)` returns an object carrying a private token, so
same-name-same-version capabilities are globally unique. That token is what prevents two
adapters from silently overwriting one another.

## Built-in capabilities

All exported from `mioku`'s top level. The right column is the method `bindCapabilities`
attaches to the bot.

| Domain | Capability → bot method |
|---|---|
| message | `messageSend` → `sendMessage`, `messageRecall` → `recallMessage`, `messageGet` → `getMessage`, `messageGetForward` → `getForwardMessage`, `forwardSend` → `sendForward` |
| member | `memberBan` → `banMember`, `memberKick` → `kickMember`, `memberSetCard` → `setMemberCard`, `memberSetAdmin` → `setMemberAdmin`, `memberSetTitle` → `setMemberTitle`, `memberPoke` → `pokeMember`, `memberGetInfo` → `getMemberInfo` |
| group | `groupGetInfo` → `getGroupInfo`, `groupGetList` → `getGroupList`, `groupGetMembers` → `getGroupMembers`, `groupLeave` → `leaveGroup`, `groupSetName` → `setGroupName`, `groupSetWholeBan` → `setGroupWholeBan`, `groupSetPortrait` → `setGroupPortrait` |
| friend | `friendGetInfo` → `getFriendInfo`, `friendGetList` → `getFriendList`, `friendDelete` → `deleteFriend` |
| profile | `profileSet` → `setProfile`, `avatarSet` → `setAvatar` |
| conversation | `conversationGetHistory` → `getHistory` |
| system | `botStatus` → `getStatus` |

Request and response types are exported alongside (`MessageSendRequest`, `MemberBanRequest`,
…), so implementing an adapter is mostly filling in the translation.

Naming convention for a new capability: `<domain><Verb>`, e.g. `my.tts_speak` for a custom
platform capability.

## Bot typing

Implement only what is genuinely yours — `bindCapabilities` supplies the rest:

```ts
import type { AdapterBotBase, BotBase } from "mioku";

export interface EchoBot extends BotBase {
  readonly adapter: "echo";
  sendMessage(target: MessageTarget, message: MessageInput): Promise<SentMessage>;
}

export type EchoBotBase = AdapterBotBase<EchoBot>;

declare module "mioku" {
  interface AdapterBotMap {
    echo: EchoBot;
  }
}

export function createEchoBot(): EchoBotBase {
  return {
    adapter: "echo",
    get bot_id() { return BOT_ID; },
    get online() { return true; },
    async sendMessage(_target, message) {
      console.log(`[echo] ${String(message)}`);
      return { message_id: `echo:${Date.now()}` };
    },
    async sendApi() { throw new Error("echo 不支持任意平台 API"); },
  };
}
```

The `AdapterBotMap` declaration is the adapter's biggest gift to plugin authors. Once
registered:

- `ctx.handle("echo:message", …)` types `event.bot` as `EchoBot` — via route inference
- `ctx.bots` gains `EchoBot` in its union, so `if (bot.adapter === "echo")` narrows
- `ctx.pickBot<EchoBot>("…")` and `bot.as<EchoBot>()` become meaningful

Do this even for a private adapter. Without it every consumer writes a cast.

## Custom capabilities

When the built-in set is not enough, the full chain is: define in the adapter package →
register an implementation → invoke from a plugin.

```ts
// adapter package
export interface SpeakRequest { text: string; voice?: "xiaoai" | "yunxi" }
export const ttsSpeak = defineCapability<SpeakRequest, { task_id: string }>("my.tts_speak", 1);

context.registerCapability(ttsSpeak, { adapter: "my", bot_id: BOT_ID }, async (req) =>
  submitTtsTask(req.text, req.voice),
);
```

```ts
// plugin
import { ttsSpeak } from "mioku-adapter-my";

const bot = ctx.pickBot("10001");
if (bot && ctx.capabilities.supports({ adapter: "my", bot_id: bot.bot_id }, ttsSpeak)) {
  const res = await ctx.capabilities.invoke(
    { adapter: "my", bot_id: bot.bot_id },
    ttsSpeak,
    { text: "你好" },
  );
}
```

**Custom capabilities get no bot method.** `bindCapabilities` only binds the built-in set,
so a custom capability must be invoked through `ctx.capabilities.invoke(...)` or forwarded
with `bot.sendApi("my.custom_action", {...})`.

## Errors and pre-flight

| Situation | Behaviour |
|---|---|
| Invoking a capability the target does not implement | throws `UnsupportedCapabilityError`, naming the capability |
| Same capability + version + target registered twice | throws immediately |
| `registry.supports(target, capability)` | returns a boolean — use it to degrade gracefully |

Plugin-side graceful degradation looks like this:

```ts
if (ctx.capabilities.supports(target, messageSend)) { ... }
else ctx.logger.warn("该平台不支持此能力，跳过");
```

## Versioning

`defineCapability(name, version)` — version defaults to `1`. Same name with a different
version is a **different** capability (different token), so both can coexist:

- Implementation changed but the contract did not → keep the version, old plugins keep working.
- Request or response shape changed → bump the version; new and old implementations can
  coexist while plugins migrate explicitly.
