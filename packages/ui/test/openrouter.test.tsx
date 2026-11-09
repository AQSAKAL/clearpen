// OpenRouter from the interface: the writer's key, kept out of the library,
// and the model chosen from OpenRouter's catalogue.

import assert from 'node:assert/strict';
import { createOpenRouter, type Fetch } from '@clearpen/core';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { testBackend } from './memory-backend.ts';

const KEY = 'sk-or-v1-test-key-not-real';

const catalogue = {
  data: [
    {
      id: 'google/gemini-3.1-flash-lite',
      name: 'Google: Gemini 3.1 Flash Lite',
      description: 'Fast and inexpensive.',
      context_length: 1048576,
      architecture: { modality: 'text->text', output_modalities: ['text'] },
      pricing: { prompt: '0.00000025', completion: '0.0000015' },
    },
    {
      id: 'acme/writer',
      name: 'Acme Writer',
      description: 'Another model.',
      context_length: 128000,
      architecture: { modality: 'text->text', output_modalities: ['text'] },
      pricing: { prompt: '0.000001', completion: '0.000002' },
    },
  ],
};

/** OpenRouter as far as the test goes: its catalogue, and only this key. */
function openRouterFetch(expected = KEY): Fetch {
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.endsWith('/models')) return new Response('not used in this test', { status: 500 });
    const auth = new Headers(init?.headers).get('Authorization');
    if (auth !== `Bearer ${expected}`) return new Response('{"error":"no auth"}', { status: 401 });
    return Response.json(catalogue);
  }) as Fetch;
}

async function launch(fetch: Fetch = openRouterFetch()) {
  const backend = await testBackend([], {
    machine: { running: true, installed: ['qwen3:8b'] },
    openRouter: (apiKey) => createOpenRouter({ apiKey, fetch }),
  });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  // A model is ready, so the goal step is first; skip it.
  await user.click(await screen.findByRole('button', { name: 'Not now' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  return { backend, user };
}

async function openModels(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^Models: / }));
  await screen.findByRole('heading', { name: 'Models' });
  await user.click(screen.getByRole('tab', { name: 'OpenRouter' }));
}

test('a key connects, is kept in the secret store and out of the library, and a model can be chosen', async () => {
  const { backend, user } = await launch();
  await openModels(user);

  await user.type(screen.getByLabelText('OpenRouter API key'), KEY);
  await user.click(screen.getByRole('button', { name: 'Connect' }));

  await screen.findByText(/Connected to OpenRouter/, {}, { timeout: 4000 });
  assert.equal(await backend.secrets.get('openrouter'), KEY);
  assert.equal(await backend.library.settings.get('aiProvider'), 'openrouter');
  assert.deepEqual(await backend.library.settings.get('openrouterModels'), { quick: 'google/gemini-3.1-flash-lite' });
  // The key is nowhere in the settings the library keeps.
  assert.ok(!JSON.stringify(await backend.library.settings.all()).includes(KEY));

  const status = await backend.ai.status();
  assert.equal(status.provider, 'openrouter');
  assert.equal(status.roles.quick, 'google/gemini-3.1-flash-lite');

  // The sidebar says what is answering now, without a restart or a wait.
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Models: google/gemini-3.1-flash-lite' });

  // Any model in the catalogue is one click away.
  await openModels(user);
  await user.click(await screen.findByRole('option', { name: /Acme Writer/ }));
  assert.deepEqual(await backend.library.settings.get('openrouterModels'), { quick: 'acme/writer' });
  assert.equal((await backend.ai.status()).roles.quick, 'acme/writer');
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await screen.findByRole('button', { name: 'Models: acme/writer' });
});

test('a refused key says so and is not saved', async () => {
  const { backend, user } = await launch(openRouterFetch('some-other-key'));
  await openModels(user);

  await user.type(screen.getByLabelText('OpenRouter API key'), KEY);
  await user.click(screen.getByRole('button', { name: 'Connect' }));

  const alert = await screen.findByRole('alert', {}, { timeout: 4000 });
  assert.match(alert.textContent ?? '', /API key was refused/);
  assert.equal(await backend.secrets.get('openrouter'), null);
  assert.ok(!(await backend.library.settings.get('aiProvider')));
  assert.ok(!JSON.stringify(await backend.library.settings.all()).includes(KEY));
});

test('after connecting, a suggestion is written by OpenRouter, not the local model', async () => {
  const calls: { url: string; body: Record<string, unknown>; auth: string | null }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    calls.push({ url, body, auth: new Headers(init?.headers).get('Authorization') });
    if (url.endsWith('/models')) return Response.json(catalogue);
    // The judge asks for JSON; the sentence streams as server-sent events.
    if (!body.stream)
      return Response.json({ choices: [{ message: { content: '{"point":1,"support":2,"meaning":0}' } }] });
    return new Response(
      new ReadableStream({
        start(c) {
          c.enqueue(
            new TextEncoder().encode(
              'data: {"choices":[{"delta":{"content":"That keeps every customer’s request moving without a single bottleneck."}}]}\n\ndata: [DONE]\n\n',
            ),
          );
          c.close();
        },
      }),
    );
  }) as Fetch;

  const backend = await testBackend([], {
    machine: { running: true, installed: ['qwen3:8b'] },
    openRouter: (apiKey) => createOpenRouter({ apiKey, fetch }),
  });

  await backend.ai.switchToOpenRouter(KEY);
  const events: { type: string; next?: string }[] = [];
  for await (const ev of backend.ai.nextSentence({
    before:
      'The shared inbox worked because no ticket waited for one person. Requests now reach whoever is free first. ',
  }))
    events.push(ev);

  assert.ok(calls.every((c) => c.url.startsWith('https://openrouter.ai/api/v1/')));
  assert.ok(calls.every((c) => c.auth === `Bearer ${KEY}`));
  assert.equal(calls.find((c) => c.body.stream)?.body.model, 'google/gemini-3.1-flash-lite');
  assert.equal(
    events.find((e) => e.type === 'done')?.next,
    'That keeps every customer’s request moving without a single bottleneck.',
  );
});

test('with no Ollama, first-run setup offers OpenRouter and finishes with it', async () => {
  const fetch = openRouterFetch();
  const backend = await testBackend([], {
    machine: { running: false, installed: [] },
    openRouter: (apiKey) => createOpenRouter({ apiKey, fetch }),
  });
  const user = userEvent.setup();
  render(<App backend={backend} />);

  await screen.findByRole('heading', { name: 'Set up Clearpen’s AI' });
  await user.click(screen.getByRole('button', { name: 'Use OpenRouter instead' }));
  await screen.findByRole('heading', { name: 'Use OpenRouter' });
  await user.type(screen.getByLabelText('OpenRouter API key'), KEY);
  await user.click(screen.getByRole('button', { name: 'Connect' }));

  await screen.findByRole('heading', { name: 'Clearpen is ready' }, { timeout: 4000 });
  assert.match(screen.getByText(/answers through OpenRouter/).textContent ?? '', /OpenRouter/);
  assert.equal(await backend.secrets.get('openrouter'), KEY);
  assert.equal(await backend.library.settings.get('aiProvider'), 'openrouter');
});
