// The next logical sentence. When the writer finishes a sentence and pauses,
// Margin asks whether the paragraph has made its point. If it has, a small
// "¶ point made" appears (Tab starts a new paragraph); if not, one sentence
// in grey supplies the missing part, appearing as the model writes it. Tab
// keeps it; typing on ignores it.
// After a suggestion is taken, Margin waits for words of the writer's own,
// so Tab can never write a paragraph.

import { NEXT_SENTENCE_PAUSE_MS, nextSentenceSpot, OWN_WORDS_BETWEEN, sectionAt } from '@margin/core';
import { useEffect, useRef } from 'react';
import { useAI } from './ai.tsx';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';
import { useSettings } from './settings.tsx';

export const POINT_MADE = ' ¶ point made · Tab for new paragraph';

export function Autocomplete() {
  const page = usePage();
  const ai = useAI();
  const { backend, current } = useLibrary();
  const { settings } = useSettings();
  const state = useRef({
    seq: 0,
    /** Characters the writer typed since they last took a suggestion. */
    typed: Number.POSITIVE_INFINITY,
    length: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    ctrl: null as AbortController | null,
  });
  const live = useRef({ on: settings.autocomplete, busy: ai.busy });
  live.current = { on: settings.autocomplete, busy: ai.busy };

  useEffect(() => {
    const s = state.current;

    // Any answer still on its way is now stale.
    const cancel = () => {
      s.seq++;
      clearTimeout(s.timer);
      s.ctrl?.abort();
      s.ctrl = null;
    };

    async function suggest(force: boolean) {
      cancel();
      const ed = page.editor.current;
      if (!ed) return;
      const sel = ed.getSelection();
      if (!sel.empty) return;
      const pos = sel.from;
      const text = ed.getText();
      if (!force && (!live.current.on || live.current.busy || s.typed < OWN_WORDS_BETWEEN)) return;
      if (!force && !nextSentenceSpot(text, pos)) return;
      // One AI thing on screen at a time.
      if (ed.suggestions().length) return;
      const id = ++s.seq;
      const ctrl = new AbortController();
      s.ctrl = ctrl;
      // The section's notes steer the next sentence toward the writer's next point.
      const section = sectionAt(text, pos);
      // The writer moved on while the model thought.
      const stale = () => id !== s.seq || ed.cursor() !== pos || !ed.getSelection().empty;
      let complete = false;
      try {
        for await (const ev of backend.ai.nextSentence(
          {
            title: page.title.current,
            before: text.slice(Math.max(0, pos - 6000), pos),
            heading: section?.heading ?? '',
            notes: section?.points ?? [],
          },
          { signal: ctrl.signal },
        )) {
          if (stale()) return;
          if (ev.type === 'verdict') {
            complete = ev.complete;
            if (complete) ed.showGhost(pos, '\n\n', POINT_MADE);
          } else if (ev.type === 'text') ed.showGhost(pos, ev.text);
          // Shown as it streamed, then taken back if it only repeated what's there.
          else if (!complete) {
            if (ev.next.trim()) ed.showGhost(pos, ev.next);
            else ed.clearGhost();
          }
        }
      } catch {
        // The model is away: no suggestion this time.
        if (!stale()) ed.clearGhost();
      }
    }

    const offUpdate = page.on('update', (u) => {
      if (!u.docChanged && !u.selectionSet) return;
      const ed = page.editor.current;
      const length = ed?.length() ?? 0;
      if (u.ghostAccepted) s.typed = 0;
      else if (u.userEdit) s.typed += Math.max(0, length - s.length);
      s.length = length;
      cancel();
      if (u.userEdit) s.timer = setTimeout(() => void suggest(false), NEXT_SENTENCE_PAUSE_MS);
    });
    const offNow = page.on('complete', () => void suggest(true));
    return () => {
      offUpdate();
      offNow();
      cancel();
    };
  }, [page, backend]);

  // A different article: start counting afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when another article opens.
  useEffect(() => {
    const s = state.current;
    s.seq++;
    s.ctrl?.abort();
    s.typed = Number.POSITIVE_INFINITY;
    s.length = page.editor.current?.length() ?? 0;
  }, [current?.id, page]);

  // Turned off, or another AI task started: take away what's showing.
  useEffect(() => {
    if (!settings.autocomplete || ai.busy) {
      state.current.seq++;
      state.current.ctrl?.abort();
      page.editor.current?.clearGhost();
    }
  }, [settings.autocomplete, ai.busy, page]);

  return null;
}
