// Sources, end to end: a page fetched and kept as Markdown, the Sources tab
// that adds, pastes and removes them, a link in the text offered as one, a
// suggestion that draws on one, and questions put to them.

import assert from 'node:assert/strict';
import { sourceWindows } from '@clearpen/core';
import type { NewDocument } from '@clearpen/db';
import { EditorView } from '@codemirror/view';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { ADD_SOURCE_HINT, lineUrl } from '../src/source-links.tsx';
import { ASK_HINT, atQuestion } from '../src/source-questions.tsx';
import { pageToMarkdown, sourceFromPage, sourceFromText } from '../src/sources.ts';
import type { Reply } from './fake-model.ts';
import { testBackend } from './memory-backend.ts';

/** How Cloudflare hides an address: its bytes XORed with the first. */
const protect = (text: string, key = 0x42) =>
  key.toString(16).padStart(2, '0') +
  [...text].map((c) => (c.charCodeAt(0) ^ key).toString(16).padStart(2, '0')).join('');

const PAGE = `<!doctype html><html><head><title>The Cloud Leaks - Example</title>
<meta property="og:title" content="The Cloud Leaks"><style>p { color: red }</style><script>track()</script></head>
<body><nav><a href="/">Home</a> · <a href="/about">About</a></nav>
<article>
  <h1>The Cloud Leaks</h1>
  <h3>The support desk as a disclosure engine</h3>
  <p>Support engineers paste customers' <strong>production credentials</strong> into tickets.</p>
  <p>APID-11887, 1,825 connection strings, one of which:</p>
  <p>mysql://app.root:<a href="/cdn-cgi/l/email-protection" class="__cf_email__" data-cfemail="${protect('S3cretPassw0rdXYZ@gateway.example.com')}">[email&#160;protected]</a>:4000/db?ssl={"rejectUnauthorized":true}</p>
  <ul><li>One <code>root</code> account</li><li>Two keys</li></ul>
  <pre>line one

line three</pre>
  <table><tr><th>Ticket</th><th>Strings</th></tr><tr><td>APID-11887</td><td>1,825</td></tr></table>
  <blockquote><p>Quoted words.</p></blockquote>
  <div>Loose text <em>with</em> emphasis<div>and a block inside</div></div>
  <button>Share</button>
</article>
<footer>© Example</footer></body></html>`;

test('a page becomes its title and main text, as Markdown', () => {
  const { title, markdown } = pageToMarkdown(PAGE);
  assert.equal(title, 'The Cloud Leaks');
  assert.equal(
    markdown,
    [
      '# The Cloud Leaks',
      '### The support desk as a disclosure engine',
      "Support engineers paste customers' production credentials into tickets.",
      'APID-11887, 1,825 connection strings, one of which:',
      // The text Cloudflare hid behind a script, back as the page shows it.
      'mysql://app.root:S3cretPassw0rdXYZ@gateway.example.com:4000/db?ssl={"rejectUnauthorized":true}',
      '- One `root` account\n- Two keys',
      '```\nline one\n\nline three\n```',
      '| Ticket | Strings |\n| --- | --- |\n| APID-11887 | 1,825 |',
      '> Quoted words.',
      'Loose text with emphasis',
      'and a block inside',
    ].join('\n\n'),
  );
  // No article: the body, without its menus.
  assert.equal(pageToMarkdown('<body><nav>Menu</nav><p>Just this.</p></body>').markdown, 'Just this.');

  const page = sourceFromPage({ url: 'https://example.com/leak', type: 'text/html; charset=utf-8', text: PAGE }, 5);
  assert.deepEqual(
    { ...page, id: '' },
    { id: '', url: 'https://example.com/leak', title: 'The Cloud Leaks', markdown, addedAt: 5 },
  );
  assert.ok(page.id);
  assert.equal(
    sourceFromPage({ url: 'https://example.com/a.md', type: 'text/markdown', text: '# Notes\n\nPlain.' }).markdown,
    '# Notes\n\nPlain.',
  );
  assert.equal(
    sourceFromPage({ url: 'https://example.com/a.md', type: 'text/plain', text: 'Plain.' }).title,
    'example.com',
  );
  assert.throws(
    () => sourceFromPage({ url: 'https://example.com/x.pdf', type: 'application/pdf', text: '%PDF' }),
    /not application\/pdf/,
  );
  assert.throws(
    () => sourceFromPage({ url: 'https://example.com/', type: 'text/html', text: '<body><nav>Menu</nav></body>' }),
    /no text/,
  );
  assert.equal(sourceFromText('  ', ' My notes. ').title, 'Pasted note');
});

async function launch(replies: Reply[] = [], doc: NewDocument = { title: 'Leaks', content: '' }) {
  const backend = await testBackend(replies, { pages: { 'https://example.com/leak': { text: PAGE } } });
  const { id } = await backend.library.documents.create(doc);
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, doc.title));
  return { backend, user, id };
}

test('the Sources tab adds a page once, keeps it with the article, and removes it', async () => {
  const { backend, user, id } = await launch();
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Sources…' }));

  await user.type(await screen.findByLabelText('Add a web page'), 'example.com/leak');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByRole('button', { name: 'The Cloud Leaks' });
  assert.deepEqual(backend.fetched, ['https://example.com/leak']);
  assert.ok(screen.getByText(/example\.com · \d+ words/));
  await waitFor(async () => {
    const saved = (await backend.library.documents.get(id))?.brief.sources ?? [];
    assert.equal(saved.length, 1);
    assert.match(saved[0]!.markdown, /^# The Cloud Leaks\n\n### The support desk/);
  });

  // The same page twice is one source; a page that isn't there says so.
  await user.type(screen.getByLabelText('Add a web page'), 'https://example.com/leak');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByText('That page is already one of this article’s sources');
  assert.equal(backend.fetched.length, 1);
  await user.clear(screen.getByLabelText('Add a web page'));
  await user.type(screen.getByLabelText('Add a web page'), 'https://example.com/missing');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByText(/Couldn’t add that page: The page answered 404 Not Found\./);

  // Text can be pasted instead.
  await user.click(screen.getByRole('button', { name: 'Paste text instead' }));
  await user.type(screen.getByLabelText('Its title'), 'My notes');
  await user.type(screen.getByPlaceholderText('The page’s text, or your notes'), 'Root keys were shared in chat.');
  await user.click(screen.getByRole('button', { name: 'Add' }));
  await screen.findByText('My notes');

  await user.click(screen.getByRole('button', { name: 'Remove The Cloud Leaks' }));
  await waitFor(async () => {
    const saved = (await backend.library.documents.get(id))?.brief.sources ?? [];
    assert.deepEqual(
      saved.map((s) => s.title),
      ['My notes'],
    );
  });
});

test('a suggestion draws on the passage of a saved page that bears on the paragraph', async () => {
  const answer = 'The `root` strings came from support tickets, pasted by engineers.';
  const source = sourceFromPage({ url: 'https://example.com/leak', type: 'text/html', text: PAGE });
  // The line and the page's table both name APID-11887: no clear winner, so the model picks, by number.
  const pick = { when: /^What the author is writing:/, reply: JSON.stringify({ passages: [1, 2, 3, 4, 5, 6, 7] }) };
  const write = { when: /Passages from the author's sources[\s\S]*Support engineers paste/, reply: answer };
  await launch([pick, write], {
    title: 'Leaks',
    content:
      'Security issues are social.\n\nAPID-11887, 1,825 connection strings, one of which:\n\n`mysql://app.root:…`\n\n',
    brief: { sources: [source] },
  });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  act(() => {
    view.focus();
    const end = view.state.doc.length;
    const text = 'What can we see here?';
    view.dispatch({
      changes: { from: end, insert: text },
      selection: { anchor: end + text.length },
      userEvent: 'input.type',
    });
  });
  await waitFor(() => assert.equal(document.querySelector('.cm-ghost')?.textContent?.trim(), answer), {
    timeout: 3000,
  });
});

/** Puts `text` at the end of the article, as a paste or as typing does. */
function put(view: EditorView, text: string, userEvent: 'input.paste' | 'input.type') {
  act(() => {
    view.focus();
    const end = view.state.doc.length;
    view.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, userEvent });
  });
}
const ghost = () => document.querySelector('.cm-ghost')?.textContent ?? '';

test('a link pasted on a line of its own is offered as a source; Tab adds it', async () => {
  assert.equal(lineUrl('  https://example.com/leak  '), 'https://example.com/leak');
  assert.equal(lineUrl('<https://example.com/leak>.'), 'https://example.com/leak');
  assert.equal(lineUrl('See https://example.com/leak'), null, 'a link in a sentence is the sentence’s');
  assert.equal(lineUrl('https://localhost'), null);

  const { backend, id } = await launch([], { title: 'Leaks', content: 'Security issues are social.\n\n' });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  put(view, 'https://example.com/leak', 'input.paste');
  await waitFor(() => assert.equal(ghost(), ADD_SOURCE_HINT));
  assert.deepEqual(backend.fetched, [], 'nothing is fetched until the writer says so');

  fireEvent.keyDown(view.contentDOM, { key: 'Tab' });
  await screen.findByText(/Added “The Cloud Leaks” — \d+ words/);
  assert.deepEqual(backend.fetched, ['https://example.com/leak']);
  // Tab also started a new paragraph after the link.
  assert.equal(view.state.doc.toString(), 'Security issues are social.\n\nhttps://example.com/leak\n\n');
  await waitFor(async () => {
    const saved = (await backend.library.documents.get(id))?.brief.sources ?? [];
    assert.deepEqual(
      saved.map((s) => s.url),
      ['https://example.com/leak'],
    );
  });

  // A page that is already a source isn't offered again, and typing on leaves an offer be.
  put(view, 'https://example.com/leak', 'input.paste');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(ghost(), '');
  put(view, '\n\nhttps://example.com/other', 'input.paste');
  await waitFor(() => assert.equal(ghost(), ADD_SOURCE_HINT));
  put(view, ' and more', 'input.type');
  await waitFor(() => assert.equal(ghost(), ''));
  assert.equal(backend.fetched.length, 1);
});

test('a typed link is offered once the writer stops typing', async () => {
  await launch([], { title: 'Leaks', content: '' });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  put(view, 'https://example.com/le', 'input.type');
  put(view, 'ak', 'input.type');
  assert.equal(ghost(), '');
  await waitFor(() => assert.equal(ghost(), ADD_SOURCE_HINT), { timeout: 3000 });
});

const leakSource = () => sourceFromPage({ url: 'https://example.com/leak', type: 'text/html', text: PAGE });
const CITED = 'The Cloud Leaks, “The support desk as a disclosure engine”';

test('an “@” line asks the sources, and the answer takes its place with where it came from', async () => {
  assert.equal(atQuestion('@ Who pasted them?'), 'Who pasted them?');
  assert.equal(atQuestion('@me'), null, 'too short to be a question');
  assert.equal(atQuestion('Mail me @ home'), null);

  const source = leakSource();
  // The model can only name what it was shown: the passage that matched, its section's opening with it.
  const apid = sourceWindows([source]).find((w) => w.text.startsWith('APID-11887'))!;
  const reply = JSON.stringify({ answer: 'Support engineers pasted them into tickets.', passages: [apid.id] });
  await launch([{ when: /The question: Who pasted the strings\?/, reply }], {
    title: 'Leaks',
    content: 'Security issues are social.\n\n',
    brief: { sources: [source] },
  });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  put(view, '@', 'input.type');
  await waitFor(() => assert.equal(ghost(), ASK_HINT));
  put(view, ' Who pasted the strings?', 'input.type');
  put(view, '\n', 'input.type');

  await screen.findByText('From your sources');
  assert.equal(
    document.querySelector('.cm-sug-ins .cm-sug-text')?.textContent,
    `Support engineers pasted them into tickets. (${CITED})`,
  );
  fireEvent.mouseDown(screen.getByRole('button', { name: 'Accept' }));
  await waitFor(() =>
    assert.equal(
      view.state.doc.toString(),
      `Security issues are social.\n\nSupport engineers pasted them into tickets. (${CITED})\n`,
    ),
  );
});

test('a question the sources can’t answer leaves the line as it was, and says so', async () => {
  const reply = JSON.stringify({ answer: 'They don’t say.', passages: [] });
  await launch([{ when: /The question:/, reply }], { title: 'Leaks', content: '', brief: { sources: [leakSource()] } });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  put(view, '@ Which tickets were rotated?', 'input.type');
  put(view, '\n', 'input.type');
  await screen.findByText(/Your sources don’t say/);
  assert.equal(document.querySelector('.cm-sug-ins'), null);
  assert.equal(view.state.doc.toString(), '@ Which tickets were rotated?\n');
});

test('Ask sources opens a question about the selection; the answer is a note beside it', async () => {
  const source = leakSource();
  // The model can only name what it was shown: the passage that matched, its section's opening with it.
  const apid = sourceWindows([source]).find((w) => w.text.startsWith('APID-11887'))!;
  const reply = JSON.stringify({ answer: 'Support engineers pasted them into tickets.', passages: [apid.id] });
  const content = 'APID-11887 held 1,825 connection strings.';
  await launch([{ when: /The question: Who pasted them\?/, reply }], {
    title: 'Leaks',
    content,
    brief: { sources: [source] },
  });
  const view = EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;
  await waitFor(() => assert.equal(view.state.doc.toString(), content));
  act(() => {
    view.focus();
    view.dispatch({ selection: { anchor: 0, head: content.length } });
  });
  const bar = await screen.findByRole('toolbar', { name: 'Edit the selection' });
  fireEvent.click(within(bar).getByRole('button', { name: 'Ask sources' }));
  // The field becomes a question to the sources; Enter asks it.
  const field = await within(bar).findByRole('textbox', { name: 'Ask your sources about the selection' });
  fireEvent.change(field, { target: { value: 'Who pasted them?' } });
  fireEvent.submit(field.closest('form')!);
  await screen.findByText('Support engineers pasted them into tickets.');
  assert.ok(screen.getByText(/From the pages you saved as sources/));
  assert.ok(screen.getAllByText(new RegExp(CITED.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).length);
});
