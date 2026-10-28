// Tickers in the text — $AAPL, NASDAQ:AAPL, or "(NASDAQ: AAPL)" as print has
// it — so an investment note can show a live price beside each company it
// names. This only finds them; what to show beside one is the app's.

export interface Ticker {
  /** The written form: from the $ or the exchange to the end of the symbol. */
  from: number;
  to: number;
  /** The symbol as a market data feed knows it: AAPL, or NASDAQ:AAPL. */
  symbol: string;
}

/**
 * Exchanges a note names in print, with a space: "(NASDAQ: AAPL)". With the
 * space only these count, so "NOTE: THIS" stays prose. Written as one word,
 * EXCHANGE:SYMBOL, any exchange code does. Codes whose spaced form is a
 * common phrase (ICE: EU carbon, SET: …, FX: USD/JPY) are left out here.
 */
const EXCHANGES = [
  'NASDAQ',
  'NYSE',
  'AMEX',
  'NYSEARCA',
  'OTC',
  'CBOE',
  'TSX',
  'TSXV',
  'CSE',
  'LSE',
  'AIM',
  'XETR',
  'FWB',
  'EURONEXT',
  'MIL',
  'BME',
  'SIX',
  'SWX',
  'VIE',
  'WSE',
  'OSL',
  'OMX',
  'STO',
  'CPH',
  'HEL',
  'MOEX',
  'TASE',
  'BIST',
  'JSE',
  'EGX',
  'ASX',
  'NZX',
  'TSE',
  'JPX',
  'HKEX',
  'SSE',
  'SZSE',
  'KRX',
  'KOSDAQ',
  'TWSE',
  'SGX',
  'IDX',
  'MYX',
  'PSE',
  'NSE',
  'BSE',
  'BVMF',
  'B3',
  'BMV',
  'TADAWUL',
  'DFM',
  'ADX',
  'CME',
  'CBOT',
  'NYMEX',
  'COMEX',
  'EUREX',
  'TVC',
  'FX_IDC',
  'OANDA',
  'CRYPTO',
  'BINANCE',
  'COINBASE',
  'KRAKEN',
  'BITSTAMP',
  'BYBIT',
  'OKX',
];
const KNOWN = new Set(EXCHANGES);

/** Written with a $ but not a company: units ($M, $bn) and currencies. */
const NOT_SYMBOLS = new Set([
  'M',
  'MM',
  'K',
  'B',
  'BN',
  'T',
  'TN',
  'US',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'CHF',
  'CNY',
  'HKD',
  'SGD',
  'INR',
]);

const SYMBOL = '[A-Z0-9]{1,12}(?:[._][A-Z0-9]{1,6})?';
// $AAPL, $BRK.B: letters, two or more, so $M and $K stay units.
const CASHTAG = /(?<![\w$])\$([A-Z]{2,6}(?:\.[A-Z]{1,2})?)(?![\w$])/g;
// NASDAQ:AAPL, FX_IDC:EURUSD, HKEX:0700, B3:PETR4 — any exchange code, written as one word.
const JOINED = new RegExp(`(?<![\\w:$])([A-Z]{2}[A-Z0-9_]{0,10}|B3):(${SYMBOL})(?![\\w:])`, 'g');
// (NASDAQ: AAPL), as print has it.
const SPACED = new RegExp(`(?<!\\w)(${EXCHANGES.join('|')}): (${SYMBOL})(?![\\w:])`, 'g');

/** Every ticker in `text`, in order, none overlapping. */
export function findTickers(text: string): Ticker[] {
  const found: Ticker[] = [];
  for (const m of text.matchAll(CASHTAG)) {
    const symbol = m[1]!;
    if (!NOT_SYMBOLS.has(symbol)) found.push({ from: m.index, to: m.index + m[0].length, symbol });
  }
  for (const re of [JOINED, SPACED]) {
    for (const m of text.matchAll(re)) {
      const exchange = m[1]!;
      const symbol = m[2]!;
      // A number after a colon (ROE:15) is a figure, unless the exchange is one that lists by number.
      if (!/[A-Z]/.test(symbol) && !KNOWN.has(exchange)) continue;
      found.push({ from: m.index, to: m.index + m[0].length, symbol: `${exchange}:${symbol}` });
    }
  }
  found.sort((a, b) => a.from - b.from || b.to - a.to);
  const out: Ticker[] = [];
  for (const t of found) if (!out.length || t.from >= out[out.length - 1]!.to) out.push(t);
  return out;
}
