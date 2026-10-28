// Tickers: a live price beside each symbol the writer names — $AAPL,
// NASDAQ:AAPL — as TradingView's <tv-ticker-tag>, placed after the text it
// prices. The app loads the element's script when it wants prices; until it
// does, or where it never does, the tag is an empty element and nothing shows.

import { findTickers } from '@clearpen/core';
import { syntaxTree } from '@codemirror/language';
import { Compartment, type Range } from '@codemirror/state';
import {
  Decoration,
  type DecorationSet,
  type EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view';

/** Holds the ticker plugin while prices are on, and nothing while they're off. */
export const tickerCompartment = new Compartment();

class TickerWidget extends WidgetType {
  readonly symbol: string;

  constructor(symbol: string) {
    super();
    this.symbol = symbol;
  }

  override eq(other: TickerWidget): boolean {
    return other.symbol === this.symbol;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('tv-ticker-tag');
    el.className = 'cm-ticker';
    el.setAttribute('symbol', this.symbol);
    el.setAttribute('size', 'small');
    return el;
  }
}

// Where what looks like a ticker isn't one: code, an address, HTML, an image's alt text.
const NOT_TEXT = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'URL',
  'Autolink',
  'HTMLTag',
  'HTMLBlock',
  'CommentBlock',
  'Image',
]);

function inText(view: EditorView, pos: number): boolean {
  const node = syntaxTree(view.state).resolveInner(pos, 1);
  for (let n: typeof node | null = node; n; n = n.parent) if (NOT_TEXT.has(n.name)) return false;
  return true;
}

function tickerDecorations(view: EditorView): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  for (const t of findTickers(view.state.doc.toString())) {
    if (!inText(view, t.from)) continue;
    ranges.push(Decoration.widget({ widget: new TickerWidget(t.symbol), side: 1 }).range(t.to));
  }
  return Decoration.set(ranges, true);
}

export const tickerPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = tickerDecorations(view);
    }
    update(u: ViewUpdate) {
      // The parse finishing can move a ticker into or out of code without the text changing.
      if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState))
        this.decorations = tickerDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
