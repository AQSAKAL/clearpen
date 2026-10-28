// The margin: each note beside the passage it's about. Notes are nudged apart
// so none overlap; the active note keeps its place and its neighbours move
// around it. In a narrow window the same notes are a list instead.

import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { usePage } from '../editor-ref.tsx';
import { useNotes } from '../notes.tsx';
import { NoteCardView, NotesSummaryCard } from './note-card.tsx';

const GAP = 10;

export function MarginNotes() {
  const notes = useNotes();
  const page = usePage();
  const column = useRef<HTMLDivElement>(null);
  const summaryEl = useRef<HTMLDivElement>(null);
  const cardEls = useRef(new Map<string, HTMLDivElement>());
  const frame = useRef(0);

  const layout = useCallback(() => {
    const ed = page.editor.current;
    const col = column.current;
    if (!ed || !col) return;
    const base = ed.documentTop() - col.getBoundingClientRect().top;
    const items = notes.live
      .map((n) => ({ id: n.id, el: cardEls.current.get(n.id), want: base + ed.topOf(n.from) - 8 }))
      .filter((x): x is { id: string; el: HTMLDivElement; want: number } => !!x.el);
    if (!items.length) {
      col.style.minHeight = '';
      return;
    }
    const h = items.map((x) => x.el.offsetHeight);
    const pos = items.map((x) => x.want);
    const a = items.findIndex((x) => x.id === notes.active);
    const start = Math.max(a, 0);
    for (let i = start + 1; i < items.length; i++) pos[i] = Math.max(pos[i]!, pos[i - 1]! + h[i - 1]! + GAP);
    for (let i = start - 1; i >= 0; i--) pos[i] = Math.min(pos[i]!, pos[i + 1]! - h[i]! - GAP);
    // Everything below the summary card, and clear of each other.
    const minTop = summaryEl.current ? summaryEl.current.offsetHeight + 14 : 0;
    for (let i = 0; i < items.length; i++) pos[i] = Math.max(pos[i]!, i === 0 ? minTop : pos[i - 1]! + h[i - 1]! + GAP);
    items.forEach((x, i) => {
      x.el.style.top = `${pos[i]}px`;
      x.el.style.visibility = '';
    });
    col.style.minHeight = `${Math.max(...items.map((_, i) => pos[i]! + h[i]!))}px`;
  }, [notes.live, notes.active, page]);

  const queue = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(layout);
  }, [layout]);

  useLayoutEffect(() => {
    layout();
  });

  useEffect(() => {
    const offGeometry = page.on('geometry', queue);
    const offUpdate = page.on('update', (u) => u.docChanged && queue());
    window.addEventListener('resize', queue);
    document.fonts?.ready.then(queue);
    return () => {
      offGeometry();
      offUpdate();
      window.removeEventListener('resize', queue);
      cancelAnimationFrame(frame.current);
    };
  }, [page, queue]);

  if (!notes.summary && !notes.live.length) return null;

  return (
    <aside ref={column} aria-label="Notes" className="relative w-full">
      {notes.summary && <NotesSummaryCard ref={summaryEl} summary={notes.summary} count={notes.live.length} />}
      {notes.live.map((n) => (
        <NoteCardView
          key={n.id}
          id={n.id}
          open={notes.active === n.id}
          ref={(el) => {
            if (el) cardEls.current.set(n.id, el);
            else cardEls.current.delete(n.id);
          }}
          className="absolute inset-x-0 transition-[top] duration-150"
          style={{ visibility: 'hidden' }}
        />
      ))}
    </aside>
  );
}

/** The same notes as a list, for a narrow window. */
export function NotesList() {
  const notes = useNotes();
  return (
    <div className="grid gap-2.5">
      {notes.summary ? (
        <NotesSummaryCard summary={notes.summary} count={notes.live.length} />
      ) : (
        !notes.live.length && (
          <p className="text-sm text-muted-foreground">Press Review for an editor’s notes on your draft.</p>
        )
      )}
      {notes.live.map((n) => (
        <NoteCardView key={n.id} id={n.id} open />
      ))}
    </div>
  );
}
