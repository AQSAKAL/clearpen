// Live prices beside tickers: TradingView's <tv-ticker-tag>, an inline pill
// with the symbol's logo and the day's change, and the price and a chart on
// hover. Its script is loaded once, and only when an article wants prices, so
// nothing is asked of TradingView until an investment note names a company.

import { useEffect } from 'react';
import { useMode } from './mode.ts';
import { useSettings } from './settings.tsx';

/**
 * The module script that defines <tv-ticker-tag>. The widget docs name
 * www.tradingview-widget.com, which refuses the file to anything but their
 * own pages; the host their docs load from serves it to everyone. The desktop
 * app's CSP (tauri.conf.json) allows it, its frames and its logos.
 */
export const TICKER_TAG_SCRIPT = 'https://widgets.tradingview-widget.com/w/en/tv-ticker-tag.js';

/**
 * Where the tag's "Launch full view" goes: the symbol's page on TradingView,
 * as the widget's own link would — except that link puts the exchange before
 * the ticker and writes "undefined" for a bare $AAPL, which is a 404. The
 * page takes the full symbol in either form and sends a bare ticker on to its
 * primary listing. {tvprosymbol} is the widget's token for the symbol as
 * written; the desktop app's opener scope allows this host.
 */
export const TICKER_LINK = 'https://www.tradingview.com/symbols/{tvprosymbol}/';

/** The widgets' global settings object, read as each element initialises. */
type WidgetSettings = { TradingViewCustomWidgetSettings?: Record<string, string> };

/** Loads the element's script once; tags already on the page come to life when it arrives. */
export function loadTickerTags(): void {
  (window as Window & WidgetSettings).TradingViewCustomWidgetSettings = { 'symbol-url': TICKER_LINK };
  if (document.head.querySelector(`script[src="${TICKER_TAG_SCRIPT}"]`)) return;
  const script = document.createElement('script');
  script.type = 'module';
  script.src = TICKER_TAG_SCRIPT;
  document.head.append(script);
}

/**
 * Whether the open article shows prices: the setting is on, and its mode
 * has tickers (an investment note). Loads the script the first time it's so.
 */
export function usePrices(): boolean {
  const { settings } = useSettings();
  const mode = useMode();
  const on = settings.prices && mode.aids.tickers;
  useEffect(() => {
    if (on) loadTickerTags();
  }, [on]);
  return on;
}
