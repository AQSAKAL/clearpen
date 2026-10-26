// Editing with AI, end to end: the real rewrite and edit tasks on a scripted
// model, through the selection toolbar, tracked suggestions and the status pill.

import assert from 'node:assert/strict';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import type { Reply } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

const PASSAGE =
  'The new inbox has basically made it a lot easier for the team to actually see which tickets are urgent.';
const SHORTER = 'The new inbox has made it easier for the team to see which tickets are urgent.';

async function launch(replies: Reply[], content = PASSAGE) {
  const backend = await testBackend(replies);
  await backend.library.documents.create({ title: 'Inbox', content });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Inbox'));
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  await waitFor(() => assert.equal(view.state.doc.toString(), content));
  return { backend, user, view };
}

/** Selects `text` in the editor the way a writer would, and waits for the toolbar. */
async function select(view: EditorView, text: string) {
  const from = view.state.doc.toString().indexOf(text);
  act(() => {
    view.focus();
    view.dispatch({ selection: { anchor: from, head: from + text.length } });
  });
  return screen.findByRole('toolbar', { name: 'Edit the selection' });
}

test('Shorten marks only the words that change, and Accept all applies them', async () => {
  const { backend, user, view } = await launch([{ when: /basically/, reply: SHORTER }]);
  const bar = await select(view, PASSAGE);
  await user.click(within(bar).getByRole('button', { name: 'Shorten' }));

  const pill = await screen.findByText(/Shortened: 3 changes/);
  // Nothing changes until the writer accepts.
  assert.equal(view.state.doc.toString(), PASSAGE);
  assert.equal(document.querySelectorAll('.cm-sug-del').length, 3);

  const id = (await backend.library.documents.list())[0]!.id;
  const versions = await backend.library.versions.list(id);
  assert.equal(versions[0]?.label, 'Before “Shorten”');

  await user.click(within(pill.parentElement!).getByRole('button', { name: 'Accept all' }));
  await waitFor(() => assert.equal(view.state.doc.toString(), SHORTER));
  assert.ok(await screen.findByText('Accepted 3 changes'));
});

test('accepting one change of a group keeps Accept all for the rest', async () => {
  const { user, view } = await launch([{ when: /basically/, reply: SHORTER }]);
  const bar = await select(view, PASSAGE);
  await user.click(within(bar).getByRole('button', { name: 'Shorten' }));
  await screen.findByText(/Shortened: 3 changes/);
  fireEvent.mouseDown(document.querySelector('.cm-sug-accept')!);
  assert.ok(await screen.findByText(/Shortened: 2 changes/));
  assert.doesNotMatch(view.state.doc.toString(), /basically/);
  await user.click(screen.getByRole('button', { name: 'Reject all' }));
  assert.ok(await screen.findByText('Kept your original'));
  assert.match(view.state.doc.toString(), /a lot easier/);
});

test('a request for new writing is declined before any model is asked', async () => {
  const { user, view } = await launch([]);
  const bar = await select(view, PASSAGE);
  await user.type(
    within(bar).getByLabelText('Ask AI to change the selection'),
    'write a new paragraph about pricing{Enter}',
  );
  assert.ok(await screen.findByText(/doesn’t write it from scratch/));
  assert.equal(view.state.doc.toString(), PASSAGE);
});

test('a free instruction arrives as pinpoint edits', async () => {
  const edits = JSON.stringify({
    edits: [{ type: 'replace', anchor: 'a lot easier', text: 'far easier' }],
    declined: '',
  });
  const { user, view } = await launch([{ when: /punchier/, reply: edits }]);
  const bar = await select(view, PASSAGE);
  await user.type(within(bar).getByLabelText('Ask AI to change the selection'), 'make it punchier{Enter}');
  assert.ok(await screen.findByText(/Edits: 1 change/));
  // CodeMirror's Mod is ⌘ on a Mac and Ctrl elsewhere, by the platform it sees.
  const mac = /Mac/.test(navigator.platform);
  fireEvent.keyDown(view.contentDOM, { key: 'Enter', metaKey: mac, ctrlKey: !mac });
  await waitFor(() => assert.match(view.state.doc.toString(), /made it far easier/));
});

test('Esc stops the AI, and the passage is left as it was', async () => {
  const { user, view } = await launch([{ when: /basically/, reply: 'hang' }]);
  const bar = await select(view, PASSAGE);
  await user.click(within(bar).getByRole('button', { name: 'Improve' }));
  assert.ok(await screen.findByText('Improving…'));
  fireEvent.keyDown(window, { key: 'Escape' });
  assert.ok(await screen.findByText('Stopped'));
  await waitFor(() => assert.equal(document.querySelectorAll('.cm-sug-ins').length, 0));
  assert.equal(view.state.doc.toString(), PASSAGE);
});

test('the models dialog lists installed models and remembers a choice', async () => {
  const { backend, user } = await launch([]);
  await user.click(await screen.findByRole('button', { name: /^Models:/ }));
  const dialog = await screen.findByRole('dialog');
  await within(dialog).findByText(/Connected to Ollama/);
  await user.click(within(dialog).getByLabelText('Writing model'));
  await user.click(await screen.findByRole('option', { name: 'gemma3:12b' }));
  await user.click(within(dialog).getByRole('button', { name: 'Save' }));
  await waitFor(async () => assert.deepEqual(await backend.library.settings.get('models'), { quick: 'gemma3:12b' }));
});
