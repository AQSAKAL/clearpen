// The desktop shell's first screen: proof that the app's parts work together
// on this computer — the engine, a local model through the HTTP plugin, and
// the library in a SQLite file. The editor replaces it in phase 3.
//
// Each check's outcome is also saved in the library (app_meta.shell_check),
// so a build can be verified without looking at the window.

import { CATEGORY_LABELS, createLLM, createOllama, type LLMClient, runChecks } from '@margin/core';
import { getVersion } from '@tauri-apps/api/app';
import { appConfigDir, join } from '@tauri-apps/api/path';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import Database from '@tauri-apps/plugin-sql';

const SAMPLE = `# Why we moved support to a shared inbox

Our pilot cut support tickets from 400 to 300 a month. Each ticket costs $25 to handle, so we save $2,500 a month.

| Cost     | Before  | After  |
|----------|---------|--------|
| Staff    | $9,000  | $7,000 |
| Software | $1,000  | $1,500 |
| Total    | $10,000 | $9,500 |

Since the switch, every customer has been happier.
`;

type State = 'wait' | 'ok' | 'warn' | 'fail';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

function show(id: string, state: State, result: string) {
  const el = $(id);
  el.dataset.state = state;
  el.querySelector('.result')!.textContent = result;
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

const report: Record<string, unknown> = {};
let saveReport: () => Promise<void> = async () => {};

// Ollama turns away origins it doesn't know, and on Windows the app's origin
// is http://tauri.localhost. A native app needs no Origin at all: an empty one
// tells the HTTP plugin to send none (its "unsafe-headers" feature).
const localFetch: typeof fetch = (input, init = {}) => {
  const headers = new Headers(init.headers);
  headers.set('Origin', '');
  return tauriFetch(input, { ...init, headers });
};

function checkText() {
  const text = $<HTMLTextAreaElement>('sample').value;
  const { findings } = runChecks(text);
  const list = $('findings');
  list.replaceChildren(
    ...findings.map((f) => {
      const li = document.createElement('li');
      const label = CATEGORY_LABELS[f.category] ?? f.category;
      const quote = text.slice(f.from, f.to);
      li.innerHTML = '<span class="cat"></span><strong></strong> <q></q><p></p>';
      li.querySelector('.cat')!.textContent = label;
      li.querySelector('strong')!.textContent = f.title;
      li.querySelector('q')!.textContent = quote.length > 60 ? `${quote.slice(0, 60)}…` : quote;
      li.querySelector('p')!.textContent = f.suggestion ? `${f.message} → ${f.suggestion}` : f.message;
      return li;
    }),
  );
  if (!findings.length) list.innerHTML = '<li class="none">Nothing to flag.</li>';
  return findings;
}

function engine() {
  const sample = $<HTMLTextAreaElement>('sample');
  sample.value = SAMPLE;
  try {
    const findings = checkText();
    report.engine = { ok: true, findings: findings.map((f) => f.kind) };
    const n = findings.length;
    show('engine', 'ok', `Found ${n} problem${n === 1 ? '' : 's'} in the sample below, offline.`);
  } catch (err) {
    report.engine = { ok: false, error: message(err) };
    show('engine', 'fail', message(err));
  }
  let timer = 0;
  sample.addEventListener('input', () => {
    clearTimeout(timer);
    timer = window.setTimeout(checkText, 250);
  });
}

async function testReply(llm: LLMClient, model: string) {
  const button = $<HTMLButtonElement>('test-model');
  button.hidden = true;
  show('model', 'wait', `Asking ${model} to count to twelve…`);
  // A reply of many tokens, shown as it arrives: proof that answers stream
  // through the HTTP plugin rather than arriving all at once.
  const started = performance.now();
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
  let firstMs = 0;
  let chunks = 0;
  let text = '';
  try {
    for await (const chunk of llm.stream({
      model,
      messages: [{ role: 'user', content: 'Count from one to twelve in words, separated by spaces. Nothing else.' }],
      temperature: 0,
      maxTokens: 60,
    })) {
      if (!chunks++) firstMs = Math.round(performance.now() - started);
      text += chunk;
      show('model', 'wait', `${model}: ${text.trim()}`);
    }
    const ms = Math.round(performance.now() - started);
    report.stream = { ok: true, model, chunks, firstMs, ms, text: text.trim() };
    show(
      'model',
      'ok',
      `${model} streamed “${text.trim()}” in ${chunks} pieces: the first after ${secs(firstMs)}, the last after ${secs(ms)}.`,
    );
  } catch (err) {
    report.stream = { ok: false, model, error: message(err) };
    show('model', 'fail', message(err));
    button.hidden = false;
  }
  await saveReport();
}

async function model() {
  const llm = createLLM({ provider: createOllama({ fetch: localFetch }) });
  const status = await llm.status();
  report.model = { ok: status.ok, quick: status.roles.quick, models: status.models.length, error: status.error };
  if (!status.ok || !status.roles.quick) {
    show('model', 'warn', status.error || 'No model found.');
    return;
  }
  const quick = status.roles.quick;
  // Don't load a model into memory just to show this screen: test a reply
  // straight away only if it's already loaded, otherwise on request.
  if (await llm.provider.isLoaded(quick)) return testReply(llm, quick);
  show('model', 'ok', `Ollama is running with ${status.models.length} models; Margin would use ${quick}.`);
  const button = $<HTMLButtonElement>('test-model');
  button.hidden = false;
  button.onclick = () => testReply(llm, quick);
}

async function library() {
  const db = await Database.load('sqlite:library.db');
  await db.execute('CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)');
  await db.execute("INSERT INTO app_meta (key, value) VALUES ('first_run', $1) ON CONFLICT (key) DO NOTHING", [
    new Date().toISOString(),
  ]);
  await db.execute(
    "INSERT INTO app_meta (key, value) VALUES ('launches', '1') ON CONFLICT (key) DO UPDATE SET value = CAST(value AS INTEGER) + 1",
  );
  const rows = await db.select<{ key: string; value: string }[]>('SELECT key, value FROM app_meta');
  const meta = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const path = await join(await appConfigDir(), 'library.db');
  const launches = Number(meta.launches);
  report.library = { ok: true, path, launches };
  show('library', 'ok', `${path} — opened ${launches === 1 ? 'for the first time' : `${launches} times`}.`);
  saveReport = async () => {
    await db.execute(
      "INSERT INTO app_meta (key, value) VALUES ('shell_check', $1) ON CONFLICT (key) DO UPDATE SET value = excluded.value",
      [JSON.stringify({ at: new Date().toISOString(), ...report })],
    );
  };
}

async function main() {
  getVersion().then((v) => {
    $('version').textContent = `Desktop shell · v${v}`;
  });
  engine();
  await Promise.all([
    library().catch((err) => {
      report.library = { ok: false, error: message(err) };
      show('library', 'fail', message(err));
    }),
    model().catch((err) => {
      report.model = { ok: false, error: message(err) };
      show('model', 'fail', message(err));
    }),
  ]);
  await saveReport();
}

main();
