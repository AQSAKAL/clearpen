import assert from 'node:assert/strict';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { test } from 'vitest';
import { App } from '../src/app.tsx';
import { testBackend } from './memory-backend.ts';

async function launch(open: (id: string) => Promise<void> = async () => {}) {
  const backend = await testBackend();
  const visible = new Set<string>();
  backend.webapps = {
    open: ({ id }) => open(id),
    present: (id, bounds) => {
      if (bounds) visible.add(id);
      else visible.delete(id);
    },
    navigate() {},
    action() {},
    close() {},
    url: async () => null,
    onNavigate: () => () => {},
  };
  const user = userEvent.setup();
  render(<App backend={backend} />);
  await user.click(await screen.findByRole('button', { name: 'Open the example' }));
  const title = (await screen.findByLabelText<HTMLTextAreaElement>('Title')).value;
  const sidebar = within(document.querySelector<HTMLElement>('[data-sidebar="sidebar"]')!);
  const shows = (...ids: string[]) => waitFor(() => assert.deepEqual([...visible], ids));
  const switchTo = async (name: string) => {
    await user.click(screen.getByRole('button', { name: /^Switch workspace:/ }));
    await user.click(await screen.findByRole('menuitem', { name }));
  };
  return { user, sidebar, title, shows, switchTo };
}

test('writing menu and dialogs take precedence over native tabs; selecting the same article returns to writing', async () => {
  const { user, sidebar, title, shows, switchTo } = await launch();
  await switchTo('Telegram');
  await shows('webapp-telegram');
  await user.click(sidebar.getByRole('button', { name: 'Start in a mode' }));
  await screen.findByRole('menu');
  await shows();
  await user.keyboard('{Escape}');
  await shows('webapp-telegram');
  await user.click(sidebar.getByRole('button', { name: 'New project' }));
  await screen.findByRole('dialog');
  await shows();
  await user.keyboard('{Escape}');
  await shows('webapp-telegram');
  await user.click(sidebar.getByText(title));
  await screen.findByRole('button', { name: 'Switch workspace: Writing' });
  await shows();
});

test('late native opens cannot cover a newer tab, an open menu, or the editor', async () => {
  const pending = new Map<string, () => void>();
  const ready = new Set<string>();
  const { user, sidebar, shows, switchTo } = await launch(async (id) => {
    if (!ready.has(id)) await new Promise<void>((resolve) => pending.set(id, resolve));
  });
  const finish = (id: string) =>
    act(async () => {
      ready.add(id);
      assert.ok(pending.has(id));
      pending.get(id)!();
    });
  await switchTo('Google');
  await switchTo('X');
  await finish('webapp-x');
  await shows('webapp-x');
  await finish('webapp-google');
  await shows('webapp-x');
  await switchTo('Wikipedia');
  await user.click(sidebar.getByRole('button', { name: 'Start in a mode' }));
  await screen.findByRole('menu');
  await finish('webapp-wikipedia');
  await shows();
  await user.keyboard('{Escape}');
  await shows('webapp-wikipedia');
  await switchTo('WhatsApp');
  await user.click(screen.getByRole('button', { name: 'Back to writing' }));
  await finish('webapp-whatsapp');
  await shows();
});

test('switching workspaces preserves the live draft and editor, with a direct route back', async () => {
  const { user, switchTo } = await launch();
  const title = screen.getByLabelText<HTMLTextAreaElement>('Title');
  await user.clear(title);
  await user.type(title, 'A draft in progress');
  const editor = document.querySelector('.cm-content');
  for (const view of ['Home', 'Files', 'Wikipedia']) {
    await switchTo(view);
    await screen.findByRole('button', { name: 'Switch workspace: ' + view });
    assert.ok(title.closest('[inert]'));
    await user.click(screen.getByRole('button', { name: 'Back to writing' }));
    assert.ok(!title.closest('[inert]'));
    assert.ok(document.querySelector('.cm-content') === editor);
    assert.equal(title.value, 'A draft in progress');
  }
});
