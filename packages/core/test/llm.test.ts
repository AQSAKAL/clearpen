// The model clients, against fake servers: what they send, how they read
// streams, and how they cope with servers that misbehave.
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createLLM, pickModel } from '../src/llm/client.ts';
import { createOllama } from '../src/llm/ollama.ts';
import { createOpenAICompatible } from '../src/llm/openai.ts';
import type { Fetch } from '../src/llm/types.ts';
import { anySignal, thinkFilter } from '../src/llm/util.ts';
import { collect, fakeProvider } from './fake.ts';

/** A fetch that records calls and answers from `route`. */
function fakeFetch(route: (url: string, body: Record<string, unknown>) => Response) {
  const calls: { url: string; body: Record<string, unknown>; headers: Record<string, string> }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body, headers: (init?.headers ?? {}) as Record<string, string> });
    return route(url, body);
  }) as Fetch;
  return { fetch, calls };
}

const streamOf = (lines: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(l));
        c.close();
      },
    }),
  );

test('Ollama: streams text, hides thinking, and reports a cut-off answer', async () => {
  const { fetch, calls } = fakeFetch((url) => {
    if (url.endsWith('/api/show')) return Response.json({ capabilities: ['completion', 'thinking'] });
    return streamOf([
      '{"message":{"content":"<think>hmm"}}\n{"message":{"content":"</think>Hel"}}\n',
      '{"message":{"content":"lo"}}\n{"done":true,"done_reason":"length"}\n',
    ]);
  });
  const ollama = createOllama({ fetch, numCtx: 8192, keepAlive: '1h' });
  const info: { truncated?: boolean } = {};
  const text = (
    await collect(ollama.stream({ model: 'qwen3:8b', messages: [{ role: 'user', content: 'hi' }], maxTokens: 5 }, info))
  ).join('');
  assert.equal(text, 'Hello');
  assert.equal(info.truncated, true);
  const chat = calls.find((c) => c.url.endsWith('/api/chat'))!;
  assert.equal(chat.body.think, false, 'thinking models are told not to think aloud');
  assert.equal(chat.body.keep_alive, '1h');
  assert.deepEqual((chat.body.options as Record<string, unknown>).num_ctx, 8192);
});

test('Ollama: an engine without structured output is asked again without the schema', async () => {
  let attempts = 0;
  const { fetch, calls } = fakeFetch((url, body) => {
    if (url.endsWith('/api/show')) return Response.json({ capabilities: [] });
    attempts++;
    if (body.format) return new Response('structured output is unavailable', { status: 501 });
    return Response.json({ message: { content: '{"ok":true}' } });
  });
  const ollama = createOllama({ fetch });
  assert.equal(
    await ollama.complete({ model: 'gemma4:12b-mlx', messages: [], format: { type: 'object' } }),
    '{"ok":true}',
  );
  assert.equal(attempts, 2);
  // Remembered: the next request doesn't try the schema at all.
  await ollama.complete({ model: 'gemma4:12b-mlx', messages: [], format: { type: 'object' } });
  assert.equal(calls.filter((c) => c.url.endsWith('/api/chat')).at(-1)!.body.format, undefined);
});

test('Ollama: a server that is down gets a sentence the writer can act on', async () => {
  const fetch = (async () => {
    throw new TypeError('fetch failed');
  }) as Fetch;
  const ollama = createOllama({ fetch });
  await assert.rejects(collect(ollama.stream({ model: 'm', messages: [] })), /Start it with "ollama serve"/);
  const llm = createLLM({ provider: ollama });
  const s = await llm.status();
  assert.equal(s.ok, false);
  assert.match(s.error!, /ollama serve/);
});

test('OpenAI-compatible: reads server-sent events and sends the key', async () => {
  const { fetch, calls } = fakeFetch(() =>
    streamOf([
      'data: {"choices":[{"delta":{"content":"Hi "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"there"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
    ]),
  );
  const api = createOpenAICompatible({ baseUrl: 'https://llm.example/v1/', apiKey: 'sk-test', fetch });
  const info: { truncated?: boolean } = {};
  assert.equal(
    (await collect(api.stream({ model: 'm', messages: [], format: { type: 'object' } }, info))).join(''),
    'Hi there',
  );
  assert.equal(info.truncated, false);
  assert.equal(calls[0]!.url, 'https://llm.example/v1/chat/completions');
  assert.equal(calls[0]!.headers.Authorization, 'Bearer sk-test');
  assert.equal((calls[0]!.body.response_format as { type: string }).type, 'json_schema');
});

test('a model that goes quiet is stopped, with a clear error', async () => {
  const provider = fakeProvider({ stream: () => 'hang' });
  const llm = createLLM({ provider, models: { quick: 'q' }, stallMs: 30 });
  await assert.rejects(collect(llm.stream({ model: 'q', messages: [] })), /The model stopped responding/);
  // The writer's own cancel is not reported as a stall.
  const ctrl = new AbortController();
  const run = collect(createLLM({ provider, stallMs: 5000 }).stream({ model: 'q', messages: [], signal: ctrl.signal }));
  ctrl.abort();
  await assert.rejects(run, (err: Error) => !/stopped responding/.test(err.message));
});

test('roles default sensibly and an explicit choice wins', async () => {
  assert.equal(pickModel(['nomic-embed-text', 'llama3.1:8b', 'qwen3:8b']), 'qwen3:8b');
  assert.equal(pickModel(['nomic-embed-text', 'something-new']), 'something-new');
  assert.equal(pickModel([]), null);
  const llm = createLLM({ provider: fakeProvider({}), models: { quick: 'quick-model' } });
  assert.equal(await llm.modelFor('writer'), 'quick-model', 'every role falls back to the quick model');
  llm.setModel('checker', 'writer-model');
  assert.equal(await llm.modelFor('checker'), 'writer-model');
  const s = await llm.status();
  assert.deepEqual(s.roles, { quick: 'quick-model', writer: 'quick-model', checker: 'writer-model' });
});

test('thinking is hidden even when a tag is split across chunks', () => {
  const f = thinkFilter();
  assert.equal(['A<th', 'ink>secret</th', 'ink>B'].map(f).join(''), 'AB');
  const ctrl = new AbortController();
  const signal = anySignal([undefined, ctrl.signal, new AbortController().signal]);
  ctrl.abort();
  assert.equal(signal.aborted, true);
});
