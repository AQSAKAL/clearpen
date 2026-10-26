// Autocorrect's fixes in the text: each one its own undo step, underlined for
// a moment so the writer sees what changed. Undo a fix and those words are
// the writer's: Clearpen doesn't correct them again.

import { Annotation, type ChangeDesc, type EditorState, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';

/** Marks the transaction that makes autocorrect's fixes. */
export const correction = Annotation.define<boolean>();

/** How long a fix stays underlined. */
export const FIX_SHOWN_MS = 4000;

interface Span {
  from: number;
  to: number;
}

interface Made extends Span {
  /** What the writer had typed. */
  original: string;
  at: number;
  shown: boolean;
}

interface Fixes {
  made: Made[];
  /** Words the writer put back by undoing a fix. */
  kept: Span[];
}

export const addFixes = StateEffect.define<Made[]>();
/** Stops underlining the fixes made at or before this time. */
export const fadeFixes = StateEffect.define<number>();

const mapSpans = <T extends Span>(list: T[], changes: ChangeDesc): T[] =>
  list
    .map((s) => ({ ...s, from: changes.mapPos(s.from, 1), to: changes.mapPos(s.to, -1) }))
    .filter((s) => s.to > s.from);

export const fixesField = StateField.define<Fixes>({
  create: () => ({ made: [], kept: [] }),
  update(value, tr) {
    let { made, kept } = value;
    if (tr.docChanged) {
      kept = mapSpans(kept, tr.changes);
      if (tr.isUserEvent('undo')) {
        // An undone fix: the writer meant what they typed.
        const still: Made[] = [];
        for (const m of made) {
          const from = tr.changes.mapPos(m.from, -1);
          if (tr.newDoc.sliceString(from, from + m.original.length) === m.original) {
            kept = [...kept, { from, to: from + m.original.length }];
          } else still.push(m);
        }
        made = still;
      }
      made = mapSpans(made, tr.changes);
    }
    for (const e of tr.effects) {
      if (e.is(addFixes)) made = [...made, ...e.value].slice(-30);
      if (e.is(fadeFixes)) made = made.map((m) => (m.shown && m.at <= e.value ? { ...m, shown: false } : m));
    }
    return made === value.made && kept === value.kept ? value : { made, kept: kept.slice(-100) };
  },
  provide: (f) =>
    EditorView.decorations.from(f, (v) =>
      Decoration.set(
        v.made
          .filter((m) => m.shown)
          .map((m) =>
            Decoration.mark({ class: 'cm-fixed', attributes: { title: `Corrected from “${m.original}”` } }).range(
              m.from,
              m.to,
            ),
          ),
        true,
      ),
    ),
});

/** Has the writer kept their own words somewhere in from–to? */
export const isKept = (state: EditorState, from: number, to: number): boolean =>
  state.field(fixesField).kept.some((k) => (from === to ? k.from <= from && from <= k.to : from < k.to && k.from < to));
