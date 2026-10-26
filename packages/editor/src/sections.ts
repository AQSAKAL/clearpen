// "◇ Shape this section": a heading with only notes (or nothing) under it gets
// a button to shape its argument. The coach lays out the logic; the writer writes.

import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { sectionsOf } from '@margin/core';
import { addSuggestion, removeSuggestion } from './suggestions.ts';
import type { EditorOptions, Suggestion } from './types.ts';

class WriteSectionWidget extends WidgetType {
  readonly from: number;
  readonly onWrite: (from: number) => void;

  constructor(from: number, onWrite: (from: number) => void) {
    super();
    this.from = from;
    this.onWrite = onWrite;
  }

  override eq(other: WriteSectionWidget): boolean {
    return other.from === this.from;
  }

  toDOM(): HTMLElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cm-write-section';
    b.textContent = '◇ Shape this section';
    b.title =
      'Lay out the argument of this section — the point, the steps, the evidence to find. The writing is yours.';
    b.onmousedown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      this.onWrite(this.from);
    };
    return b;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/**
 * The buttons, one after each unwritten section's heading. A section with a
 * suggestion pending in it gets none: the outline may already be on its way.
 */
export function sectionField(
  opts: EditorOptions,
  suggestions: StateField<readonly Suggestion[]>,
): StateField<DecorationSet> {
  const buttons = (state: EditorState): DecorationSet => {
    const onWrite = opts.onWriteSection;
    if (!onWrite) return Decoration.none;
    const pending = state.field(suggestions, false) || [];
    const ranges: Range<Decoration>[] = [];
    for (const s of sectionsOf(state.doc.toString())) {
      if (s.written || pending.some((x) => x.from <= s.bodyTo && x.to >= s.headingFrom)) continue;
      ranges.push(
        Decoration.widget({ widget: new WriteSectionWidget(s.headingFrom, onWrite), side: 1 }).range(s.headingTo),
      );
    }
    return Decoration.set(ranges, true);
  };
  return StateField.define<DecorationSet>({
    create: buttons,
    update: (deco, tr) =>
      tr.docChanged || tr.effects.some((e) => e.is(addSuggestion) || e.is(removeSuggestion)) ? buttons(tr.state) : deco,
    provide: (f) => EditorView.decorations.from(f),
  });
}
