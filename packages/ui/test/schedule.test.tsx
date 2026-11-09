import assert from 'node:assert/strict';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { testBackend } from './memory-backend.ts';

const sidebar = () => within(document.querySelector('[data-sidebar="sidebar"]') as HTMLElement);

async function launch() {
  const backend = await testBackend();
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await user.click(await screen.findByRole('button', { name: 'Open the example' }));
  await screen.findByLabelText('Title');
  return { backend, user };
}

async function newProject(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: 'New project' }));
  const dialog = await screen.findByRole('dialog');
  await user.type(within(dialog).getByRole('textbox'), name);
  await user.click(within(dialog).getByRole('button', { name: 'Create' }));
  await waitFor(() => assert.ok(sidebar().getByText(name)));
}

test('a project can be put on a schedule, which pre-creates an article and can be deleted', async () => {
  const { backend, user } = await launch();
  await newProject(user, 'My blog');

  const [project] = await backend.library.projects.list();
  assert.ok(project);
  const before = (await backend.library.documents.list()).length;

  // Project ⋯ → Schedule…
  await user.click(sidebar().getByTitle('Project options'));
  await user.click(await screen.findByRole('menuitem', { name: 'Schedule…' }));
  const dialog = await screen.findByRole('dialog');
  assert.ok(within(dialog).getByText('Schedule writing'));
  await user.click(within(dialog).getByRole('button', { name: 'Set schedule' }));

  // The rhythm is saved and its first article is already in the project.
  await waitFor(async () => assert.equal((await backend.library.schedules.list()).length, 1));
  const [schedule] = await backend.library.schedules.list();
  assert.equal(schedule?.projectId, project.id);
  assert.equal(schedule?.cadence, 'weekly');
  await waitFor(async () => {
    const docs = await backend.library.documents.list();
    assert.equal(docs.length, before + 1);
    assert.ok(docs.some((d) => d.projectId === project.id && d.title.startsWith('Week of ')));
  });
  // The project shows that it is scheduled.
  assert.ok(sidebar().getByLabelText('Scheduled writing'));

  // The ⋯ menu offers to delete the schedule, and the dialog does too.
  await user.click(sidebar().getByTitle('Project options'));
  await user.click(await screen.findByRole('menuitem', { name: 'Schedule…' }));
  const again = await screen.findByRole('dialog');
  await user.click(within(again).getByRole('button', { name: 'Delete schedule' }));
  const confirm = await screen.findByRole('alertdialog');
  await user.click(within(confirm).getByRole('button', { name: 'Delete schedule' }));

  await waitFor(async () => assert.deepEqual(await backend.library.schedules.list(), []));
  // The articles it made stay.
  await waitFor(async () => assert.equal((await backend.library.documents.list()).length, before + 1));
  await waitFor(() => assert.equal(sidebar().queryByLabelText('Scheduled writing'), null));
});
