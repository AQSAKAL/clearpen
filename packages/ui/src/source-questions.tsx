// Asking the article's sources a question. A line that starts with "@" is a
// question: Enter asks it, and the answer takes the line's place as a tracked
// change — Accept keeps it, Reject leaves the question. About a passage, the
// selection bar asks, with the selection itself or a question typed in its
// field, and the answer is a note beside the passage. Answers come from the
// saved pages alone, and say which page and section they came from.

import { citation, type SourceAnswer } from '@clearpen/core';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAI } from './ai.tsx';
import type { Span } from './edit-actions.ts';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';
import { useNotes } from './notes.tsx';
import { useStatus } from './status.tsx';

export const ASK_HINT = ' ask your sources — type a question, then Enter';
const NO_SOURCES = 'Add a page to ask your sources: ⋯ → Sources';
const NOT_FOUND = 'Your sources don’t say — nothing in them answers that';

/** The question an "@" line asks, or null. */
export function atQuestion(line: string): string | null {
  const m = line.match(/^\s*@\s*(\S.*?)\s*$/);
  return m && m[1]!.length >= 3 ? m[1]! : null;
}

/** Where an answer came from: each page once, with the sections it came from — two of each at most. */
export function sourcesOf(a: SourceAnswer): string {
  const pages = new Map<string, string[]>();
  for (const p of a.passages) {
    const page = citation({ ...p, heading: '' });
    const sections = pages.get(page) ?? [];
    if (p.heading && !sections.includes(p.heading)) sections.push(p.heading);
    pages.set(page, sections);
  }
  return [...pages]
    .slice(0, 2)
    .map(([page, sections]) => [page, ...sections.slice(0, 2).map((s) => `“${s}”`)].join(', '))
    .join('; ');
}

/** An answer as the article may keep it: what the sources say, then where. */
export const answerText = (a: SourceAnswer) => `${a.answer} (${sourcesOf(a)})`;

/** Asking about a passage, from the selection bar: the answer is a note beside it. */
export function useSourceQuestions(openNotes: () => void) {
  const { backend, current } = useLibrary();
  const page = usePage();
  const ai = useAI();
  const notes = useNotes();
  const status = useStatus();
  const sources = current?.brief.sources;

  const ask = useCallback(
    (span: Span, question: string) => {
      const ed = page.editor.current;
      if (!ed) return;
      if (!sources?.length) {
        status.show({ text: NO_SOURCES, ms: 4000 });
        return;
      }
      const snapshot = ed.getText();
      openNotes();
      void ai.run('Asking your sources', async (signal) => {
        const a = await backend.ai.askSources(
          { question, about: snapshot.slice(span.from, span.to), title: page.title.current, sources },
          { signal },
        );
        notes.add(
          [
            {
              from: span.from,
              to: span.to,
              category: 'sources',
              title: a.found ? sourcesOf(a) : 'Not in your sources',
              issue: a.answer,
              origin: 'source',
            },
          ],
          snapshot,
        );
        status.show(a.found ? 'The answer is in the margin' : NOT_FOUND);
      });
    },
    [ai, backend, notes, openNotes, page, sources, status],
  );

  return useMemo(() => ({ can: !!sources?.length, ask }), [sources, ask]);
}

/** "@" lines in the text: a hint on the "@", and Enter to ask. */
export function SourceQuestions() {
  const { backend, current } = useLibrary();
  const page = usePage();
  const ai = useAI();
  const status = useStatus();
  const live = useRef({ sources: current?.brief.sources, busy: ai.busy, ai, status, backend });
  live.current = { sources: current?.brief.sources, busy: ai.busy, ai, status, backend };

  useEffect(() => {
    const askAt = (from: number, to: number, question: string) => {
      const ed = page.editor.current;
      const { sources, busy, ai, status, backend } = live.current;
      if (!ed) return;
      if (!sources?.length) {
        status.show({ text: NO_SOURCES, ms: 4000 });
        return;
      }
      if (busy) {
        status.show('Wait for the current AI task to finish.');
        return;
      }
      // What the question is about: the text just before it ("what does this show?").
      const about = ed.slice(Math.max(0, from - 1500), from);
      const id = ed.addSuggestion({ from, to, insert: '', status: 'streaming', group: `ask-${Date.now()}` });
      void ai.run('Asking your sources', async (signal) => {
        let a: SourceAnswer;
        try {
          a = await backend.ai.askSources({ question, about, title: page.title.current, sources }, { signal });
        } catch (err) {
          ed.rejectSuggestion(id);
          throw err;
        }
        // The writer changed the question meanwhile: it isn't the one answered.
        if (!ed.suggestion(id)) return;
        if (!a.found) {
          ed.rejectSuggestion(id);
          status.show({ text: NOT_FOUND, ms: 4000 });
          return;
        }
        ed.updateSuggestion(id, { insert: answerText(a), status: 'ready', label: 'From your sources' });
      });
    };

    return page.on('update', (u) => {
      const ed = page.editor.current;
      if (!ed || !u.docChanged || !u.userEdit) return;
      // Enter at the end of an "@" line asks it.
      for (const r of u.typed) {
        if (!ed.slice(r.from, r.to).startsWith('\n')) continue;
        const line = ed.lineAt(r.from);
        const question = atQuestion(line.text);
        if (question) {
          askAt(line.from, line.to, question);
          return;
        }
      }
      // An "@" just typed at the start of a line: say what it does.
      const sel = ed.getSelection();
      const line = ed.lineAt(sel.from);
      if (sel.empty && sel.from === line.to && /^\s*@$/.test(line.text) && live.current.sources?.length && !ed.ghost())
        ed.showGhost(sel.from, '', ASK_HINT);
    });
  }, [page]);

  return null;
}
