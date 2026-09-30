# Mioku Skills

Agent Skills for developing on the [Mioku](https://github.com/mioku-lab/mioku) bot
framework. Written for coding agents (Codex, Claude Code, Cursor, OpenCode and any other
tool that reads `SKILL.md`), and useful as a reference for people too.

Follows the open [Agent Skills](https://agentskills.io/) standard.

## Install

```bash
npx skills add mioku-lab/skills
```

Or copy any folder under `skills/` into your agent's skills directory
(`~/.agents/skills/`, `.agents/skills/`, `~/.codex/skills/`, …).

## Contributing

Conventions for the skills themselves:

- `name` matches the folder name, lowercase with hyphens.
- Frontmatter uses only `name`, `description` (and optionally `license` / `metadata`).
  Do not add `compatibility` — some validators reject unrecognised keys.
- Keep `SKILL.md` under ~250 lines and push detail into `references/`.
- Write English. Front-load trigger words in `description`, since hosts may truncate it.

## Licence

MIT
