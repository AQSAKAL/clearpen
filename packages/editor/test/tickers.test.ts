// Tickers: TradingView's tag after each symbol while prices are on, never in
// code or an address, and the text itself untouched.

import { describe, expect, test } from 'vitest';
import type { ClearpenEditor } from '../src/index.ts';
import { all, mount } from './helpers.ts';

const tags = (ed: ClearpenEditor) => all(ed, 'tv-ticker-tag').map((el) => el.getAttribute('symbol'));

describe('tickers', () => {
  test('each ticker in the prose gets a tag after it, with the symbol a market feed knows', () => {
    const ed = mount('Buy $AAPL, not `$MSFT`; see (NASDAQ: NVDA) and NYSE:BRK.B at https://x.com/NYSE:X.', {
      tickers: true,
    });
    expect(tags(ed)).toEqual(['AAPL', 'NASDAQ:NVDA', 'NYSE:BRK.B']);
    const tag = all(ed, 'tv-ticker-tag')[0]!;
    expect(tag.className).toBe('cm-ticker');
    expect(tag.getAttribute('size')).toBe('small');
    expect(tag.textContent).toBe('');
    // The Markdown stays as written; the tag is a widget after it.
    expect(ed.getText()).toContain('Buy $AAPL, not');
  });

  test('the tags follow edits, go when prices are turned off, and come back as the option says', () => {
    const ed = mount('$AAPL', { tickers: true });
    expect(tags(ed)).toEqual(['AAPL']);
    ed.replace(1, 5, 'MSFT');
    expect(tags(ed)).toEqual(['MSFT']);
    ed.setTickers(false);
    expect(tags(ed)).toEqual([]);
    ed.setTickers(true);
    expect(tags(ed)).toEqual(['MSFT']);
    ed.setText('$NVDA');
    expect(tags(ed)).toEqual(['NVDA']);
  });

  test('off unless asked for', () => {
    const ed = mount('$AAPL');
    expect(tags(ed)).toEqual([]);
    ed.setTickers(true);
    expect(tags(ed)).toEqual(['AAPL']);
    ed.setText('$AAPL again');
    expect(tags(ed)).toEqual([]);
  });
});
