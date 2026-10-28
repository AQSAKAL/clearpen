// Writing modes and guided writing, end to end: New article in a mode, the
// mode shown and changed under "What this is", the aids it turns off, and the
// Reflect frames filled one after another on a scripted model — with nothing
// but the author's own words landing in the text.

import assert from 'node:assert/strict';
import { briefForMode, TEMPLATES } from '@clearpen/core';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { SAVE_DELAY_MS } from '../src/library.tsx';
import type { Reply } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

const sidebar = () => within(document.querySelector('[data-sidebar="sidebar"]') as HTMLElement);
const card = () => within(screen.getByRole('complementary', { name: 'Guide' }));
const frame = () => document.querySelector('.cm-ghost-frame')?.textContent ?? '';
const ghost = () => document.querySelector('.cm-ghost')?.textContent ?? '';
const slow = { timeout: 3000 };
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

async function launch(replies: Reply[] = [], brief?: ReturnType<typeof briefForMode>) {
  const backend = await testBackend(replies);
  const doc = await backend.library.documents.create({ title: 'Today', ...(brief ? { brief } : {}) });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Today'));
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  return { backend, user, view, id: doc.id };
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

test('New article ▾ makes an article in a mode, Insights shows it, and the mode turns suggestions off', async () => {
  const { backend, user } = await launch();
  await user.click(sidebar().getByRole('button', { name: 'Start in a mode' }));
  await user.click(await screen.findByRole('menuitem', { name: /Reflect/ }));
  let id = '';
  await waitFor(async () => {
    const docs = await backend.library.documents.list();
    const doc = await backend.library.documents.get(docs[0]!.id);
    assert.equal(doc?.brief.mode, 'reflect');
    assert.equal(doc?.brief.genre, 'article');
    id = doc!.id;
  });
  assert.ok(id);

  // Under "What this is", the mode and what it changes.
  await user.click(screen.getByTitle('Insights'));
  const picker = await screen.findByRole('combobox', { name: 'What this is' });
  assert.match(picker.textContent ?? '', /Reflect/);
  assert.ok(screen.getByText(/Three sentences, one at a time/));
  // The panel is a sheet in a narrow window: close it to reach the top bar.
  await user.keyboard('{Escape}');
  await waitFor(() => assert.equal(screen.queryByRole('combobox', { name: 'What this is' }), null));

  // The ⋯ menu says suggestions are off here, and leaves typo fixes on.
  await user.click(screen.getByRole('button', { name: 'More' }));
  const next = await screen.findByRole('menuitemcheckbox', { name: /Next-sentence suggestions/ });
  assert.equal(next.getAttribute('aria-disabled'), 'true');
  assert.match(next.textContent ?? '', /off in Reflect/);
  const typos = screen.getByRole('menuitemcheckbox', { name: /Fix typos as I write/ });
  assert.equal(typos.getAttribute('aria-checked'), 'true');
  await user.keyboard('{Escape}');

  // The plain button still makes a plain article.
  await user.click(sidebar().getByRole('button', { name: /^New article$/ }));
  await waitFor(async () => {
    const docs = await backend.library.documents.list();
    const doc = await backend.library.documents.get(docs[0]!.id);
    assert.notEqual(doc?.id, id);
    assert.equal(doc?.brief.mode, undefined);
  });
  await user.click(screen.getByTitle('Insights'));
  assert.match((await screen.findByRole('combobox', { name: 'What this is' })).textContent ?? '', /An article/);
});

test('Reflect: the frames appear in grey one after another, the coach asks, and only the author’s words land in the text', async () => {
  const replies: Reply[] = [
    // The judge: the paragraph states its point and nothing more.
    { when: /The paragraph, sentence by sentence/, reply: JSON.stringify({ point: 1, support: 0, meaning: 0 }) },
    {
      when: /just filled frame 1/,
      reply: JSON.stringify({
        missing: 'Tired from what, or of what?',
        next: 'What happened yesterday that left you like this?',
      }),
    },
    { when: /just filled frame 3/, reply: JSON.stringify({ missing: '', next: '' }) },
  ];
  const { backend, user, view, id } = await launch(replies, briefForMode('reflect'));
  const [first, second, third] = TEMPLATES.reflect.frames;

  // The first frame, in grey at the cursor and on the card; the text is empty.
  await waitFor(() => assert.equal(frame(), 'I feel  today.'), slow);
  assert.ok(card().getByText(/Reflect · 1 of 3/));
  assert.ok(card().getByText(first!.ask));
  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  assert.equal(view.state.doc.toString(), '');
  assert.equal(frame(), 'I feel  today.');

  // The author fills it. After a pause the next frame shows, and the coach's reply lands on the card.
  type(view, 'I feel tired today. ');
  await waitFor(() => assert.equal(frame(), 'That comes from .'), slow);
  assert.ok(card().getByText(/Reflect · 2 of 3/));
  await waitFor(() => assert.ok(card().getByText('Tired from what, or of what?')), slow);
  assert.ok(card().getByText('What happened yesterday that left you like this?'));
  assert.equal(view.state.doc.toString(), 'I feel tired today. ');
  await wait(SAVE_DELAY_MS + 200);
  assert.deepEqual((await backend.library.documents.get(id))?.brief.guide, { template: 'reflect', step: 1 });

  // Why this? explains the frame; Skip moves on without it.
  await user.click(card().getByRole('button', { name: 'Why this?' }));
  assert.ok(card().getByText(second!.why));
  await user.click(card().getByRole('button', { name: 'Skip' }));
  await waitFor(() => assert.ok(card().getByText(/Reflect · 3 of 3/)));
  await waitFor(() => assert.equal(frame(), 'What I want instead is .'), slow);
  assert.ok(card().getByText(third!.ask));

  // The last frame filled: the card says what was written, and the text is still only the author's.
  type(view, 'What I want instead is a quiet week. ');
  await waitFor(() => assert.ok(card().getByText(TEMPLATES.reflect.done)), slow);
  assert.equal(frame(), '');
  assert.equal(view.state.doc.toString(), 'I feel tired today. What I want instead is a quiet week. ');
  await user.click(card().getByRole('button', { name: 'Close' }));
  await waitFor(() => assert.equal(screen.queryByRole('complementary', { name: 'Guide' }), null));
  await wait(SAVE_DELAY_MS + 200);
  assert.equal((await backend.library.documents.get(id))?.brief.guide, undefined);
});

test('a scientific paper offers its skeleton on an empty page; Start shows the first frame, Stop takes it away', async () => {
  const { view, user } = await launch([], briefForMode('scientific'));
  assert.ok(await card().findByText(/Start with the skeleton\?/));
  assert.equal(frame(), '');
  await user.click(card().getByRole('button', { name: 'Start' }));
  await waitFor(() => assert.equal(frame(), 'This paper asks .'), slow);
  assert.ok(card().getByText(/The skeleton · 1 of 6/));
  // Its frames each want a paragraph: after a sentence, a hint to start one.
  type(view, 'This paper asks whether sleep loss changes how people judge risk. ');
  await waitFor(() => assert.match(ghost(), /Tab for a new paragraph, then: What is already known/), slow);
  await waitFor(() => assert.ok(card().getByText(/The skeleton · 2 of 6/)));
  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  await waitFor(() => assert.equal(frame(), 'What is already known: .'), slow);
  assert.equal(view.state.doc.toString(), 'This paper asks whether sleep loss changes how people judge risk.\n\n');
  await user.click(card().getByRole('button', { name: 'Stop' }));
  await waitFor(() => assert.equal(screen.queryByRole('complementary', { name: 'Guide' }), null));
  assert.equal(ghost(), '');
});
