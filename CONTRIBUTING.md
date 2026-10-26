# Contributing to Margin

Thank you for helping. A few things make contributions easy to accept.

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — it explains where code belongs and why.
- For anything bigger than a fix, open an issue first so we can agree on the approach.

## Working on the code

```bash
pnpm install
pnpm check   # must pass before you open a pull request
```

- **TypeScript, strict.** No `any`. `packages/core` must run anywhere JavaScript does: no Node, browser or Tauri APIs inside it — pass them in (see `fetch` in the LLM providers).
- **Tests come with changes.** Logic gets unit tests; anything that talks to a model is tested against the scripted fake in `packages/core/test/fake.ts`.
- **The AI never writes the author's prose.** Features help the writer think — outlines, the steps of an argument, objections, questions, checks — and never draft paragraphs, openings, endings or examples for them.
- **AI changes are pinpoint.** A feature that changes the writer's text must produce small, separately reviewable edits, never a silent rewrite.
- **Numbers are checked by code.** Never ask a model to do arithmetic the engine can do exactly.
- Formatting and lint are Biome's: `pnpm format` fixes most things.

## Licence and CLA

Margin is licensed under the AGPL-3.0-or-later. Contributions are accepted under a contributor licence agreement, which lets the project also offer Margin as a hosted service. You'll be asked to sign it on your first pull request. (The CLA text is being finalised.)
