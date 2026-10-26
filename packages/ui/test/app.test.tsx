import assert from 'node:assert/strict';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { SAVE_DELAY_MS } from '../src/library.tsx';
import { WELCOME_TITLE } from '../src/welcome.ts';
import { testBackend } from './memory-backend.ts';

async function launch() {
  const backend = await testBackend();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.notEqual(title.value, undefined));
  return { backend, user, title };
}

const sidebar = () => within(document.querySelector('[data-sidebar="sidebar"]') as HTMLElement);
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

test('first launch opens the welcome article, once', async () => {
  const { backend, title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  await waitFor(() => assert.ok(sidebar().getByText(WELCOME_TITLE)));
  assert.equal(await backend.library.settings.get('welcomed'), true);
  assert.equal((await backend.library.documents.list()).length, 1);
});

test('the title saves after a pause, and the library list follows', async () => {
  const { backend, user, title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  await user.click(sidebar().getByRole('button', { name: /new article/i }));
  await waitFor(() => assert.equal(title.value, ''));
  await user.type(title, 'Why we moved support to a shared inbox');
  assert.ok(screen.getByText(/Editing|Saving/));
  await wait(SAVE_DELAY_MS + 200);
  await waitFor(() => assert.ok(sidebar().getByText('Why we moved support to a shared inbox')));
  const docs = await backend.library.documents.list();
  assert.equal(docs[0]?.title, 'Why we moved support to a shared inbox');
  assert.ok(screen.getByText('Saved'));
});

test('a new project gets a first article inside it', async () => {
  const { backend, user } = await launch();
  await user.click(await screen.findByRole('button', { name: 'New project' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByRole('textbox'), 'My blog');
  await user.click(within(dialog).getByRole('button', { name: 'Create' }));
  await waitFor(() => assert.ok(sidebar().getByText('My blog')));
  const [project] = await backend.library.projects.list();
  assert.equal(project?.name, 'My blog');
  await waitFor(async () => {
    const docs = await backend.library.documents.list();
    assert.ok(docs.some((d) => d.projectId === project?.id));
  });
});

test('trash and restore', async () => {
  const { backend, user, title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Move to trash' }));
  // The library is empty now, so a blank article opens in its place.
  await waitFor(() => assert.equal(title.value, ''));
  assert.equal((await backend.library.documents.trashed())[0]?.title, WELCOME_TITLE);

  await user.click(sidebar().getByRole('button', { name: 'Trash' }));
  const dialog = await screen.findByRole('dialog');
  await user.click(await within(dialog).findByRole('button', { name: 'Restore' }));
  await waitFor(async () => assert.equal((await backend.library.documents.trashed()).length, 0));
  await waitFor(() => assert.ok(sidebar().getByText(WELCOME_TITLE)));
});

test('⌘S saves a version, and the menu exports Markdown', async () => {
  const { backend, user, title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  fireEvent.keyDown(window, { key: 's', metaKey: true });
  await waitFor(async () => {
    const id = (await backend.library.documents.list())[0]!.id;
    assert.equal((await backend.library.versions.list(id))[0]?.label, 'Saved by you');
  });

  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitem', { name: 'Save as Markdown…' }));
  await waitFor(() => assert.equal(backend.saved.length, 1));
  assert.equal(backend.saved[0]?.name, 'welcome-to-margin.md');
  assert.match(backend.saved[0]!.contents, /^# Welcome to Margin\n\nMargin is a quiet place/);
});

test('the theme menu switches to dark and back to the system', async () => {
  const { backend, user, title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Dark' }));
  await waitFor(() => assert.ok(document.documentElement.classList.contains('dark')));
  assert.equal(await backend.library.settings.get('theme'), 'dark');

  await user.click(screen.getByRole('button', { name: 'More' }));
  await user.click(await screen.findByRole('menuitemradio', { name: 'Same as the system' }));
  await waitFor(() => assert.equal(document.documentElement.classList.contains('dark'), false));
});

test('focus mode dims every paragraph but the one being written', async () => {
  const { title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  fireEvent.keyDown(window, { key: '.', metaKey: true });
  await waitFor(() => assert.ok(document.querySelectorAll('.cm-dim').length > 0));
  fireEvent.keyDown(window, { key: '.', metaKey: true });
  await waitFor(() => assert.equal(document.querySelectorAll('.cm-dim').length, 0));
});

test('search finds articles by their text', async () => {
  const { backend, user, title } = await launch();
  await waitFor(() => assert.equal(title.value, WELCOME_TITLE));
  await backend.library.documents.create({ title: 'Pricing notes', content: 'Tickets cost $25 each.' });
  await user.click(sidebar().getByRole('button', { name: /new article/i }));
  await user.type(sidebar().getByLabelText('Search articles'), 'tickets');
  // The list narrows a moment after typing stops. (Never hand a DOM node to
  // assert.equal: printing it on failure exhausts memory.)
  await waitFor(() => assert.ok(!sidebar().queryByText(WELCOME_TITLE)));
  assert.ok(sidebar().queryByText('Pricing notes'));
  await user.clear(sidebar().getByLabelText('Search articles'));
  await user.type(sidebar().getByLabelText('Search articles'), 'nothing like this');
  await waitFor(() => assert.ok(screen.getByText('Nothing matches.')));
});
