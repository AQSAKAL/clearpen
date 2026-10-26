# Margin

**An open-source writing app with an editor in the margin — offline, on Mac, Windows and the web.**

Margin helps you write articles that hold up: an AI editor that suggests pinpoint changes you accept or reject, checks your facts, logic and numbers, and never rewrites a word of yours without asking. Everything runs on your own machine by default, with local models through [Ollama](https://ollama.com). When you're ready, publish to your own site.

> **Status:** early. This repository is being built in phases — see [the architecture](docs/ARCHITECTURE.md). Phase 1, the engine (`packages/core`), is done; the app around it comes next.

## What's here

```
packages/
  core/       the engine — checks, diffs, prompts, the LLM client and AI tasks
apps/
  desktop/    Tauri app for Mac and Windows            (phase 5)
  server/     self-hosted server with Postgres         (phase 4)
  web/        the app in a browser                     (phase 4)
docs/
  ARCHITECTURE.md
```

## Develop

You need Node 22.12+ and pnpm.

```bash
pnpm install
pnpm check        # lint, typecheck and test everything
pnpm test:watch   # tests while you work
```

To try the AI tasks against a real model, install [Ollama](https://ollama.com) and pull a model:

```bash
ollama pull qwen3:8b
```

## Principles

1. **Your words are yours.** Local by default; nothing leaves your machine unless you configure it to; everything exports to plain Markdown.
2. **Never lose a word.** Durable storage, versions, a trash, backups.
3. **AI proposes; you decide.** Pinpoint edits you accept one by one. Checks that say where their knowledge came from. Arithmetic done by code, never by a model.
4. **Write each feature once.** One engine runs on the desktop, the server and the cloud.

## License

AGPL-3.0-or-later, with a contributor licence agreement — see [CONTRIBUTING.md](CONTRIBUTING.md). The full licence text will be added as `LICENSE` once the licence and CLA have had a legal review.
