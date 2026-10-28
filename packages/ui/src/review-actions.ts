// Review and Check. Both start with Clearpen's own checks — exact, instant and
// offline — and pin those first; the model's notes and verdicts follow.
// Nothing in the text changes: notes go in the margin.
//
// The point-made gate (`heldBack` in core's notes.ts says why): in a review,
// Clearpen's own sentence-level findings wait for the model's verdict on each
// paragraph; its exact and structure findings go up at once. A paragraph that
// has not yet made its point gets one "argument" note saying what it is
// missing, and the sentence notes inside it — Clearpen's and the model's —
// are kept under that note until the writer asks to see them.

import {
  type CheckEvent,
  checkOptions,
  countWords,
  type Finding,
  findingsIn,
  LENS_CATEGORIES,
  type Lens,
  modeOf,
  runChecks,
  SENTENCE_LEVEL,
  type Unfinished,
} from '@clearpen/core';
import { useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { useAI } from './ai.tsx';
import type { Span } from './edit-actions.ts';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';
import { type NoteInput, useNotes } from './notes.tsx';
import { useStatus } from './status.tsx';

export const LENSES: Record<Lens, { label: string; hint: string; title: string; doing: string; waiting: string }> = {
  factcheck: {
    label: 'Fact-check',
    hint: 'Claims, numbers, how things work',
    title: 'Fact-check',
    doing: 'Fact-checking',
    waiting: 'Checking each claim against what the model knows and your draft.',
  },
  logic: {
    label: 'Check the logic',
    hint: 'Does the conclusion follow?',
    title: 'Logic check',
    doing: 'Checking the reasoning',
    waiting: 'Testing whether each conclusion follows.',
  },
  consistency: {
    label: 'Check consistency',
    hint: 'Against the rest of the draft',
    title: 'Consistency check',
    doing: 'Comparing with the rest of the draft',
    waiting: 'Looking for places the draft disagrees with itself.',
  },
  clarity: {
    label: 'Check how it reads',
    hint: 'Where a reader links back, waits and stresses',
    title: 'Reading check',
    doing: 'Reading it as a reader would',
    waiting: 'Following each sentence from its opening words to its end.',
  },
};

const PASSED: Record<Lens, [string, string]> = {
  factcheck: ['claim checks out', 'claims check out'],
  logic: ['step holds up', 'steps hold up'],
  consistency: ['point agrees with the draft', 'points agree with the draft'],
  clarity: ['sentence reads clearly', 'sentences read clearly'],
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Hobbs's hierarchy as a ranking rule: what the argument gets wrong outranks
// how it is built, which outranks how a sentence reads — a wrong figure before
// a weak ending. Within a level, text order.
const LEVEL: Record<string, number> = {
  numbers: 0,
  factcheck: 0,
  logic: 0,
  evidence: 0,
  consistency: 0,
  compliance: 0,
  procedure: 0,
  structure: 1,
};
const level = (category: string) => LEVEL[category] ?? 2;
const byLevel = (a: Finding, b: Finding) => level(a.category) - level(b.category) || a.from - b.from || a.to - b.to;

/** Clearpen's own findings as notes, by level then position, saying they came from code, not the AI. */
const ownNotes = (findings: Finding[]): NoteInput[] =>
  [...findings].sort(byLevel).map((f) => ({
    from: f.from,
    to: f.to,
    category: f.category,
    title: f.title,
    issue: f.message,
    ...(f.suggestion ? { suggestion: f.suggestion } : {}),
    ...(f.related ? { related: f.related } : {}),
    origin: f.category === 'numbers' ? 'software' : 'rule',
  }));

const inside = (p: Unfinished) => (n: NoteInput) => n.from < p.to && n.to > p.from;

/** The one note on a paragraph that has not yet made its point, with the sentence notes it holds back. */
const unfinishedNote = (p: Unfinished, held: NoteInput[]): NoteInput => ({
  from: p.from,
  to: p.to,
  category: 'argument',
  title: 'Point not yet made',
  issue: `This paragraph hasn’t made its point yet: it still needs ${p.missing}. Its sentences can wait until it has.`,
  held,
});

/** `openNotes` shows the notes when the margin isn't on screen (a narrow window). */
export function useReviewActions(openNotes: () => void) {
  const { backend, current, flush } = useLibrary();
  const page = usePage();
  const ai = useAI();
  const notes = useNotes();
  const status = useStatus();
  const brief = current?.brief;

  // The mode decides which of Clearpen's own checks run; free writing runs none.
  const ownChecks = useCallback((text: string) => runChecks(text, checkOptions(brief)).findings, [brief]);
  const listener = modeOf(brief).review === 'listener';

  const review = useCallback(() => {
    const ed = page.editor.current;
    if (!ed) return;
    const content = ed.getText();
    if (countWords(content) < 30) {
      toast('Write a little more first — there’s nothing to review yet.');
      return;
    }
    notes.clear();
    openNotes();
    void ai.run(listener ? 'Listening' : 'Reviewing', async (signal) => {
      notes.setStop(() => ai.stop());
      notes.setSummary(
        listener
          ? {
              title: 'A listener’s notes',
              state: 'reading',
              text: '',
              label: 'Listening to your draft…',
              waiting: 'Reading for the thinking, not the prose.',
            }
          : { state: 'reading', text: '', label: 'Reading your draft…' },
      );
      let finished = false;
      // Sentence-level findings wait for the verdict on their paragraph; null once it has placed them.
      let pending: NoteInput[] | null = null;
      let held = 0;
      try {
        await flush();
        const own = ownNotes(ownChecks(content));
        pending = own.filter((n) => SENTENCE_LEVEL.includes(n.category));
        notes.add(
          own.filter((n) => !SENTENCE_LEVEL.includes(n.category)),
          content,
        );
        for await (const ev of backend.ai.review({ title: page.title.current, content, brief }, { signal })) {
          if (ev.type === 'notice') notes.setSummary({ label: ev.text });
          else if (ev.type === 'summary') notes.setSummary({ text: ev.text });
          else if (ev.type === 'unfinished') {
            const waiting = pending ?? [];
            const holders = ev.paragraphs.map((p) => unfinishedNote(p, waiting.filter(inside(p))));
            const shown = waiting.filter((n) => !ev.paragraphs.some((p) => inside(p)(n)));
            held += waiting.length - shown.length;
            notes.add([...holders, ...shown], content);
            pending = null;
          } else if (ev.type === 'note') {
            // The flag says where the note goes; the margin keeps its own held list.
            const { held: wait, ...note } = ev.note;
            if (wait) held += notes.hold([note], content);
            else notes.add([note], content);
          }
        }
        finished = true;
      } finally {
        // Stopped or failed before the verdicts came: nothing stays hidden.
        if (pending) notes.add(pending, content);
        notes.setStop(null);
        const n = ed.notes().length;
        notes.setSummary(finished || n ? { state: 'done' } : null);
      }
      const n = ed.notes().length;
      status.show(
        n
          ? `${plural(n, 'note')} in the margin${held ? `, ${held} held back` : ''} — click one to see its passage`
          : listener
            ? 'Nothing to add — the summary says what was heard.'
            : 'No notes — it reads cleanly.',
      );
    });
  }, [ai, backend, brief, flush, listener, notes, openNotes, ownChecks, page, status]);

  const check = useCallback(
    (span: Span, lens: Lens) => {
      const ed = page.editor.current;
      if (!ed) return;
      const L = LENSES[lens];
      const snapshot = ed.getText();
      const categories = LENS_CATEGORIES[lens];
      notes.clearIn(span.from, span.to, categories);
      openNotes();
      void ai.run(L.doing, async (signal) => {
        notes.setStop(() => ai.stop());
        notes.setSummary({ title: L.title, state: 'reading', label: `${L.doing}…`, waiting: L.waiting, text: '' });
        ed.setSelection(span.to, span.to, false);
        let flagged = notes.add(ownNotes(findingsIn(ownChecks(snapshot), span.from, span.to, categories)), snapshot);
        let passed = 0;
        let done: Extract<CheckEvent, { type: 'done' }> | null = null;
        try {
          for await (const ev of backend.ai.check(
            {
              title: page.title.current,
              content: snapshot,
              from: span.from,
              to: span.to,
              lens,
              ...(brief ? { brief } : {}),
            },
            { signal },
          )) {
            if (ev.type === 'notice') notes.setSummary({ label: ev.text });
            else if (ev.type === 'done') done = ev;
            else if (ev.item.ok) passed++;
            // Clearpen's exact arithmetic wins where it covers the same words.
            else if (!notes.overlaps(ev.item.from, ev.item.to, ['numbers'])) {
              const it = ev.item;
              flagged += notes.add(
                [
                  {
                    from: it.from,
                    to: it.to,
                    category: lens,
                    verdict: it.verdict,
                    issue: it.explanation,
                    suggestion: it.fix,
                    ...(lens === 'factcheck' ? { origin: it.verified ? 'verified' : 'knowledge' } : {}),
                  },
                ],
                snapshot,
              );
            }
          }
        } finally {
          notes.setStop(null);
          if (!done) notes.setSummary(ed.notes().length ? { state: 'done' } : null);
        }
        // The model's summary may describe corrections that didn't survive the second look.
        const verdict =
          done?.overall && !done.dropped
            ? `${done.overall[0]!.toUpperCase()}${done.overall.slice(1)}. ${done.summary || ''}`
            : '';
        const ok = passed ? ` ${passed} ${PASSED[lens][passed > 1 ? 1 : 0]}.` : '';
        const dropped = done?.dropped
          ? ` ${plural(done.dropped, 'suspected error')} ${done.dropped > 1 ? 'were' : 'was'} dropped: asked again, the model couldn’t stand behind ${done.dropped > 1 ? 'them' : 'it'}.`
          : '';
        const none = !flagged && !passed && !dropped ? 'Nothing to flag.' : '';
        notes.setSummary({ state: 'done', text: `${verdict}${ok}${dropped}${none}`.trim() });
        status.show(
          flagged
            ? `${plural(flagged, 'note')} in the margin`
            : `Nothing to flag — the ${L.title.toLowerCase()} passed`,
        );
      });
    },
    [ai, backend, brief, notes, openNotes, ownChecks, page, status],
  );

  return useMemo(() => ({ review, check }), [review, check]);
}
