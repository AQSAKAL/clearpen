// The next logical sentence, end to end: the real judge-then-write task on a
// scripted model, the pause that triggers it, ghost text and Tab.

import assert from 'node:assert/strict';
import type { NewDocument } from '@clearpen/db';
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

async function launch(replies: Reply[], doc: NewDocument = { title: 'Inbox', content: '' }) {
  const backend = await testBackend(replies);
  await backend.library.documents.create(doc);
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, doc.title));
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

/** ⌘J, or Ctrl+J off the Mac. */
function askNow(view: EditorView) {
  const mac = /Mac/.test(navigator.platform);
  fireEvent.keyDown(view.contentDOM, { key: 'j', metaKey: mac, ctrlKey: !mac });
}

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

test('⌘J after a lead-in suggests what its colon introduces; mid-sentence it says where it works', async () => {
  const { view } = await launch([{ when: /Article title:/, reply: SUPPORT }]);
  type(view, 'A shared inbox fixes three things:');
  askNow(view);
  await waitFor(() => assert.equal(ghost(), ` ${SUPPORT}`), slow);
  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  await waitFor(() => assert.equal(view.state.doc.toString(), `A shared inbox fixes three things: ${SUPPORT}`));

  type(view, ' Requests now reach');
  askNow(view);
  await screen.findByText(/J suggests what comes after a finished sentence or a colon/);
  assert.equal(ghost(), '');
});

test('the suggestion knows what the article is about: its brief, and how it opens', async () => {
  const opening = 'The security issues found in systems are not technical. They are social.';
  const answer = 'The `root` user travels in a URL that anyone can paste.';
  const { view } = await launch(
    [{ when: /Topic: Application security[\s\S]*How the article opens[\s\S]*They are social\./, reply: answer }],
    {
      title: 'Leaks',
      content: `${opening}\n\nOne leaked string:\n\nmysql://app.root:B2Bqr2e3W887JYkODVju@db.example.com/x\n\n`,
      brief: { topic: 'Application security' },
    },
  );
  type(view, 'What can we see here?');
  await waitFor(() => assert.equal(ghost().trim(), answer), slow);
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

test('while a suggestion is on its way, three dots at the cursor say so, and go when the writer types on', async () => {
  const { view } = await launch([{ when: /Article title:/, reply: 'hang' }]);
  type(view, 'A shared inbox fixes three things:');
  askNow(view);
  await waitFor(() => assert.ok(document.querySelector('.cm-ghost-pending')), slow);
  assert.equal(view.state.doc.toString(), 'A shared inbox fixes three things:', 'nothing is in the text');
  type(view, ' Requests');
  await waitFor(() => assert.equal(document.querySelector('.cm-ghost-pending'), null));
});
