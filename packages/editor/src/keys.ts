// The AI keys, ahead of every other binding: Tab, ⌘→, Esc, ⌘↵, ⌘J, ⌘B and ⌘I.

import { indentLess, indentMore } from '@codemirror/commands';
import { type Extension, Prec } from '@codemirror/state';
import { type EditorView, keymap } from '@codemirror/view';
import { acceptGhost, ghostField, setGhost } from './ghost.ts';

/** What the keys act on, supplied by the editor that owns them. */
export interface KeyActions {
  /** True for 1.5 s after an Esc that nothing else took. */
  escapedJustNow: () => boolean;
  /** The latest ready suggestion, with the rest of its group. */
  latestGroup: (view: EditorView) => string[];
  acceptSuggestions: (ids: string[]) => void;
  rejectSuggestions: (ids: string[]) => void;
  /** ⌘J; true when handled. */
  requestCompletion: () => boolean;
}

export const inListItem = (view: EditorView): boolean =>
  /^\s*(?:[-*+]|\d+[.)])\s/.test(view.state.doc.lineAt(view.state.selection.main.head).text);

/** Wraps the selection in `mark` (** or *), or unwraps it if it's wrapped already. False with nothing selected. */
export function wrapSelection(view: EditorView, mark: string): boolean {
  const { from, to } = view.state.selection.main;
  if (from === to) return false;
  const text = view.state.sliceDoc(from, to);
  const wrapped = text.startsWith(mark) && text.endsWith(mark) && text.length > 2 * mark.length;
  const insert = wrapped ? text.slice(mark.length, -mark.length) : `${mark}${text}${mark}`;
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from, head: from + insert.length },
    userEvent: 'input.format',
  });
  return true;
}

export function aiKeys(actions: KeyActions): Extension {
  return Prec.highest(
    keymap.of([
      // Tab never throws the writer out of the editor: it takes the suggestion,
      // indents a list item, or does nothing. Esc then Tab still moves focus on,
      // for anyone navigating by keyboard.
      {
        key: 'Tab',
        run: (v) => acceptGhost(v) || (inListItem(v) ? indentMore(v) : !actions.escapedJustNow()),
        shift: (v) => (inListItem(v) ? indentLess(v) : !actions.escapedJustNow()),
      },
      { key: 'Mod-ArrowRight', run: (v) => acceptGhost(v, { wordOnly: true }) },
      // ⌘↵ and Esc act on the latest suggestion — and on all of its group, when
      // one instruction produced several pinpoint changes.
      {
        key: 'Escape',
        run: (v) => {
          if (v.state.field(ghostField)) {
            v.dispatch({ effects: setGhost.of(null) });
            return true;
          }
          const ids = actions.latestGroup(v);
          if (ids.length) {
            actions.rejectSuggestions(ids);
            return true;
          }
          return false;
        },
      },
      {
        key: 'Mod-Enter',
        run: (v) => {
          const ids = actions.latestGroup(v);
          if (!ids.length) return false;
          actions.acceptSuggestions(ids);
          return true;
        },
      },
      { key: 'Mod-j', run: () => actions.requestCompletion() },
      { key: 'Mod-b', run: (v) => wrapSelection(v, '**') },
      { key: 'Mod-i', run: (v) => wrapSelection(v, '*') },
    ]),
  );
}
