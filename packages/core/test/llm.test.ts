// The model clients, against fake servers: what they send, how they read
// streams, and how they cope with servers that misbehave.
import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createLLM, pickModel } from '../src/llm/client.ts';
import { formatBytes, MODEL_OFFERS, recommendedOffer } from '../src/llm/offers.ts';
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
  assert.equal(pickModel(['qwen3:8b', 'gemma4:12b-mlx', 'qwen3.5:4b']), 'qwen3.5:4b', 'Qwen3.5 4B first');
  assert.equal(pickModel(['nomic-embed-text', 'something-new']), 'something-new');
  assert.equal(pickModel([]), null);
  const llm = createLLM({ provider: fakeProvider({}), models: { quick: 'quick-model' } });
  assert.equal(await llm.modelFor('coach'), 'quick-model', 'every role falls back to the quick model');
  llm.setModel('checker', 'big-model');
  assert.equal(await llm.modelFor('checker'), 'big-model');
  const s = await llm.status();
  assert.deepEqual(s.roles, { quick: 'quick-model', coach: 'quick-model', checker: 'big-model' });
});

test('thinking is hidden even when a tag is split across chunks', () => {
  const f = thinkFilter();
  assert.equal(['A<th', 'ink>secret</th', 'ink>B'].map(f).join(''), 'AB');
  const ctrl = new AbortController();
  const signal = anySignal([undefined, ctrl.signal, new AbortController().signal]);
  ctrl.abort();
  assert.equal(signal.aborted, true);
});

test('Ollama: a model downloads with its progress summed over every part', async () => {
  const { fetch, calls } = fakeFetch(() =>
    streamOf([
      '{"status":"pulling manifest"}\n',
      '{"status":"pulling aaa","digest":"sha256:aaa","total":1000,"completed":0}\n',
      '{"status":"pulling aaa","digest":"sha256:aaa","total":1000,"completed":600}\n{"status":"pulling aaa","digest":"sha256:aaa","total":1000,"completed":1000}\n',
      '{"status":"pulling bbb","digest":"sha256:bbb","total":10,"completed":5}\n',
      '{"status":"verifying sha256 digest"}\n{"status":"writing manifest"}\n{"status":"success"}\n',
    ]),
  );
  const ollama = createOllama({ fetch });
  const steps = await collect(ollama.pull!('qwen3:4b'));
  assert.deepEqual(calls[0]!.body, { model: 'qwen3:4b', stream: true });
  assert.deepEqual(
    steps.map((p) => [p.completed, p.total]),
    [
      [0, 0],
      [0, 1000],
      [600, 1000],
      [1000, 1000],
      [1005, 1010],
      [1005, 1010],
      [1005, 1010],
      [1010, 1010],
    ],
  );
  assert.equal(steps.at(-1)!.done, true);
  assert.equal(steps.filter((p) => p.done).length, 1);
});

test('Ollama: a download that fails or stops early says so', async () => {
  const failing = createOllama({
    fetch: fakeFetch(() =>
      streamOf(['{"status":"pulling manifest"}\n{"error":"pull model manifest: file does not exist"}\n']),
    ).fetch,
  });
  await assert.rejects(collect(failing.pull!('qwen3:nope')), /file does not exist/);
  const cut = createOllama({
    fetch: fakeFetch(() => streamOf(['{"status":"pulling aaa","digest":"sha256:aaa","total":9,"completed":3}\n']))
      .fetch,
  });
  await assert.rejects(collect(cut.pull!('qwen3:4b')), /stopped before it finished/);
  const away = createOllama({
    fetch: (async () => {
      throw new TypeError('fetch failed');
    }) as Fetch,
  });
  await assert.rejects(collect(away.pull!('qwen3:4b')), /Cannot reach Ollama/);
});

test('status tells "Ollama isn’t running" from "no model yet"', async () => {
  const none = createLLM({ provider: fakeProvider({}) });
  // fakeProvider lists three models; one with none installed:
  const empty = createLLM({ provider: { ...fakeProvider({}), listModels: async () => [] } });
  assert.equal((await none.status()).reachable, true);
  const s = await empty.status();
  assert.deepEqual([s.ok, s.reachable, s.error], [false, true, 'No models installed.']);
  const away = createLLM({
    provider: {
      ...fakeProvider({}),
      listModels: async () => {
        throw new TypeError('fetch failed');
      },
    },
  });
  assert.deepEqual([(await away.status()).ok, (await away.status()).reachable], [false, false]);
});

test('the model to offer depends on the memory there is', () => {
  const GB = 2 ** 30;
  assert.equal(recommendedOffer(null).model, 'qwen3.5:4b', 'unknown: the best one');
  assert.equal(recommendedOffer(24 * GB).model, 'qwen3.5:4b');
  assert.equal(recommendedOffer(7.8 * GB).model, 'qwen3.5:4b', 'an 8 GB machine reports a little less');
  assert.equal(recommendedOffer(4 * GB).model, 'qwen3:4b-instruct', 'the lightest when nothing fits');
  assert.ok(
    MODEL_OFFERS.every((o) => pickModel([o.model]) === o.model),
    'every offer is a model Clearpen will use',
  );
  assert.deepEqual(
    [formatBytes(5.23e9), formatBytes(2.5e9), formatBytes(480e6), formatBytes(12e3)],
    ['5.2 GB', '2.5 GB', '480 MB', '12 KB'],
  );
});
