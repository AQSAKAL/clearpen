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

async function launch(
  machine: FakeMachine,
  memory: number | null = null,
  pages: Record<string, { type?: string; text: string }> = {},
) {
  const backend = await testBackend([], { machine, memory, pages });
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
  // 8 GB is room for Qwen3.5 4B.
  assert.equal(screen.getByRole('radio', { name: /Qwen3\.5 4B/ }).getAttribute('aria-checked'), 'true');
  await user.click(screen.getByRole('button', { name: 'Download 4.0 GB' }));

  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
  assert.ok(machine.installed.includes('qwen3.5:4b'));
  assert.deepEqual(await backend.library.settings.get('models'), { quick: 'qwen3.5:4b' });
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
  assert.equal(screen.getByRole('radio', { name: /Qwen3\.5 4B/ }).getAttribute('aria-checked'), 'true');
  await user.click(screen.getByRole('button', { name: 'Download 4.0 GB' }));
  await screen.findByRole('heading', { name: 'Downloading Qwen3.5 4B' });
  await screen.findByRole('progressbar', { name: 'Download progress' });
  // Keep writing: the window goes, the download doesn't.
  await user.click(screen.getByRole('button', { name: 'Keep writing' }));
  await screen.findByRole('button', { name: /Models: Downloading Qwen3\.5 4B · \d+%/ });
  finish();
  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
});

test('a download that stops can be tried again, and carries on', async () => {
  const machine: FakeMachine = { running: true, installed: [], pullFails: 'connection reset by peer' };
  const { user } = await launch(machine, 16 * GB);
  await screen.findByRole('heading', { name: 'Choose your writing model' }, slow);
  await user.click(screen.getByRole('button', { name: 'Download 4.0 GB' }));
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

const CARD = (name: string, description: string, sizes: string[]) => `
  <a href="/library/${name}" class="group w-full space-y-5">
    <div title="${name}" class="flex flex-col">
      <p class="max-w-lg break-words text-neutral-800 text-md">${description}</p>
    </div>
    <div class="flex flex-col space-y-2">
      <div class="flex flex-wrap space-x-2">
        ${sizes
          .map(
            (s) =>
              `<span class="inline-flex items-center rounded-md bg-[#ddf4ff] px-2 py-0.5 text-xs font-medium text-blue-600 sm:text-[13px]">${s}</span>`,
          )
          .join('')}
      </div>
      <p class="flex space-x-5 text-[13px] font-medium">
        <span class="flex items-center"><span>12</span><span class="hidden sm:flex">&nbsp;Tags</span></span>
      </p>
    </div>
  </a>`;

const TAG = (model: string, size: string, latest = false) => `
  <div class="group px-4 py-3">
    <a href="/library/${model}" class="md:hidden flex flex-col space-y-[6px] group">
      <div class="flex items-center font-medium">
        <span class="group-hover:underline">${model}</span>
        ${latest ? '<span class="ml-2 inline-flex items-center rounded-full px-2 py-px text-xs font-medium border border-blue-500 text-blue-600">latest</span>' : ''}
      </div>
      <div class="flex flex-col text-neutral-500 text-[13px]">
        <span><span class="font-mono">500a1f067a9f</span> • ${size} • 40K context window •</span>
      </div>
    </a>
  </div>`;

test('the chooser searches all of Ollama, and downloads any model and size chosen', async () => {
  const machine: FakeMachine = { running: true, installed: [] };
  const { backend, user } = await launch(machine, 8 * GB, {
    'https://ollama.com/library': {
      text: `${CARD('acme', 'A model that is not one of the offers.', ['7b'])}${CARD('other', 'Another one.', ['3b'])}`,
    },
    'https://ollama.com/library/acme/tags': {
      text: `${TAG('acme:7b', '4.2GB', true)}${TAG('acme:14b', '8.4GB')}`,
    },
  });
  await screen.findByRole('heading', { name: 'Choose your writing model' }, slow);

  // The recommended offers are still there; searching reaches everything else.
  assert.ok(screen.getByRole('radio', { name: /Qwen3\.5 4B/ }));
  await user.type(screen.getByLabelText('Search Ollama’s library'), 'acme');
  await user.click(await screen.findByRole('radio', { name: /acme/ }));
  const version = await screen.findByRole('combobox', { name: 'Version of acme' });
  await user.click(version);
  await user.click(await screen.findByRole('option', { name: /14b/ }));
  await user.click(screen.getByRole('button', { name: 'Download 8.4 GB' }));

  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
  assert.ok(machine.installed.includes('acme:14b'));
  assert.deepEqual(await backend.library.settings.get('models'), { quick: 'acme:14b' });
});

test('a model can be typed by hand when the library can’t be reached', async () => {
  const machine: FakeMachine = { running: true, installed: [] };
  const { backend, user } = await launch(machine, 8 * GB);
  await screen.findByRole('heading', { name: 'Choose your writing model' }, slow);
  await user.click(screen.getByLabelText('Search Ollama’s library'));
  await screen.findByText(/Couldn’t reach ollama.com/, undefined, slow);
  await user.type(screen.getByLabelText('Or type any model from ollama.com/library'), 'mistral:7b');
  await user.click(screen.getByRole('button', { name: 'Download' }));
  await screen.findByRole('heading', { name: 'Clearpen is ready' }, slow);
  assert.deepEqual(await backend.library.settings.get('models'), { quick: 'mistral:7b' });
});
