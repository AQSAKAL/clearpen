// @clearpen/editor — Clearpen's writing surface: CodeMirror 6, dressed for prose,
// with the hooks the AI features need. The app only ever talks to the small
// API that createEditor() returns.

import { defaultKeymap, history, historyKeymap, isolateHistory, redo, undo } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { ensureSyntaxTree, syntaxHighlighting, syntaxTree } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension, type StateEffect, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder, type ViewUpdate } from '@codemirror/view';
import { analysisField, setAnalysis } from './analysis.ts';
import { addFixes, correction, FIX_SHOWN_MS, fadeFixes, fixesField, isKept } from './corrections.ts';
import { focusCompartment, focusPlugin } from './focus.ts';
import { acceptGhost, ghostField, setGhost } from './ghost.ts';
import { imageField } from './images.ts';
import { aiKeys } from './keys.ts';
import { lineStyles, proseHighlight } from './markdown.ts';
import { notesField, removeNote, setActiveNote, setNotes } from './notes.ts';
import { sectionField } from './sections.ts';
import {
  acceptingAnnotation,
  addSuggestion,
  removeSuggestion,
  suggestionField,
  updateSuggestion,
} from './suggestions.ts';
import type { ClearpenEditor, EditorOptions } from './types.ts';

export type {
  AnalysisRange,
  ClearpenEditor,
  EditorFix,
  EditorNote,
  EditorOptions,
  EditorUpdate,
  Ghost,
  Suggestion,
  SuggestionInput,
  SuggestionStatus,
} from './types.ts';

// Where the text isn't prose, and so isn't autocorrect's to touch.
const NOT_PROSE = new Set([
  'FencedCode',
  'CodeBlock',
  'InlineCode',
  'URL',
  'Autolink',
  'HTMLTag',
  'HTMLBlock',
  'CommentBlock',
  'ProcessingInstruction',
  'Image',
  'LinkReference',
  'Table',
]);

/** The writer typing or pressing Enter, as opposed to a paste, an AI edit or a taken suggestion. */
const typing = (tr: Transaction) => tr.isUserEvent('input.type') || tr.annotation(Transaction.userEvent) === 'input';

/** Where the text the writer typed in this update now is. */
function typedRanges(u: ViewUpdate): { from: number; to: number }[] {
  let out: { from: number; to: number }[] = [];
  for (const tr of u.transactions) {
    out = out.map((r) => ({ from: tr.changes.mapPos(r.from, 1), to: tr.changes.mapPos(r.to, -1) }));
    if (typing(tr)) tr.changes.iterChanges((_a, _b, from, to) => to > from && out.push({ from, to }));
  }
  return out.filter((r) => r.to > r.from);
}

/** Creates the writing surface inside `parent`. */
export function createEditor(parent: HTMLElement, opts: EditorOptions = {}): ClearpenEditor {
  // The widgets' buttons go through the API, which exists by the time they're clicked.
  const sugField = suggestionField({
    accept: (id) => api.acceptSuggestion(id),
    reject: (id) => api.rejectSuggestion(id),
  });
  let lastEscape = 0;
  const escapedJustNow = () => Date.now() - lastEscape < 1500;
  const latestGroup = (v: EditorView): string[] => {
    const pending = v.state.field(sugField).filter((s) => s.status !== 'streaming');
    const last = pending[pending.length - 1];
    if (!last) return [];
    return last.group ? pending.filter((s) => s.group === last.group).map((s) => s.id) : [last.id];
  };

  const extensions: Extension[] = [
    history(),
    drawSelection(),
    EditorView.lineWrapping,
    markdown({ base: markdownLanguage }),
    syntaxHighlighting(proseHighlight),
    lineStyles,
    highlightSelectionMatches({ minSelectionLength: 3 }),
    placeholder(opts.placeholder || 'Start writing…'),
    sugField,
    notesField,
    ghostField,
    fixesField,
    analysisField,
    imageField(opts),
    sectionField(opts, sugField),
    focusCompartment.of([]),
    aiKeys({
      escapedJustNow,
      latestGroup,
      acceptSuggestions: (ids) => api.acceptSuggestions(ids),
      rejectSuggestions: (ids) => api.rejectSuggestions(ids),
      requestCompletion: () => (opts.onRequestCompletion ? opts.onRequestCompletion() : false),
    }),
    keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.contentAttributes.of({
      spellcheck: 'true',
      autocorrect: 'on',
      autocapitalize: 'sentences',
      'aria-label': 'Article text',
    }),
    EditorView.updateListener.of((u) => {
      if (u.geometryChanged) opts.onGeometry?.();
      if (opts.onUpdate && (u.docChanged || u.selectionSet || u.focusChanged)) {
        opts.onUpdate({
          docChanged: u.docChanged,
          selectionSet: u.selectionSet,
          focusChanged: u.focusChanged,
          // The writer's own typing, Enter included — as opposed to taking a suggested sentence.
          userEdit: u.transactions.some(typing),
          typed: typedRanges(u),
          ghostAccepted: u.transactions.some((tr) => tr.isUserEvent('input.complete')),
          corrected: u.docChanged && u.transactions.every((tr) => !tr.docChanged || tr.annotation(correction)),
          mapPos: (pos, assoc = -1) => u.changes.mapPos(pos, assoc),
        });
      }
    }),
    EditorView.domEventHandlers({
      // Pasted or dropped image files go to the app; everything else pastes as usual.
      paste: (ev, v) => {
        const files = [...(ev.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length || !opts.onImages) return false;
        ev.preventDefault();
        const { from, to } = v.state.selection.main;
        opts.onImages(files, from, to);
        return true;
      },
      dragover: (ev) => {
        if ([...(ev.dataTransfer?.items || [])].some((i) => i.kind === 'file' && i.type.startsWith('image/'))) {
          ev.preventDefault();
          return true;
        }
        return false;
      },
      drop: (ev, v) => {
        const files = [...(ev.dataTransfer?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (!files.length || !opts.onImages) return false;
        ev.preventDefault();
        const pos = v.posAtCoords({ x: ev.clientX, y: ev.clientY }) ?? v.state.selection.main.head;
        opts.onImages(files, pos, pos);
        return true;
      },
      // Only an Esc the keymap didn't take gets here, so Tab may then move focus on.
      keydown: (ev) => {
        if (ev.key === 'Escape') lastEscape = Date.now();
        return false;
      },
      click: (ev) => {
        const el = ev.target instanceof Element ? ev.target.closest('[data-note]') : null;
        if (opts.onNoteClick) opts.onNoteClick(el ? el.getAttribute('data-note') : null);
        return false;
      },
    }),
  ];

  const view = new EditorView({ state: EditorState.create({ doc: opts.doc || '', extensions }), parent });

  let seq = 0;
  let destroyed = false;
  const api: ClearpenEditor = {
    view,
    getText: () => view.state.doc.toString(),
    setText(text) {
      view.setState(EditorState.create({ doc: text, extensions }));
    },
    focus: () => view.focus(),
    getSelection() {
      const { from, to } = view.state.selection.main;
      return { from, to, text: view.state.sliceDoc(from, to), empty: from === to };
    },
    setSelection(from, to = from, scroll = true) {
      view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: scroll });
    },
    coordsAt: (pos, side) => view.coordsAtPos(pos, side),
    topOf(pos) {
      const c = view.coordsAtPos(Math.min(pos, view.state.doc.length), 1);
      return c ? c.top - view.documentTop : view.lineBlockAt(pos).top;
    },
    documentTop: () => view.documentTop,
    slice: (from, to) => view.state.sliceDoc(from, to),
    length: () => view.state.doc.length,
    cursor: () => view.state.selection.main.head,
    lineAt(pos) {
      const l = view.state.doc.lineAt(pos);
      return { from: l.from, to: l.to, text: l.text, number: l.number };
    },
    replace(from, to, insert, { select = false } = {}) {
      view.dispatch({
        changes: { from, to, insert },
        selection: select ? { anchor: from, head: from + insert.length } : undefined,
        userEvent: 'input.ai',
        scrollIntoView: true,
      });
    },
    insertAt(pos, insert) {
      view.dispatch({
        changes: { from: pos, insert },
        selection: { anchor: pos + insert.length },
        userEvent: 'input.ai',
        scrollIntoView: true,
      });
    },
    undo: () => undo(view),
    redo: () => redo(view),

    // Autocorrect
    correct(fixes) {
      // Changing the text under an input method's composition breaks it.
      if (view.composing) return 0;
      const { state } = view;
      const length = state.doc.length;
      const fit = fixes
        .filter(
          (f) =>
            f.from >= 0 &&
            f.from <= f.to &&
            f.to <= length &&
            state.sliceDoc(f.from, f.to) !== f.insert &&
            !isKept(state, f.from, f.to) &&
            api.isProse(f.from, f.to),
        )
        .sort((a, b) => a.from - b.from);
      const list: typeof fit = [];
      for (const f of fit) if (!list.length || f.from >= list[list.length - 1]!.to) list.push(f);
      if (!list.length) return 0;
      const changes = state.changes(list.map(({ from, to, insert }) => ({ from, to, insert })));
      const at = Date.now();
      view.dispatch({
        changes,
        annotations: [correction.of(true), isolateHistory.of('full')],
        userEvent: 'input.correct',
        effects: addFixes.of(
          list.map((f) => ({
            from: changes.mapPos(f.from, -1),
            to: changes.mapPos(f.to, 1),
            original: state.sliceDoc(f.from, f.to),
            at,
            shown: true,
          })),
        ),
      });
      setTimeout(() => {
        if (!destroyed) view.dispatch({ effects: fadeFixes.of(at) });
      }, FIX_SHOWN_MS);
      return list.length;
    },
    isProse(from, to) {
      const end = Math.min(Math.max(to, from + 1), view.state.doc.length);
      const tree = ensureSyntaxTree(view.state, end, 50) ?? syntaxTree(view.state);
      let prose = true;
      tree.iterate({
        from,
        to: end,
        enter: (n) => {
          if (NOT_PROSE.has(n.name)) prose = false;
          return prose;
        },
      });
      return prose;
    },

    // Ghost text
    showGhost(pos, text, display = '') {
      view.dispatch({ effects: setGhost.of({ pos, text, display }) });
    },
    ghost: () => view.state.field(ghostField),
    clearGhost() {
      if (view.state.field(ghostField)) view.dispatch({ effects: setGhost.of(null) });
    },
    acceptGhost: () => acceptGhost(view),

    // Tracked suggestions
    addSuggestion({
      from,
      to,
      insert = '',
      label = '',
      status = 'streaming',
      group = '',
      compact = false,
      warning = '',
    }) {
      const id = `s${++seq}`;
      view.dispatch({ effects: addSuggestion.of({ id, from, to, insert, label, status, group, compact, warning }) });
      return id;
    },
    acceptSuggestions(ids) {
      const list = view.state
        .field(sugField)
        .filter((x) => ids.includes(x.id))
        .sort((a, b) => a.from - b.from);
      const first = list[0];
      if (!first) return;
      // Overlapping changes can't both apply: keep the first of any pair.
      const changes: typeof list = [];
      for (const s of list) if (!changes.length || s.from >= changes[changes.length - 1]!.to) changes.push(s);
      view.dispatch({
        changes: changes.map((s) => ({ from: s.from, to: s.to, insert: s.insert })),
        effects: list.map((s) => removeSuggestion.of(s.id)),
        annotations: acceptingAnnotation.of(true),
        userEvent: 'input.ai',
      });
      opts.onAccept?.(first.id, { ...first, count: changes.length });
      view.focus();
    },
    rejectSuggestions(ids) {
      const list = view.state.field(sugField).filter((x) => ids.includes(x.id));
      const first = list[0];
      if (!first) return;
      view.dispatch({ effects: list.map((s) => removeSuggestion.of(s.id)) });
      opts.onReject?.(first.id, first);
      view.focus();
    },
    updateSuggestion(id, patch) {
      view.dispatch({ effects: updateSuggestion.of({ id, ...patch }) });
    },
    suggestion: (id) => view.state.field(sugField).find((s) => s.id === id) || null,
    suggestions: () => view.state.field(sugField),
    acceptSuggestion(id) {
      const s = view.state.field(sugField).find((x) => x.id === id);
      if (!s) return;
      view.dispatch({
        changes: { from: s.from, to: s.to, insert: s.insert },
        effects: removeSuggestion.of(id),
        annotations: acceptingAnnotation.of(true),
        selection: { anchor: s.from + s.insert.length },
        userEvent: 'input.ai',
      });
      opts.onAccept?.(id, s);
      view.focus();
    },
    rejectSuggestion(id) {
      const s = view.state.field(sugField).find((x) => x.id === id);
      view.dispatch({ effects: removeSuggestion.of(id) });
      opts.onReject?.(id, s);
      view.focus();
    },

    // Review notes
    setNotes(notes) {
      view.dispatch({ effects: setNotes.of(notes) });
    },
    notes: () => view.state.field(notesField).notes,
    removeNote(id) {
      view.dispatch({ effects: removeNote.of(id) });
    },
    activateNote(id, scroll = false) {
      const n = view.state.field(notesField).notes.find((x) => x.id === id);
      const effects: StateEffect<unknown>[] = [setActiveNote.of(id)];
      if (scroll && n) effects.push(EditorView.scrollIntoView(n.from, { y: 'center' }));
      view.dispatch({ effects });
    },

    // Analysis
    setAnalysis(ranges) {
      view.dispatch({ effects: setAnalysis.of(ranges || []) });
    },

    // Focus mode
    setFocus(on) {
      view.dispatch({ effects: focusCompartment.reconfigure(on ? focusPlugin : []) });
    },

    scrollTo(pos) {
      view.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) });
    },
    destroy() {
      destroyed = true;
      view.destroy();
    },
  };

  return api;
}
