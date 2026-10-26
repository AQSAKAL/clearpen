// The next logical sentence, end to end: the real judge-then-write task on a
// scripted model, the pause that triggers it, ghost text and Tab.

import assert from 'node:assert/strict';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import type { Reply } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

const POINT = 'The shared inbox worked because no ticket waited for one person.';
const SUPPORT = 'Requests now reach whoever is free first.';
const NEXT = 'That means a sick day no longer leaves a customer waiting.';

/** The judge finds the point (sentence 1) and its support (2) but no meaning; then the one sentence. */
const missingMeaning: Reply[] = [
  { when: /The paragraph, sentence by sentence/, reply: JSON.stringify({ point: 1, support: 2, meaning: 0 }) },
  { when: /Article title:/, reply: NEXT },
];

async function launch(replies: Reply[]) {
  const backend = await testBackend(replies);
  await backend.library.documents.create({ title: 'Inbox', content: '' });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Inbox'));
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  return { backend, user, view };
}

/** Types at the end of the article, the way keystrokes do. */
function type(view: EditorView, text: string) {
  act(() => {
    view.focus();
    const end = view.state.doc.length;
    view.dispatch({
      changes: { from: end, insert: text },
      selection: { anchor: end + text.length },
      userEvent: 'input.type',
    });
  });
}

const ghost = () => document.querySelector('.cm-ghost')?.textContent ?? '';
const slow = { timeout: 3000 };

test('after a finished sentence and a pause, the missing sentence appears in grey; Tab keeps it', async () => {
  const { view } = await launch(missingMeaning);
  type(view, `${POINT} ${SUPPORT}`);
  await waitFor(() => assert.equal(ghost().trim(), NEXT), slow);
  // Nothing is in the text until the writer keeps it.
  assert.equal(view.state.doc.toString(), `${POINT} ${SUPPORT}`);

  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  await waitFor(() => assert.equal(view.state.doc.toString(), `${POINT} ${SUPPORT} ${NEXT}`));

  // Straight after taking one, Clearpen waits for words of the writer's own.
  type(view, ' Ok.');
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(ghost(), '');
});

test('a sentence that only repeats the paragraph is taken back once written', async () => {
  const { view } = await launch([
    missingMeaning[0]!,
    { when: /Article title:/, reply: 'Requests now reach whoever is really free first.' },
  ]);
  type(view, `${POINT} ${SUPPORT}`);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(ghost(), '');
  assert.equal(view.state.doc.toString(), `${POINT} ${SUPPORT}`);
});

test('mid-sentence there is no suggestion', async () => {
  const { view } = await launch(missingMeaning);
  type(view, `${POINT} Requests now reach`);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(ghost(), '');
});

test('a complete paragraph gets “point made”, and Tab starts a new paragraph', async () => {
  const meaning = 'That is the change we wanted.';
  const { view } = await launch([
    { when: /The paragraph, sentence by sentence/, reply: JSON.stringify({ point: 1, support: 2, meaning: 3 }) },
  ]);
  type(view, `${POINT} ${SUPPORT} ${meaning}`);
  await waitFor(() => assert.match(ghost(), /point made/), slow);
  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  await waitFor(() => assert.equal(view.state.doc.toString(), `${POINT} ${SUPPORT} ${meaning}\n\n`));
});

test('the ⋯ menu turns suggestions off', async () => {
  const { backend, user, view } = await launch(missingMeaning);
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name: /Next-sentence suggestions/ }));
  await waitFor(async () => assert.equal(await backend.library.settings.get('autocomplete'), false));
  type(view, `${POINT} ${SUPPORT}`);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal(ghost(), '');
});
