// A web address on a line of its own is usually a page the writer means to
// draw on. Right after they paste one — or pause after typing one — a grey
// line offers to add it to the article's sources: Tab adds it and starts a
// new paragraph, typing on leaves it. Each address is offered once.

import { NEXT_SENTENCE_PAUSE_MS } from '@clearpen/core';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { usePage } from './editor-ref.tsx';
import { useGuide } from './guide.tsx';
import { useLibrary } from './library.tsx';
import { useSourceActions } from './source-actions.ts';

export const ADD_SOURCE_HINT = ' ⤷ add this page to your sources · Tab';

/** A typed address may not be finished at the first pause; wait longer than for a sentence. */
const TYPED_PAUSE_MS = NEXT_SENTENCE_PAUSE_MS * 2;

/** The address a line holds when it holds nothing else: bare, or in angle brackets. */
export function lineUrl(line: string): string | null {
  // A full stop or comma after it is the line's, not the address's.
  const m = line.trim().match(/^<?(https?:\/\/[^\s<>]+?)>?[.,;:!?]*$/i);
  if (!m) return null;
  const url = m[1]!;
  try {
    return new URL(url).hostname.includes('.') ? url : null;
  } catch {
    return null;
  }
}

export function SourceLinks() {
  const page = usePage();
  const { current } = useLibrary();
  const guide = useGuide();
  const actions = useSourceActions();
  const live = useRef({ actions, guided: !!guide.template });
  live.current = { actions, guided: !!guide.template };
  const state = useRef({
    timer: undefined as ReturnType<typeof setTimeout> | undefined,
    /** The address the grey line is offering. */
    offering: null as string | null,
    offered: new Set<string>(),
  });

  useEffect(() => {
    const s = state.current;
    const offer = () => {
      const ed = page.editor.current;
      const { actions, guided } = live.current;
      // Not over another grey line, a suggestion, or a guide's frame.
      if (!ed || !actions.canFetch || actions.full || guided || ed.ghost() || ed.suggestions().length) return;
      const sel = ed.getSelection();
      const line = ed.lineAt(sel.from);
      if (!sel.empty || sel.from !== line.to) return;
      const url = lineUrl(line.text);
      if (!url || s.offered.has(url) || actions.has(url)) return;
      s.offered.add(url);
      s.offering = url;
      ed.showGhost(sel.from, '\n\n', ADD_SOURCE_HINT);
    };

    const off = page.on('update', (u) => {
      // Tab took the offer.
      if (u.ghostAccepted && s.offering) {
        const url = s.offering;
        s.offering = null;
        const id = toast.loading('Adding the page to your sources…');
        void live.current.actions.addPage(url).finally(() => toast.dismiss(id));
        return;
      }
      // The writer typed on or moved away, or other grey text took its place.
      if (s.offering && page.editor.current?.ghost()?.display !== ADD_SOURCE_HINT) s.offering = null;
      if (!u.docChanged || u.corrected || u.ghostAccepted) return;
      clearTimeout(s.timer);
      // A paste is a finished address; a typed one may not be, until the writer stops.
      if (u.userEdit) s.timer = setTimeout(offer, TYPED_PAUSE_MS);
      else offer();
    });
    return () => {
      off();
      clearTimeout(s.timer);
    };
  }, [page]);

  // Another article: offer afresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when another article opens.
  useEffect(() => {
    state.current.offered = new Set();
    state.current.offering = null;
  }, [current?.id]);

  return null;
}
