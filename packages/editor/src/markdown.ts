// Markdown, typeset: class names for the syntax, so the stylesheet can make
// the marks recede and the words come forward.

import { HighlightStyle, syntaxTree } from '@codemirror/language';
import { type Range, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

export const proseHighlight = HighlightStyle.define([
  { tag: t.heading1, class: 'md-h md-h1' },
  { tag: t.heading2, class: 'md-h md-h2' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], class: 'md-h md-h3' },
  { tag: t.strong, class: 'md-strong' },
  { tag: t.emphasis, class: 'md-em' },
  { tag: t.strikethrough, class: 'md-strike' },
  { tag: t.link, class: 'md-link' },
  { tag: t.url, class: 'md-url' },
  { tag: t.quote, class: 'md-quote' },
  { tag: t.monospace, class: 'md-code' },
  { tag: t.processingInstruction, class: 'md-mark' },
  { tag: t.contentSeparator, class: 'md-mark' },
]);

// Whole-line classes for headings, quotes and code, so they can get spacing.
const LINE_CLASSES: Record<string, string> = {
  ATXHeading1: 'ln-h1',
  ATXHeading2: 'ln-h2',
  ATXHeading3: 'ln-h3',
  ATXHeading4: 'ln-h3',
  Blockquote: 'ln-quote',
  FencedCode: 'ln-code',
};

function lineDecorations(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        const cls = LINE_CLASSES[node.name];
        if (!cls) return;
        let pos = node.from;
        while (pos <= node.to) {
          const line = view.state.doc.lineAt(pos);
          marks.push(Decoration.line({ class: cls }).range(line.from));
          pos = line.to + 1;
        }
      },
    });
  }
  // A line gets one class: the first node that claims it.
  marks.sort((a, b) => a.from - b.from);
  const builder = new RangeSetBuilder<Decoration>();
  let last = -1;
  for (const m of marks) {
    if (m.from !== last) {
      builder.add(m.from, m.from, m.value);
      last = m.from;
    }
  }
  return builder.finish();
}

export const lineStyles = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = lineDecorations(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.viewportChanged) this.decorations = lineDecorations(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
