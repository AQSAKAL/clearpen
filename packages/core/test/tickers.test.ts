// Tickers: the forms a note writes them in, the things that look like one but
// aren't, and the tag the Markdown renderer puts after each when asked.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { toDocument, toHTML } from '../src/markdown.ts';
import { findTickers } from '../src/tickers.ts';

const symbols = (text: string) => findTickers(text).map((t) => t.symbol);

test('a cashtag, an exchange and symbol as one word, and the print form with a space', () => {
  const text =
    'Buy $AAPL and $BRK.B; Apple (NASDAQ: AAPL) trades near NYSE:BRK.B, HKEX:0700, B3:PETR4 and FX_IDC:EURUSD.';
  assert.deepEqual(symbols(text), [
    'AAPL',
    'BRK.B',
    'NASDAQ:AAPL',
    'NYSE:BRK.B',
    'HKEX:0700',
    'B3:PETR4',
    'FX_IDC:EURUSD',
  ]);
  const [cash, , spaced] = findTickers(text);
  assert.equal(text.slice(cash!.from, cash!.to), '$AAPL');
  assert.equal(text.slice(spaced!.from, spaced!.to), 'NASDAQ: AAPL');
  // At the end of a sentence, and in emphasis.
  assert.deepEqual(symbols('We like $NVDA. Also **NASDAQ:MSFT**.'), ['NVDA', 'NASDAQ:MSFT']);
});

test('figures, units, currencies and prose with a colon are not tickers', () => {
  for (const text of [
    '$45.00 and $2.0 billion',
    'Revenue ($M), EBITDA ($MM), $5K',
    '$USD and US$45',
    '$aapl and buy$AAPL',
    'NOTE: THIS matters; ICE: EU carbon; FX: USD/JPY',
    'ROE:15% and Q1:2025 at 10:30',
    'https://example.com/A:B',
    '$AAPLXYZ',
  ])
    assert.deepEqual(symbols(text), [], text);
});

test('Markdown follows a ticker with TradingView’s tag only when asked, and never in code, a link or an export', () => {
  const md = 'Buy $AAPL (NASDAQ: AAPL), not `$MSFT` or [NYSE:X](https://x.com/NYSE:X).';
  const html = toHTML(md, { tickers: true });
  assert.match(html, /\$AAPL<tv-ticker-tag symbol="AAPL" size="small"><\/tv-ticker-tag>/);
  assert.match(html, /\(NASDAQ: AAPL<tv-ticker-tag symbol="NASDAQ:AAPL" size="small"><\/tv-ticker-tag>\)/);
  assert.match(html, /<code>\$MSFT<\/code>/);
  assert.match(html, /<a href="https:\/\/x.com\/NYSE:X">NYSE:X<\/a>/);
  assert.equal(html.match(/<tv-ticker-tag/g)?.length, 2);
  assert.doesNotMatch(toHTML(md), /tv-ticker-tag/);
  // A saved web page loads no script, so it carries no tag.
  assert.doesNotMatch(toDocument('T', md, { tickers: true }), /tv-ticker-tag/);
});
