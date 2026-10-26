// Autocorrect, end to end: the instant capital, the model's fixes landing
// behind the cursor, ⌘Z putting back what was typed, the next-sentence
// suggestion surviving the fixes, and the setting that turns it off.

import assert from 'node:assert/strict';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import type { Reply } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

async function launch(replies: Reply[]) {
  const backend = await testBackend(replies);
  await backend.library.documents.create({ title: 'Film', content: '' });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Film'));
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

const doc = (view: EditorView) => view.state.doc.toString();
const mac = /Mac/.test(navigator.platform);
const slow = { timeout: 3000 };

/** The proofreader's answer for one sentence. */
const proofread = (sentence: string, fixed: string): Reply => ({
  when: new RegExp(`The sentence:\\n<<<\\n${sentence.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n`),
  reply: JSON.stringify({ sentence: fixed }),
});

test('“this is mi favorite film.” is fixed as it’s written, and ⌘Z puts back what was typed', async () => {
  const { view } = await launch([proofread('This is mi favorite film.', 'This is my favorite film.')]);
  type(view, 'this ');
  // The capital comes the moment the first word ends.
  await waitFor(() => assert.equal(doc(view), 'This '));
  type(view, 'is mi favorite film. ');
  // The slip, once the sentence ends — behind the cursor, which stays put.
  await waitFor(() => assert.equal(doc(view), 'This is my favorite film. '), slow);
  assert.equal(view.state.selection.main.head, doc(view).length);
  const fixes = [...document.querySelectorAll('.cm-fixed')].map((el) => el.getAttribute('title'));
  assert.deepEqual(fixes, ['Corrected from “this”', 'Corrected from “mi”'], 'underlined for a moment');

  fireEvent.keyDown(view.contentDOM, { key: 'z', metaKey: mac, ctrlKey: !mac });
  await waitFor(() => assert.equal(doc(view), 'This is mi favorite film. '));
});

test('a phrase arriving at once, as from dictation, is fixed word by word and sentence by sentence', async () => {
  const { view } = await launch([
    proofread('This is mi favorite film.', 'This is my favorite film.'),
    proofread('I dont know why.', "I don't know why."),
  ]);
  type(view, 'this is mi favorite film. i dont know why. ');
  await waitFor(() => assert.equal(doc(view), "This is my favorite film. I don't know why. "), slow);
});

test('the next-sentence suggestion and the fixes don’t get in each other’s way', async () => {
  const POINT = 'The shared inbox worked because no ticket waited for one persn.';
  const SUPPORT = 'Requests now reach whoever is free first.';
  const NEXT = 'That means a sick day no longer leaves a customer waiting.';
  const { view } = await launch([
    proofread(POINT, POINT.replace('persn', 'person')),
    { when: /The paragraph, sentence by sentence/, reply: JSON.stringify({ point: 1, support: 2, meaning: 0 }) },
    { when: /Article title:/, reply: NEXT },
  ]);
  type(view, `${POINT} `);
  type(view, SUPPORT);
  await waitFor(() => assert.equal(document.querySelector('.cm-ghost')?.textContent?.trim(), NEXT), slow);
  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  await waitFor(() => assert.equal(doc(view), `${POINT.replace('persn', 'person')} ${SUPPORT} ${NEXT}`));
});

test('⋯ → Fix typos as I write turns it off', async () => {
  const { backend, user, view } = await launch([]);
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitemcheckbox', { name: /Fix typos as I write/ }));
  await waitFor(async () => assert.equal(await backend.library.settings.get('autocorrect'), false));
  type(view, 'this ');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(doc(view), 'this ');
});
