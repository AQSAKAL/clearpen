// @margin/editor — Margin's writing surface: CodeMirror 6, dressed for prose,
// with the hooks the AI features need. The app only ever talks to the small
// API that createEditor() returns.

import { defaultKeymap, history, historyKeymap, redo, undo } from '@codemirror/commands';
import { markdown, markdownKeymap, markdownLanguage } from '@codemirror/lang-markdown';
import { syntaxHighlighting } from '@codemirror/language';
import { highlightSelectionMatches, searchKeymap } from '@codemirror/search';
import { EditorState, type Extension, type StateEffect } from '@codemirror/state';
import { drawSelection, EditorView, keymap, placeholder } from '@codemirror/view';
import { analysisField, setAnalysis } from './analysis.ts';
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
import type { EditorOptions, MarginEditor } from './types.ts';

export type {
  AnalysisRange,
  EditorNote,
  EditorOptions,
  EditorUpdate,
  Ghost,
  MarginEditor,
  Suggestion,
  SuggestionInput,
  SuggestionStatus,
} from './types.ts';

/** Creates the writing surface inside `parent`. */
export function createEditor(parent: HTMLElement, opts: EditorOptions = {}): MarginEditor {
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
          // The writer's own typing — as opposed to taking a suggested sentence.
          userEdit: u.transactions.some((tr) => tr.isUserEvent('input.type')),
          ghostAccepted: u.transactions.some((tr) => tr.isUserEvent('input.complete')),
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
  const api: MarginEditor = {
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
    destroy: () => view.destroy(),
  };

  return api;
}
