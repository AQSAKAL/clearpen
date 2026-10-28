// First-run setup, end to end on a fake computer: no Ollama, then Ollama with
// no model, the model downloaded with its progress, a download that stops,
// "Not now", and another model from the Models dialog. On a fresh library the
// goal step ("What will you write?") follows the setup; onboarding.test.tsx
// walks it, and these tests only see it come after.

import assert from 'node:assert/strict';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { OLLAMA_DOWNLOAD } from '../src/setup.tsx';
import type { FakeMachine } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

const GB = 2 ** 30;
const slow = { timeout: 4000 };

async function launch(machine: FakeMachine, memory: number | null = null) {
  const backend = await testBackend([], { machine, memory });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  return { backend, user };
}

test('with no Ollama, setup links to it, finds it once it runs, and downloads the model that fits', async () => {
  const machine: FakeMachine = { running: false, installed: [] };
  const { backend, user } = await launch(machine, 8 * GB);
  await screen.findByRole('heading', { name: 'Set up Clearpen’s AI' });
  await user.click(screen.getByRole('button', { name: 'Download Ollama' }));
  assert.deepEqual(backend.opened, [OLLAMA_DOWNLOAD]);

  // The writer installs and opens Ollama.
  machine.running = true;
  await screen.findByRole('heading', { name: 'Choose your writing model' }, slow);
  assert.match(screen.getByText(/This Mac has 8 GB of memory/).textContent ?? '', /8 GB/);
  // On 8 GB the lighter model is the one to have.
  assert.equal(screen.getByRole('radio', { name: /Qwen3 4B/ }).getAttribute('aria-checked'), 'true');
  await user.click(screen.getByRole('button', { name: 'Download 2.5 GB' }));

  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
  assert.ok(machine.installed.includes('qwen3:4b-instruct'));
  assert.deepEqual(await backend.library.settings.get('models'), { quick: 'qwen3:4b-instruct' });
  await user.click(screen.getByRole('button', { name: 'Start writing' }));
  // Only then, the goal step.
  await screen.findByRole('heading', { name: 'What will you write?' });
});

test('the download shows its progress, here and in the sidebar', async () => {
  // The download waits part-way until the test has seen it: left to run, it
  // finished before the sidebar was looked at on a slow runner, and the window
  // on screen was "Clearpen is ready".
  let finish = () => {};
  const machine: FakeMachine = {
    running: true,
    installed: [],
    pullHold: new Promise<void>((r) => {
      finish = r;
    }),
  };
  const { user } = await launch(machine, 32 * GB);
  await screen.findByRole('heading', { name: 'Choose your writing model' }, slow);
  assert.equal(screen.getByRole('radio', { name: /Qwen3 8B/ }).getAttribute('aria-checked'), 'true');
  await user.click(screen.getByRole('button', { name: 'Download 5.2 GB' }));
  await screen.findByRole('heading', { name: 'Downloading Qwen3 8B' });
  await screen.findByRole('progressbar', { name: 'Download progress' });
  // Keep writing: the window goes, the download doesn't.
  await user.click(screen.getByRole('button', { name: 'Keep writing' }));
  await screen.findByRole('button', { name: /Models: Downloading Qwen3 8B · \d+%/ });
  finish();
  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
});

test('a download that stops can be tried again, and carries on', async () => {
  const machine: FakeMachine = { running: true, installed: [], pullFails: 'connection reset by peer' };
  const { user } = await launch(machine, 16 * GB);
  await screen.findByRole('heading', { name: 'Choose your writing model' }, slow);
  await user.click(screen.getByRole('button', { name: 'Download 5.2 GB' }));
  await screen.findByRole('heading', { name: 'The download stopped' }, slow);
  assert.ok(screen.getByText('connection reset by peer'));
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
});

test('“Not now” lets the writer write without AI, and setup waits in the sidebar', async () => {
  const machine: FakeMachine = { running: false, installed: [] };
  const { backend, user } = await launch(machine);
  await screen.findByRole('heading', { name: 'Set up Clearpen’s AI' });
  await user.click(screen.getByRole('button', { name: 'Not now' }));
  assert.equal(await backend.library.settings.get('setupSkipped'), true);
  // The goal step follows; skipped too, a blank page opens.
  await screen.findByRole('heading', { name: 'What will you write?' });
  await user.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));

  // The sidebar offers it again.
  await user.click(await screen.findByRole('button', { name: 'Models: Set up the AI' }));
  await screen.findByRole('heading', { name: 'Set up Clearpen’s AI' });

  // At the next launch, no window.
  cleanup();
  render(<App backend={backend} />);
  await screen.findByRole('button', { name: 'Models: Set up the AI' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(screen.queryByRole('dialog'), null);
});

test('with a model ready there is no setup, and Models can download another', async () => {
  const machine: FakeMachine = { running: true, installed: ['qwen3:8b'] };
  const { backend, user } = await launch(machine, 16 * GB);
  // No setup: the goal step comes straight away, and is skipped here.
  await user.click(await screen.findByRole('button', { name: 'Not now' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(screen.queryByRole('heading', { name: 'Set up Clearpen’s AI' }), null);
  const status = await screen.findByRole('button', { name: 'Models: qwen3:8b' });
  await user.click(status);
  await user.click(await screen.findByRole('button', { name: 'Download a model…' }));
  await screen.findByRole('heading', { name: 'Choose your writing model' });
  assert.ok(screen.getByText('Installed'));
  await user.click(screen.getByRole('radio', { name: /Qwen3 4B/ }));
  await user.click(screen.getByRole('button', { name: 'Download 2.5 GB' }));
  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
  assert.deepEqual(await backend.library.settings.get('models'), { quick: 'qwen3:4b-instruct' });
});
