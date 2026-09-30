# Layout and naming

## Package layout

The loader opens the **package root** `index.ts` (or `index.js`). There is no `src/`
convention for plugins, services and adapters — putting the entry in `src/main.ts` means
it will not be found.

```
mioku-plugin-<short>/
├── package.json          name, main: "index.ts", type: "module", keywords, mioku field
├── index.ts              REQUIRED entry — definePlugin + setup
├── config.md             optional WebUI config form (package root)
├── README.md             what it does, how to configure it
├── agents/               optional; Agent-Skill metadata, unrelated to Mioku runtime
└── <feature>/            optional feature folders
    ├── index.ts
    └── ...
```

Not every package needs every file. `config.md` only when the plugin has config,
`README.md` always for a published package.

## Entry resolution

The loader tries, in order:

1. an explicit entry path in the package's `mioku` field
2. `main` / `module` / `exports["."]`
3. `dist/index.mjs`, `dist/index.js`, `index.mjs`, `index.js`

Entries are imported with jiti, so `main: "index.ts"` works. Building to JS is still the
more robust choice for a published package.

## Naming rules that are enforced at load time

| Thing | Rule | Failure |
|---|---|---|
| Plugin | package short name == `definePlugin.name` == folder name for local plugins | `Plugin canonical ID mismatch` |
| Adapter | package short name == `defineAdapter.name`, and `apiVersion === 1` | adapter rejected |
| Service | folder name / package short name == `MiokuService.name` | service not registered under the expected key |
| Command `id` | default is the command `name`; `aliases` never become ids | `access-control.json` entries silently miss |

Package short name means the package name minus its prefix: `mioku-plugin-weather` →
`weather`.

## File naming

- `kebab-case.ts` for modules: `data-collector.ts`, `html-generator.ts`, `tool-loop.ts`.
- `index.ts` for an entry point or a feature folder's public surface.
- Avoid `utils.ts` grab bags. If you must have one, keep it to genuinely generic helpers
  and split domain logic out. `mioku-plugin-help/utils.ts` is the tolerated size ceiling.
- Test files, if any: `*.test.ts` next to the module.

## Symbol naming

| Kind | Convention | Example |
|---|---|---|
| Service public interface | `<Domain>Api` | `AudioServiceApi`, `SentenceAPI` |
| Plugin default export | `definePlugin({...})` | — |
| Factory for a feature | `create<Thing>` | `createHelpSkill`, `createEchoBot` |
| Capability constant | `<domain><Verb>` | `messageSend`, `memberBan`, `ttsSpeak` |
| Route string | `[adapter:]kind[.subtype]` | `onebotv11:message.group` |
| Config file | `<name>.json` under `config/<plugin>/` | `config/chat/settings.json` |

## Abbreviations

Use the ones already in the codebase rather than inventing your own spelling:

`ctx` · `cfg` · `db` · `seg` · `ev` / `event` · `req` / `res` · `opts` · `cb` · `str` ·
`len` · `arr` · `obj` · `id` · `uid` · `gid` · `tmp` · `err` · `i` / `j` / `n`

Anything domain-specific gets a real name: `group_id`, `message_type`, `wholeBan`,
`crossAdapter`. Do not abbreviate away meaning to save keystrokes.
