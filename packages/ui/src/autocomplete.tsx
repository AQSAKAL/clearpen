// The next logical sentence. When the writer finishes a sentence and pauses,
// Clearpen asks whether the paragraph has made its point. If it has, a small
// "¶ point made" appears (Tab starts a new paragraph); if not, one sentence
// in grey supplies the missing part, appearing as the model writes it. Tab
// keeps it; typing on ignores it. While the model is still thinking, three
// dots at the cursor say something is on its way.
// After a suggestion is taken, Clearpen waits for words of the writer's own,
// so Tab can never write a paragraph. ⌘J asks at once, after a sentence or a
// lead-in like "Three reasons:", and says so when there's nothing to offer.

import {
  articleOpening,
  endsLeadIn,
  endsSentence,
  NEXT_SENTENCE_PAUSE_MS,
  nextSentenceSpot,
  OWN_WORDS_BETWEEN,
  sectionAt,
} from '@clearpen/core';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useAI } from './ai.tsx';
import { usePage } from './editor-ref.tsx';
import { useGuide } from './guide.tsx';
import { useLibrary } from './library.tsx';
import { useMode } from './mode.ts';
import { useSettings } from './settings.tsx';

export const POINT_MADE = ' ¶ point made · Tab for new paragraph';
/** How long a suggestion asked for on a pause may take before the dots show that it's coming. */
const PENDING_AFTER_MS = 300;

export function Autocomplete() {
  const page = usePage();
  const ai = useAI();
  const { backend, current } = useLibrary();
  const { settings } = useSettings();
  const mode = useMode();
  const guide = useGuide();
  const state = useRef({
    seq: 0,
    /** Characters the writer typed since they last took a suggestion. */
    typed: Number.POSITIVE_INFINITY,
    length: 0,
    /** Where the suggestion on its way belongs; autocorrect's fixes move it. */
    at: 0,
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    ctrl: null as AbortController | null,
  });
  // The mode may turn suggestions off, and a guide in progress has the cursor's grey text.
  // The brief tells the model what the article is about.
  const live = useRef({
    on: settings.autocomplete,
    busy: ai.busy,
    mode,
    guided: !!guide.template,
    brief: current?.brief,
  });
  live.current = {
    on: settings.autocomplete && mode.aids.next,
    busy: ai.busy,
    mode,
    guided: !!guide.template,
    brief: current?.brief,
  };

  useEffect(() => {
    const s = state.current;
    const mod = backend.platform === 'mac' ? '⌘' : 'Ctrl+';

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
      if (force && !live.current.mode.aids.next) {
        toast(`Next-sentence suggestions are off in ${live.current.mode.label}`);
        return;
      }
      if (force && live.current.guided) {
        toast('Finish or stop the frames first — the frames have the cursor');
        return;
      }
      if (!force && (!live.current.on || live.current.busy || live.current.guided || s.typed < OWN_WORDS_BETWEEN))
        return;
      if (!force && !nextSentenceSpot(text, pos)) return;
      // One AI thing on screen at a time.
      if (ed.suggestions().length) return;
      const before = text.slice(Math.max(0, pos - 6000), pos);
      const id = ++s.seq;
      const ctrl = new AbortController();
      s.ctrl = ctrl;
      s.at = pos;
      // The section's notes steer the next sentence toward the writer's next point.
      const section = sectionAt(text, pos);
      // The writer moved on while the model thought.
      const stale = () => id !== s.seq || ed.cursor() !== s.at || !ed.getSelection().empty;
      let complete = false;
      let offered = false;
      // Something is on its way: dots at the cursor — at once when the writer
      // asked, after a moment otherwise, so a quick answer doesn't flicker.
      const dots = setTimeout(
        () => {
          if (!stale() && !ed.ghost()) ed.showGhost(s.at, '', 'Working on a suggestion', 'pending');
        },
        force ? 0 : PENDING_AFTER_MS,
      );
      try {
        for await (const ev of backend.ai.nextSentence(
          {
            title: page.title.current,
            before,
            heading: section?.heading ?? '',
            notes: section?.points ?? [],
            // What the article is about, however far the cursor has come from its opening.
            brief: live.current.brief,
            opening: articleOpening(text.slice(0, pos)),
          },
          { signal: ctrl.signal },
        )) {
          if (stale()) return;
          if (ev.type === 'verdict') {
            complete = ev.complete;
            if (complete) ed.showGhost(s.at, '\n\n', POINT_MADE);
          } else if (ev.type === 'text') ed.showGhost(s.at, ev.text);
          // Shown as it streamed, then taken back if it only repeated what's there.
          else if (!complete) {
            if (ev.next.trim()) ed.showGhost(s.at, ev.next);
            else ed.clearGhost();
          }
          offered = complete || (ev.type === 'done' && !!ev.next.trim());
        }
      } catch {
        // The model is away: no suggestion this time.
        if (stale()) return;
        ed.clearGhost();
        if (force) toast('Couldn’t reach the model for a suggestion');
        return;
      } finally {
        // The dots go with the answer — unless a newer request has put up its own.
        clearTimeout(dots);
        if (id === s.seq && ed.ghost()?.kind === 'pending') ed.clearGhost();
      }
      if (force && !offered && !stale()) toast('Nothing new to suggest here');
    }

    const offUpdate = page.on('update', (u) => {
      if (!u.docChanged && !u.selectionSet) return;
      const ed = page.editor.current;
      const length = ed?.length() ?? 0;
      // Autocorrect fixed words behind the cursor: a suggestion showing, or on its way, still fits.
      if (u.corrected) {
        s.length = length;
        s.at = u.mapPos(s.at, 1);
        return;
      }
      if (u.ghostAccepted) s.typed = 0;
      else if (u.userEdit) s.typed += Math.max(0, length - s.length);
      s.length = length;
      cancel();
      // Autocomplete disabled: only manual Cmd+J remains.
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
