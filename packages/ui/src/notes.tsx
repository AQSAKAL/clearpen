// Notes on the open article: the review's notes, a check's verdicts and
// Clearpen's own findings. The editor keeps each one pinned to its passage
// (and underlines it); this keeps what the note says, and the summary above
// the notes. Notes belong to the article on screen and go when it closes.

import { relocate, type Span } from '@clearpen/core';
import type { EditorNote } from '@clearpen/editor';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';
import { useStatus } from './status.tsx';

/** Where a note came from, so the writer knows how far to trust it. */
export type Origin = 'software' | 'rule' | 'knowledge' | 'verified' | 'source';

export interface NoteCard {
  category: string;
  issue: string;
  /** A replacement for the passage, or ''. */
  suggestion: string;
  /** The passage as the note read it. */
  quote: string;
  title?: string;
  verdict?: string;
  origin?: Origin;
  /** The other passage a consistency note is about. */
  related?: string;
  /** Sentence notes held back under this one until its paragraph makes its point, in the text they were found in. */
  held?: { list: NoteInput[]; snapshot: string };
}

export interface NoteInput extends Span {
  category: string;
  issue: string;
  suggestion?: string;
  title?: string;
  verdict?: string;
  origin?: Origin;
  related?: Span;
  /** Notes to keep under this one, shown only when the writer asks (the point-made gate). */
  held?: NoteInput[];
}

export interface NotesSummary {
  title?: string;
  state: 'reading' | 'done';
  /** While reading: what's happening. */
  label?: string;
  waiting?: string;
  text: string;
}

export interface NotesValue {
  /** The notes in text order, with their current positions. */
  live: EditorNote[];
  card(id: string): NoteCard | undefined;
  summary: NotesSummary | null;
  active: string | null;
  /** Adds notes found in `snapshot` (the text as it was when the work began); returns how many landed. */
  add(list: NoteInput[], snapshot?: string): number;
  /** Keeps each note under the holder covering its passage, found in the same `snapshot`; one with no holder is shown. Returns how many were kept. */
  hold(list: NoteInput[], snapshot?: string): number;
  /** Shows the notes held under `id`. */
  release(id: string): void;
  /** Removes notes of `categories` inside [from, to) — before a check runs there again. */
  clearIn(from: number, to: number, categories: readonly string[]): void;
  overlaps(from: number, to: number, categories: readonly string[]): boolean;
  setSummary(patch: Partial<NotesSummary> | null): void;
  /** What × does on the summary while notes are still arriving. */
  setStop(stop: (() => void) | null): void;
  stop(): void;
  clear(): void;
  dismiss(id: string): void;
  apply(id: string): void;
  showRelated(id: string): void;
  activate(id: string | null, scroll?: boolean): void;
}

const NotesContext = createContext<NotesValue | null>(null);

export function NotesProvider({ mod, children }: { mod: string; children: ReactNode }) {
  const page = usePage();
  const status = useStatus();
  const { current } = useLibrary();
  const cards = useRef(new Map<string, NoteCard>());
  const seq = useRef(0);
  const stopRef = useRef<(() => void) | null>(null);
  const [live, setLive] = useState<EditorNote[]>([]);
  const [summary, setSummaryState] = useState<NotesSummary | null>(null);
  const [active, setActive] = useState<string | null>(null);

  /** Reads the editor's notes again, and forgets cards whose passage is gone. */
  const sync = useCallback(() => {
    const notes = [...(page.editor.current?.notes() ?? [])];
    for (const id of [...cards.current.keys()]) if (!notes.some((n) => n.id === id)) cards.current.delete(id);
    setLive(notes);
  }, [page]);

  const clear = useCallback(() => {
    stopRef.current?.();
    cards.current.clear();
    page.editor.current?.setNotes([]);
    setActive(null);
    setSummaryState(null);
    setLive([]);
  }, [page]);

  // Notes belong to the article on screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when another article opens.
  useEffect(() => clear(), [current?.id, clear]);

  useEffect(() => {
    const offUpdate = page.on('update', (u) => {
      if (u.docChanged && cards.current.size) sync();
    });
    const offNote = page.on('note', (id) => {
      if (id) {
        setActive(id);
        page.editor.current?.activateNote(id, false);
      }
    });
    return () => {
      offUpdate();
      offNote();
    };
  }, [page, sync]);

  const value = useMemo<NotesValue>(() => {
    const ed = () => page.editor.current;
    const text = () => ed()?.getText() ?? '';
    const add = (list: NoteInput[], snapshot = text()): number => {
      const editor = ed();
      if (!editor) return 0;
      const now = editor.getText();
      const fresh: EditorNote[] = [];
      const existing = editor.notes();
      // Never two notes of a kind on the same words.
      const taken = (category: string, at: Span) =>
        [...existing, ...fresh].some((n) => n.category === category && n.from < at.to && at.from < n.to);
      // Notes held under a holder that can't be placed are shown instead: nothing is lost.
      const orphans: NoteInput[] = [];
      for (const x of list) {
        const at = relocate(x, snapshot, now);
        if (!at || taken(x.category, at)) {
          if (x.held) orphans.push(...x.held);
          continue;
        }
        const id = `n${++seq.current}`;
        const quote = now.slice(at.from, at.to);
        cards.current.set(id, {
          category: x.category,
          issue: x.issue,
          suggestion: x.suggestion && x.suggestion.trim() !== quote.trim() ? x.suggestion : '',
          quote,
          ...(x.title ? { title: x.title } : {}),
          ...(x.verdict ? { verdict: x.verdict } : {}),
          ...(x.origin ? { origin: x.origin } : {}),
          ...(x.related ? { related: snapshot.slice(x.related.from, x.related.to) } : {}),
          ...(x.held ? { held: { list: [...x.held], snapshot } } : {}),
        });
        fresh.push({ id, from: at.from, to: at.to, category: x.category });
      }
      if (fresh.length) editor.setNotes([...existing, ...fresh].sort((a, b) => a.from - b.from));
      sync();
      return fresh.length + (orphans.length ? add(orphans, snapshot) : 0);
    };

    const hold = (list: NoteInput[], snapshot = text()): number => {
      const editor = ed();
      if (!editor) return 0;
      const now = editor.getText();
      const shown: NoteInput[] = [];
      let kept = 0;
      for (const x of list) {
        const at = relocate(x, snapshot, now);
        const holder =
          at &&
          editor.notes().find((n) => {
            const h = cards.current.get(n.id)?.held;
            return h?.snapshot === snapshot && n.from < at.to && at.from < n.to;
          });
        if (holder) {
          cards.current.get(holder.id)!.held!.list.push(x);
          kept++;
        } else shown.push(x);
      }
      if (shown.length) add(shown, snapshot);
      else sync();
      return kept;
    };

    const dismiss = (id: string) => {
      ed()?.removeNote(id);
      cards.current.delete(id);
      setActive((a) => (a === id ? null : a));
      sync();
    };

    return {
      live,
      card: (id) => cards.current.get(id),
      summary,
      active,
      add,
      hold,
      release(id) {
        const c = cards.current.get(id);
        if (!c?.held) return;
        const { held, ...rest } = c;
        cards.current.set(id, rest);
        add(held.list, held.snapshot);
      },
      clearIn(from, to, categories) {
        const editor = ed();
        for (const n of editor?.notes() ?? []) {
          if (categories.includes(n.category) && n.from >= from && n.to <= to) {
            editor?.removeNote(n.id);
            cards.current.delete(n.id);
          }
        }
        sync();
      },
      overlaps: (from, to, categories) =>
        (ed()?.notes() ?? []).some((n) => categories.includes(n.category) && n.from < to && from < n.to),
      setSummary: (patch) =>
        setSummaryState((s) => (patch ? { state: 'done', text: '', ...(s ?? {}), ...patch } : null)),
      setStop(stop) {
        stopRef.current = stop;
      },
      stop: () => stopRef.current?.(),
      clear,
      dismiss,
      apply(id) {
        const editor = ed();
        const n = editor?.notes().find((x) => x.id === id);
        const c = cards.current.get(id);
        if (!editor || !n || !c?.suggestion) return;
        // Replace only the passage the note read — not what's been typed into it since.
        let { from, to } = n;
        if (editor.slice(from, to) !== c.quote) {
          const near = editor.getText().indexOf(c.quote, Math.max(0, from - 200));
          if (near === -1 || near > to + 200) {
            toast('You’ve changed that passage since — edit it by hand, or dismiss the note.');
            return;
          }
          from = near;
          to = near + c.quote.length;
        }
        editor.replace(from, to, c.suggestion);
        dismiss(id);
        status.show({ text: 'Applied', ms: 2000, keys: [`${mod}Z to undo`] });
      },
      showRelated(id) {
        const editor = ed();
        const quote = cards.current.get(id)?.related;
        const n = editor?.notes().find((x) => x.id === id);
        if (!editor || !quote || !n) return;
        const all = editor.getText();
        let at = all.indexOf(quote);
        while (at !== -1 && at < n.to && at + quote.length > n.from) at = all.indexOf(quote, at + 1);
        if (at === -1) {
          toast('That passage has changed since the check.');
          return;
        }
        editor.setSelection(at, at + quote.length);
        editor.scrollTo(at);
        editor.focus();
      },
      activate(id, scroll = false) {
        setActive(id);
        ed()?.activateNote(id, scroll);
      },
    };
  }, [page, live, summary, active, sync, clear, status, mod]);

  return <NotesContext.Provider value={value}>{children}</NotesContext.Provider>;
}

export function useNotes(): NotesValue {
  const v = useContext(NotesContext);
  if (!v) throw new Error('useNotes needs a NotesProvider');
  return v;
}
