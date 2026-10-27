// Review, checks and Insights, end to end on a scripted model: Clearpen's own
// findings first, the model's notes after, all in the margin.

import assert from 'node:assert/strict';
import { EditorView } from '@codemirror/view';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import type { Reply } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

const DRAFT = `# Why we moved support to a shared inbox

Our pilot cut support tickets from 400 to 300 a month. Each ticket costs $25 to handle, so the team saves real money every single month and now has time to answer customers properly.

| Cost     | Before  | After  |
|----------|---------|--------|
| Staff    | $9,000  | $7,000 |
| Software | $1,000  | $1,500 |
| Total    | $10,000 | $9,500 |

SQLite was first released in 1990.
`;

const REVIEW: Reply = {
  when: /<draft>/,
  reply: JSON.stringify({
    summary: 'A clear case, with one total to fix.',
    notes: [
      {
        quote: 'saves real money every single month',
        category: 'concision',
        issue: 'Padding: “every single” adds nothing.',
        suggestion: 'saves real money every month',
      },
    ],
  }),
};

const CHECK: Reply = {
  when: /\[\[PASSAGE\]\]/,
  reply: JSON.stringify({
    items: [
      {
        quote: 'SQLite was first released in 1990.',
        explanation: 'SQLite was first released in 2000.',
        verdict: 'incorrect',
        fix: 'SQLite was first released in 2000.',
      },
    ],
    overall: 'incorrect',
    summary: 'The release year is wrong.',
  }),
};

const VERIFY: Reply = { when: /Statement:/, reply: JSON.stringify({ reasoning: 'Yes, 2000.', answer: 'true' }) };

async function launch(replies: Reply[]) {
  const backend = await testBackend(replies);
  await backend.library.documents.create({ title: 'Inbox', content: DRAFT });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Inbox'));
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  await waitFor(() => assert.equal(view.state.doc.toString(), DRAFT));
  return { backend, user, view };
}

const margin = () => within(screen.getByRole('complementary', { name: 'Notes' }));

test('Review pins Clearpen’s own findings first, then the editor’s notes', async () => {
  const { user, view } = await launch([REVIEW]);
  await user.click(screen.getByRole('button', { name: /Review/ }));

  // The table total is worked out by code, and says so.
  await waitFor(() => assert.ok(margin().getByText(/add up to \$8,500/)));
  assert.ok(margin().getAllByText('Calculated by Clearpen, not the AI.').length >= 1);
  // The model's note follows, and the summary counts them all.
  await waitFor(() => assert.ok(margin().getByText(/Padding/)));
  assert.ok(margin().getByText(/A clear case/));
  assert.ok(document.querySelectorAll('.cm-note').length >= 2, 'the passages are underlined');

  // Applying the fix replaces exactly the passage the note read.
  const card = margin()
    .getByText(/add up to \$8,500/)
    .closest('[data-note-id]') as HTMLElement;
  await user.click(card);
  await user.click(within(card).getByRole('button', { name: 'Apply' }));
  await waitFor(() => assert.match(view.state.doc.toString(), /\| Total {4}\| \$10,000 \| \$8,500 \|/));
});

test('Fact-check on a selection gives a verdict, double-checked, without touching the text', async () => {
  const { user, view } = await launch([CHECK, VERIFY]);
  const claim = 'SQLite was first released in 1990.';
  const from = view.state.doc.toString().indexOf(claim);
  act(() => {
    view.focus();
    view.dispatch({ selection: { anchor: from, head: from + claim.length } });
  });
  const bar = await screen.findByRole('toolbar', { name: 'Edit the selection' });
  await user.click(within(bar).getByRole('button', { name: /Check/ }));
  await user.click(await screen.findByRole('menuitem', { name: /Fact-check/ }));

  await waitFor(() => assert.ok(margin().getByText('incorrect')));
  assert.ok(margin().getByText(/confirmed when asked again/));
  assert.ok(margin().getByText('Fact-check · 1'), 'the summary counts the verdicts');
  assert.equal(view.state.doc.toString(), DRAFT);
});

test('Insights counts the draft and highlights what you ask for', async () => {
  const { user } = await launch([]);
  await user.click(screen.getByRole('button', { name: /words/ }));
  const panel = await screen.findByRole('tabpanel');
  assert.ok(within(panel).getByText('words / sentence'));
  assert.equal(document.querySelectorAll('.editor .cm-an').length, 0);
  await user.click(within(panel).getByRole('switch', { name: 'Highlight in your text' }));
  await waitFor(() => assert.ok(document.querySelectorAll('.editor .cm-an').length > 0));
  // What kind of piece this is, and the skeleton: each sentence by its opener and verb.
  assert.ok(within(panel).getByText('An article'));
  assert.equal(panel.querySelectorAll('ol li').length, 0);
  await user.click(within(panel).getByRole('switch', { name: 'Skeleton' }));
  await waitFor(() => assert.ok(panel.querySelectorAll('ol li button').length > 0));
});
