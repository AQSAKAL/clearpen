// Review notes, underlined in the text in their category's colour. They
// follow their passage through edits and go when it's deleted.

import { StateEffect, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import type { EditorNote } from './types.ts';

export const setNotes = StateEffect.define<readonly EditorNote[]>();
export const removeNote = StateEffect.define<string>();
export const setActiveNote = StateEffect.define<string | null>();

interface NotesState {
  notes: readonly EditorNote[];
  active: string | null;
}

/** Drops ranges that don't fit the document (stale or miscounted positions). */
export const fits =
  (doc: Text) =>
  (r: { from: number; to: number }): boolean =>
    r.from >= 0 && r.to <= doc.length && r.from < r.to;

export const notesField = StateField.define<NotesState>({
  create: () => ({ notes: [], active: null }),
  update(value, tr) {
    let { notes, active } = value;
    if (tr.docChanged && notes.length) {
      notes = notes
        .map((n) => ({ ...n, from: tr.changes.mapPos(n.from, 1), to: tr.changes.mapPos(n.to, -1) }))
        .filter((n) => n.to > n.from);
    }
    for (const e of tr.effects) {
      if (e.is(setNotes)) notes = e.value.filter(fits(tr.state.doc));
      else if (e.is(removeNote)) notes = notes.filter((n) => n.id !== e.value);
      else if (e.is(setActiveNote)) active = e.value;
    }
    return notes === value.notes && active === value.active ? value : { notes, active };
  },
  provide: (f) =>
    EditorView.decorations.from(f, ({ notes, active }) =>
      Decoration.set(
        notes.map((n) =>
          Decoration.mark({
            class: `cm-note cm-note-${n.category}${n.id === active ? ' cm-note-active' : ''}`,
            attributes: { 'data-note': n.id },
          }).range(n.from, n.to),
        ),
        true,
      ),
    ),
});
