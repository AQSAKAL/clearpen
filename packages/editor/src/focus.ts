// Focus mode: every line but the paragraph being written fades back.

import { Compartment, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';

/** Holds the focus plugin while focus mode is on, and nothing while it's off. */
export const focusCompartment = new Compartment();

function dimmed(view: EditorView): DecorationSet {
  const { doc } = view.state;
  const head = view.state.selection.main.head;
  // The current paragraph: the run of non-blank lines around the cursor.
  let first = doc.lineAt(head).number;
  let last = first;
  while (first > 1 && doc.line(first - 1).text.trim()) first--;
  while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    for (let pos = from; pos <= to; ) {
      const line = doc.lineAt(pos);
      if (line.number < first || line.number > last)
        builder.add(line.from, line.from, Decoration.line({ class: 'cm-dim' }));
      pos = line.to + 1;
    }
  }
  return builder.finish();
}

export const focusPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = dimmed(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = dimmed(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
