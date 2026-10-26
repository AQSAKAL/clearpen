# @clearpen/core

Clearpen's engine. Pure TypeScript with no platform APIs, so the same code runs in the desktop app, the self-hosted server and the cloud.

## What's inside

| Module | Does |
|---|---|
| `checks` | Deterministic checks: arithmetic, table totals, ROI and payback, valuation maths, probabilities, text vs tables, consistency, fact-check cues, reasoning slips, procedure problems. Returns findings and the plain facts it verified. |
| `diff` | Word-level diff that turns a rewrite into the few spots that changed. |
| `edits` | Places a model's pinpoint edits (`insert_before`, `replace`…) exactly in the passage. |
| `integrity` | Flags figures, links, versions and code a rewrite changed, dropped or invented. |
| `analysis` | Instant writing stats and highlights: long sentences, passive voice, filler, clichés. |
| `anchor` | Finds a model's (slightly wrong) quote in the draft. |
| `markdown` | Safe Markdown → HTML for exports. |
| `outline` | The article's own outline: its sections and the notes under each. |
| `autocomplete` | The rules for the next logical sentence: when to ask (`nextSentenceSpot`), whether the paragraph has made its point (`paragraphVerdict`, from the judge's quotes), and whether a suggestion earns its place (`nextSentenceOk`). |
| `intent` | Is a typed instruction a check, a question, or an edit? And the guards that keep edits edits: `asksToWrite` refuses requests for new writing, `writesNewMaterial` drops a returned edit that writes a paragraph of new words. |
| `prompts`, `tidy` | Every prompt Clearpen sends, and the clean-up of every answer. |
| `llm/*` | Ollama and OpenAI-compatible providers, and the client: model roles (quick, coach, checker), stall protection, JSON answers. |
| `tasks/*` | The AI features. Async generators of events: `rewrite`, `edit`, `check`, `review`, `ask`. Structured answers: `nextSentence` (a verdict on the paragraph, and one sentence only if a part is missing), `think` (coach notes — the argument of a section, what comes next, objections; never prose), `outline`, `headlines`, `meta`. |

## Using it

```ts
import { check, createLLM, createOllama } from '@clearpen/core';

const llm = createLLM({ provider: createOllama() });

for await (const event of check(llm, { content, from, to, lens: 'factcheck' })) {
  if (event.type === 'item') console.log(event.item.verdict, event.item.explanation);
}
```

Every task is an async generator of typed events, so a desktop app can consume it directly and a server can forward it as server-sent events. Tasks throw `InputError` (with an HTTP-style `status`) for requests they can't do as asked.

Pass `fetch` to a provider to route requests through something else — Tauri's HTTP plugin, for example.
