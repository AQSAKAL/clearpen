// The first run: after the model is set up, "What will you write?" opens the
// example for that kind of piece, with its genre set, and new articles start
// as that kind. A library with articles never sees the step; ⋯ → Start from
// an example… opens it again.

import assert from 'node:assert/strict';
import { goalOf } from '@clearpen/core';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { exampleArticle } from '../src/examples/index.ts';
import { GOAL_TITLE } from '../src/onboarding.tsx';
import type { FakeMachine } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

const sidebar = () => within(document.querySelector('[data-sidebar="sidebar"]') as HTMLElement);
const settle = () => new Promise((r) => setTimeout(r, 80));

test('a fresh library asks what you will write, opens that example, and new articles start as that kind', async () => {
  const backend = await testBackend();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await screen.findByRole('heading', { name: GOAL_TITLE });
  assert.equal(screen.getByRole('radio', { name: /An article/ }).getAttribute('aria-checked'), 'true');
  await user.click(screen.getByRole('radio', { name: /A technical guide/ }));
  await user.click(screen.getByRole('button', { name: 'Open the example' }));

  const expected = exampleArticle(goalOf('technical')!, '⌘');
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, expected.title));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(await backend.library.settings.get('goal'), 'technical');
  assert.equal(await backend.library.settings.get('welcomed'), true);
  const [summary] = await backend.library.documents.list();
  const doc = await backend.library.documents.get(summary!.id);
  assert.equal(doc?.brief.genre, 'technical');
  assert.equal(doc?.content, expected.content);
  assert.ok(doc?.content.startsWith('> ✎'), 'the front matter is not part of the article');
  assert.ok(sidebar().getByText(expected.title));

  // A new article starts as the same kind.
  await user.click(sidebar().getByRole('button', { name: /new article/i }));
  await waitFor(() => assert.equal(title.value, ''));
  await waitFor(async () => assert.equal((await backend.library.documents.list()).length, 2));
  const blank = (await backend.library.documents.list()).find((d) => d.id !== summary!.id)!;
  assert.equal((await backend.library.documents.get(blank.id))?.brief.genre, 'technical');

  // Windows gets Ctrl for ⌘ in the tour.
  const windows = exampleArticle(goalOf('article')!, 'Ctrl+');
  assert.ok(windows.content.includes('Ctrl+⇧E') && !windows.content.includes('⌘'));
});

test('⋯ → Start from an example… opens the step again, with the goal chosen before', async () => {
  const backend = await testBackend();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await user.click(await screen.findByRole('radio', { name: /A business case/ }));
  await user.click(screen.getByRole('button', { name: 'Open the example' }));
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, exampleArticle(goalOf('business')!, '⌘').title));

  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Start from an example…' }));
  await screen.findByRole('heading', { name: GOAL_TITLE });
  assert.equal(screen.getByRole('radio', { name: /A business case/ }).getAttribute('aria-checked'), 'true');
  // Cancel changes nothing.
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal((await backend.library.documents.list()).length, 1);

  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Start from an example…' }));
  await user.click(await screen.findByRole('radio', { name: /An investment note/ }));
  await user.click(screen.getByRole('button', { name: 'Open the example' }));
  await waitFor(() => assert.equal(title.value, exampleArticle(goalOf('investment')!, '⌘').title));
  assert.equal((await backend.library.documents.list()).length, 2);
  assert.equal(await backend.library.settings.get('goal'), 'investment');
});

test('a library with articles never sees the step; “Not now” on a fresh one opens a blank page, once', async () => {
  const backend = await testBackend();
  await backend.library.documents.create({ title: 'Notes', content: 'Hello.' });
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Notes'));
  await settle();
  assert.equal(screen.queryByRole('dialog'), null);
  cleanup();

  const fresh = await testBackend();
  const user = userEvent.setup();
  render(<App backend={fresh} />);
  await screen.findByRole('heading', { name: GOAL_TITLE });
  await user.click(screen.getByRole('button', { name: 'Not now' }));
  await waitFor(() => assert.equal(screen.queryByRole('dialog'), null));
  assert.equal(await fresh.library.settings.get('welcomed'), true);
  assert.equal(await fresh.library.settings.get('goal'), undefined);
  await waitFor(async () => assert.equal((await fresh.library.documents.list()).length, 1));
  assert.equal((await fresh.library.documents.list())[0]?.title, '');

  // Next launch: the blank page, and no step.
  cleanup();
  render(<App backend={fresh} />);
  await screen.findByLabelText('Title');
  await settle();
  assert.equal(screen.queryByRole('dialog'), null);
});

test('with no model yet, the setup comes first and the goal step follows it', async () => {
  const machine: FakeMachine = { running: false, installed: [] };
  const backend = await testBackend([], { machine });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await screen.findByRole('heading', { name: 'Set up Clearpen’s AI' });
  await settle();
  assert.equal(screen.queryByRole('heading', { name: GOAL_TITLE }), null);
  await user.click(screen.getByRole('button', { name: 'Not now' }));
  await screen.findByRole('heading', { name: GOAL_TITLE });
  await user.click(screen.getByRole('radio', { name: /A reflection or journal/ }));
  await user.click(screen.getByRole('button', { name: 'Open the example' }));
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'A page for today'));
  const [doc] = await backend.library.documents.list();
  assert.equal((await backend.library.documents.get(doc!.id))?.brief.genre, 'article');
  assert.equal(await backend.library.settings.get('goal'), 'reflection');
});
