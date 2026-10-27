# Clearpen

**An open-source writing app with an editor in the margin — offline, on Mac, Windows and the web.**

Clearpen helps you write articles that hold up. You do the writing; Clearpen edits and helps you think: it suggests pinpoint edits to what you wrote that you accept or reject, lays out the argument of a section, the objection to answer and the evidence to find, and checks your facts, logic and numbers. It never writes your article from scratch. Everything runs on your own machine by default, with local models through [Ollama](https://ollama.com). When you're ready, publish to your own site.

> **Status:** early. This repository is being built in phases — see [the architecture](docs/ARCHITECTURE.md). The engine (`packages/core`) is done, and the writing app runs on the desktop: library, editor, versions and export, and the AI features — pinpoint edits, next-sentence suggestions, autocorrect, review and checks — on a local model. Thinking aids and publishing come next (see [the plan](docs/plans/writing-app.md)).

## Download

Installers for Mac and Windows are on the [Releases page](https://github.com/AQSAKAL/clearpen/releases). They're early builds and not signed yet, so your computer warns you the first time you open Clearpen.

| | Download | The first time |
|---|---|---|
| **Mac** — Apple silicon or Intel, macOS 13.3 or later | `Clearpen_<version>_universal.dmg` | Open it and drag Clearpen to Applications. When macOS says it can't check the app, go to System Settings → Privacy & Security and choose **Open Anyway**. |
| **Windows** — 10 or 11, 64-bit | `Clearpen_<version>_x64-setup.exe`, or the `.msi` | Run it. If SmartScreen says "Windows protected your PC", choose **More info** → **Run anyway**. |

Clearpen's AI runs on your computer, through [Ollama](https://ollama.com), which is free. The first time you open Clearpen, it checks for Ollama and links you to it if it's missing. Then it downloads a writing model for you, with its progress:

- **Qwen3 8B** (5.2 GB), for computers with 16 GB of memory or more;
- **Qwen3 4B** (2.5 GB), lighter and quicker, for 8 GB.

You can write without the AI: choose **Not now**, and set it up later from the sidebar. Your writing stays on your computer.

## What's here

```
packages/
  core/       the engine — checks, diffs, prompts, the LLM client and AI tasks
  db/         the library — schema, migrations and repositories (SQLite; Postgres with the server)
  editor/     the CodeMirror editor — Markdown, ghost text, tracked suggestions, notes, images
  ui/         the app in React and shadcn/ui, behind a Backend interface
apps/
  desktop/    Tauri app for Mac and Windows
  server/     self-hosted server with Postgres         (phase 4)
  web/        the app in a browser                     (phase 4)
docs/
  ARCHITECTURE.md
```

## Develop

You need Node 24+ and pnpm.

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

1. **You write; Clearpen edits and helps you think.** The AI never writes your article from scratch — no drafted sections, paragraphs, openings or conclusions. It edits what you wrote, outlines logic and argument, and checks facts and reasoning. The one exception is the next logical sentence: when you finish a sentence and pause, Clearpen first checks whether your paragraph has made its point. Only if something is missing does it suggest the one sentence that supplies it — in grey, used only if you accept it, and never twice in a row.
2. **Your words are yours.** Local by default; nothing leaves your machine unless you configure it to; everything exports to plain Markdown.
3. **Never lose a word.** Durable storage, versions, a trash, backups.
4. **AI proposes; you decide.** Pinpoint edits you accept one by one. Checks that say where their knowledge came from. Arithmetic done by code, never by a model.
5. **Write each feature once.** One engine runs on the desktop, the server and the cloud.

## License

AGPL-3.0-or-later — see [LICENSE](LICENSE). Contributions are accepted under a contributor licence agreement; see [CONTRIBUTING.md](CONTRIBUTING.md).
