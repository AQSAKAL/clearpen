// Ghost text: autocomplete's suggestion in grey at the cursor, the rest of the
// sentence. Tab takes it; any edit or cursor move makes it go away — except
// autocorrect's fixes, which it moves with.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { correction } from './corrections.ts';
import type { Ghost } from './types.ts';

export const setGhost = StateEffect.define<Ghost | null>();

// `display` shows something other than what Tab inserts — "¶ point made"
// for a paragraph break.
class GhostWidget extends WidgetType {
  readonly text: string;
  readonly display: string | undefined;

  constructor(text: string, display: string | undefined) {
    super();
    this.text = text;
    this.display = display;
  }

  override eq(other: GhostWidget): boolean {
    return other.text === this.text && other.display === this.display;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.display ? 'cm-ghost cm-ghost-hint' : 'cm-ghost';
    span.textContent = this.display || this.text;
    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

export const ghostField = StateField.define<Ghost | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setGhost)) return e.value;
    if (!value) return null;
    // Autocorrect fixing words behind the cursor doesn't make the suggestion wrong.
    if (tr.docChanged) return tr.annotation(correction) ? { ...value, pos: tr.changes.mapPos(value.pos, 1) } : null;
    if (tr.selection && tr.state.selection.main.head !== value.pos) return null;
    return value;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (v) =>
      v?.text
        ? Decoration.set([Decoration.widget({ widget: new GhostWidget(v.text, v.display), side: 1 }).range(v.pos)])
        : Decoration.none,
    ),
});

/** Inserts the ghost text, or with `wordOnly` just its next word. False when there's nothing to take. */
export function acceptGhost(view: EditorView, { wordOnly = false }: { wordOnly?: boolean } = {}): boolean {
  const g = view.state.field(ghostField);
  if (!g?.text) return false;
  let text = g.text;
  if (wordOnly && g.display) return false; // a hint, not words
  if (wordOnly) {
    const m = text.match(/^\s*\S+\s?/);
    text = m ? m[0] : text;
  }
  const rest = g.text.slice(text.length);
  // A paragraph break replaces the space typed after the last sentence.
  const from = g.display && view.state.sliceDoc(g.pos - 1, g.pos) === ' ' ? g.pos - 1 : g.pos;
  view.dispatch({
    changes: { from, to: g.pos, insert: text },
    selection: { anchor: from + text.length },
    userEvent: 'input.complete',
    effects: rest ? setGhost.of({ pos: from + text.length, text: rest }) : [],
  });
  return true;
}
