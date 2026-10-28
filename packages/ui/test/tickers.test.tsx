// Live prices: in an investment note, TradingView's tag after each ticker in
// the editor and the reader, its script loaded once, and the ⋯ menu to turn
// it off. Any other kind of piece never asks TradingView for anything.

import assert from 'node:assert/strict';
import { briefForMode } from '@clearpen/core';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, test } from 'vitest';
import { App } from '../src/app.tsx';
import { TICKER_LINK, TICKER_TAG_SCRIPT } from '../src/tickers.ts';
import { testBackend } from './memory-backend.ts';

const script = () => document.head.querySelector(`script[src="${TICKER_TAG_SCRIPT}"]`);
const tags = (within: string) =>
  [...document.querySelectorAll(`${within} tv-ticker-tag`)].map((el) => el.getAttribute('symbol'));
const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));
const widgetSettings = () =>
  (window as Window & { TradingViewCustomWidgetSettings?: Record<string, string> }).TradingViewCustomWidgetSettings;

// The script tag lives in <head>, and the widgets' settings on window: the React cleanup leaves both alone.
afterEach(() => {
  script()?.remove();
  delete (window as Window & { TradingViewCustomWidgetSettings?: unknown }).TradingViewCustomWidgetSettings;
});

async function launch(brief?: ReturnType<typeof briefForMode>) {
  const backend = await testBackend();
  await backend.library.documents.create({
    title: 'Note',
    content: 'Buy $AAPL, and (NASDAQ: NVDA) too.',
    ...(brief ? { brief } : {}),
  });
  const user = userEvent.setup();
  render(<App backend={backend} />);
  const title = (await screen.findByLabelText('Title')) as HTMLTextAreaElement;
  await waitFor(() => assert.equal(title.value, 'Note'));
  return { backend, user };
}

test('an investment note prices its tickers in the editor and the reader, and the ⋯ menu turns that off', async () => {
  const { backend, user } = await launch(briefForMode('investment'));
  await waitFor(() => assert.deepEqual(tags('.cm-editor'), ['AAPL', 'NASDAQ:NVDA']));
  assert.ok(script(), 'the element’s script is loaded');
  assert.equal(document.head.querySelectorAll('script[src]').length, 1, 'once');
  // "Launch full view" goes to the symbol's page, which takes a bare ticker too.
  assert.equal(widgetSettings()?.['symbol-url'], TICKER_LINK);
  assert.match(TICKER_LINK, /^https:\/\/www\.tradingview\.com\/.*\{tvprosymbol\}/);

  await user.click(screen.getByRole('button', { name: /Read/ }));
  await waitFor(() => assert.deepEqual(tags('article'), ['AAPL', 'NASDAQ:NVDA']));
  await user.click(screen.getByRole('button', { name: /Edit/ }));

  await user.click(screen.getByRole('button', { name: 'More' }));
  const item = await screen.findByRole('menuitemcheckbox', { name: /Live prices beside tickers/ });
  assert.equal(item.getAttribute('aria-checked'), 'true');
  await user.click(item);
  await waitFor(() => assert.deepEqual(tags('.cm-editor'), []));
  await waitFor(async () => assert.equal(await backend.library.settings.get('prices'), false));
});

test('an article never asks TradingView for anything, and the menu says where prices live', async () => {
  const { user } = await launch();
  await wait(50);
  assert.deepEqual(tags('.cm-editor'), []);
  assert.equal(script(), null);
  assert.equal(widgetSettings(), undefined);
  await user.click(screen.getByRole('button', { name: 'More' }));
  const item = await screen.findByRole('menuitemcheckbox', { name: /Live prices beside tickers/ });
  assert.equal(item.getAttribute('aria-disabled'), 'true');
  assert.match(item.textContent ?? '', /investment notes only/);
});
