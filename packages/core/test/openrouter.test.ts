// OpenRouter: its catalogue, its attribution headers, and the key it sends.

import assert from 'node:assert/strict';
import { test } from 'vitest';

import { createLLM } from '../src/llm/client.ts';
import {
  createOpenRouter,
  OPENROUTER_BASE,
  OPENROUTER_REFERER,
  parseOpenRouterModels,
  pickOpenRouterModel,
  searchOpenRouterModels,
} from '../src/llm/openrouter.ts';
import type { Fetch } from '../src/llm/types.ts';
import { collect } from './fake.ts';

const catalogue = {
  data: [
    {
      id: 'acme/writer-1',
      name: 'Acme: Writer 1',
      description: 'A quick model for prose.',
      context_length: 200000,
      architecture: { modality: 'text->text', output_modalities: ['text'] },
      pricing: { prompt: '0.0000005', completion: '0.0000015' },
    },
    {
      id: 'acme/free-writer',
      name: 'Acme: Free Writer',
      context_length: 32000,
      architecture: { modality: 'text->text', output_modalities: ['text'] },
      pricing: { prompt: '0', completion: '0' },
    },
    {
      id: 'acme/painter',
      name: 'Acme: Painter',
      architecture: { modality: 'text->image', output_modalities: ['image'] },
      pricing: { prompt: '0.000001', completion: '0.00001' },
    },
    {
      id: 'acme/writer-1:batch',
      name: 'Acme: Writer 1 (batch)',
      architecture: { modality: 'text->text', output_modalities: ['text'] },
      pricing: { prompt: '0.00000025', completion: '0.00000075' },
    },
  ],
};

const streamOf = (lines: string[]) =>
  new Response(
    new ReadableStream({
      start(c) {
        for (const l of lines) c.enqueue(new TextEncoder().encode(l));
        c.close();
      },
    }),
  );

const streamed = [
  'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
  'data: {"choices":[{"delta":{"content":" there"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n',
];

test('OpenRouter: the catalogue keeps writing models, with context and price', () => {
  const models = parseOpenRouterModels(catalogue);
  assert.deepEqual(
    models.map((m) => m.id),
    ['acme/writer-1', 'acme/free-writer'],
  );
  assert.equal(models[0]!.name, 'Acme: Writer 1');
  assert.equal(models[0]!.context, 200000);
  assert.equal(models[0]!.inputPrice, 0.5);
  assert.equal(models[0]!.outputPrice, 1.5);
  assert.equal(models[1]!.free, true);
});

test('OpenRouter: search finds a model by name, id or description; the best default is in the catalogue', () => {
  const models = parseOpenRouterModels(catalogue);
  assert.deepEqual(
    searchOpenRouterModels(models, 'free').map((m) => m.id),
    ['acme/free-writer'],
  );
  assert.deepEqual(
    searchOpenRouterModels(models, 'prose').map((m) => m.id),
    ['acme/writer-1'],
  );
  assert.equal(pickOpenRouterModel(models), 'acme/writer-1');
  assert.equal(pickOpenRouterModel(models, ['not/here']), 'acme/writer-1');
});

test('OpenRouter: the picker opens on writing models, not the catalogue’s arbitrary order', () => {
  const models = parseOpenRouterModels({
    data: [
      {
        id: 'stealth/cloaked-alpha',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '0', completion: '0' },
      },
      {
        id: 'acme/other',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '0.000001', completion: '0.000002' },
      },
      {
        id: 'google/gemini-3.1-flash-lite',
        architecture: { output_modalities: ['text'] },
        pricing: { prompt: '0.0000001', completion: '0.0000002' },
      },
    ],
  });
  assert.deepEqual(
    searchOpenRouterModels(models, '').map((m) => m.id),
    ['google/gemini-3.1-flash-lite', 'acme/other', 'stealth/cloaked-alpha'],
  );
  // A search still finds a stealth model when the writer asks for one by name.
  assert.deepEqual(
    searchOpenRouterModels(models, 'cloaked').map((m) => m.id),
    ['stealth/cloaked-alpha'],
  );
});

test('OpenRouter: streams an answer, sends the key, and says where the request came from', async () => {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, unknown> }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({
      url,
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {},
    });
    if (url.endsWith('/models')) return Response.json(catalogue);
    return streamOf(streamed);
  }) as Fetch;
  const provider = createOpenRouter({ apiKey: '  sk-or-test  ', fetch });
  assert.equal(provider.kind, 'openrouter');
  assert.equal(provider.baseUrl, OPENROUTER_BASE);

  const text = (
    await collect(provider.stream({ model: 'acme/writer-1', messages: [{ role: 'user', content: 'hi' }] }))
  ).join('');
  assert.equal(text, 'Hello there');
  const chat = calls.find((c) => c.url.endsWith('/chat/completions'))!;
  assert.equal(chat.url, `${OPENROUTER_BASE}/chat/completions`);
  assert.equal(chat.headers.Authorization, 'Bearer sk-or-test');
  assert.equal(chat.headers['HTTP-Referer'], OPENROUTER_REFERER);
  assert.equal(chat.headers['X-Title'], 'Clearpen');
  assert.equal(chat.body.model, 'acme/writer-1');
});

test('OpenRouter: a model left over from a local server is ignored, and a good default used', async () => {
  const fetch = (async (input: string | URL | Request) =>
    String(input).endsWith('/models') ? Response.json(catalogue) : streamOf(streamed)) as Fetch;
  const provider = createOpenRouter({ apiKey: 'sk-or-test', fetch });
  const llm = createLLM({ provider, models: { quick: 'qwen3.5:4b' } });
  const status = await llm.status();
  assert.equal(status.ok, true);
  assert.equal(status.provider, 'openrouter');
  assert.equal(status.roles.quick, 'acme/writer-1');
  // Once the catalogue is known, a model it doesn't list is refused.
  assert.equal(provider.acceptsModel!('acme/writer-1'), true);
  assert.equal(provider.acceptsModel!('qwen3.5:4b'), false);
});

test('OpenRouter: a refused key says so in the writer’s words', async () => {
  const fetch = (async () =>
    new Response('{"error":{"message":"No auth credentials found"}}', { status: 401 })) as Fetch;
  const provider = createOpenRouter({ apiKey: 'sk-or-wrong', fetch });
  await assert.rejects(provider.listModels(), /API key was refused/);
  await assert.rejects(collect(provider.stream({ model: 'acme/writer-1', messages: [] })), /API key was refused/);
  assert.throws(() => createOpenRouter({ apiKey: '   ' }), /API key is needed/);
});
