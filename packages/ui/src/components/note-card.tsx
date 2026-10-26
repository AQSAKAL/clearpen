// One note: what it's about, what's wrong, a fix to apply, and where the
// note came from.

import { CATEGORY_LABELS, warning } from '@clearpen/core';
import { XIcon } from 'lucide-react';
import { forwardRef } from 'react';
import { cn } from '../lib/utils.ts';
import { type NotesSummary, type Origin, useNotes } from '../notes.tsx';
import { Button } from './ui/button.tsx';

export const ORIGIN: Record<Origin, string> = {
  software: 'Calculated by Clearpen, not the AI.',
  rule: 'Spotted by Clearpen’s rules, not the AI.',
  knowledge: 'From the model’s own knowledge — it can’t browse. Verify before you publish.',
  verified:
    'From the model’s own knowledge, confirmed when asked again — it can’t browse, so verify before you publish.',
};

const BAD = /incorrect|contradict|fallacy|does not follow|unsupported|misleading/i;

const label = (category: string) => CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category;

export const NoteCardView = forwardRef<
  HTMLDivElement,
  { id: string; open: boolean; style?: React.CSSProperties; className?: string }
>(function NoteCardView({ id, open, style, className }, ref) {
  const notes = useNotes();
  const c = notes.card(id);
  if (!c) return null;
  const fixWarning = c.suggestion && c.quote ? warning(c.quote, c.suggestion) : '';
  return (
    // biome-ignore lint/a11y/useSemanticElements: a card that also holds its own buttons.
    <div
      ref={ref}
      role="button"
      tabIndex={0}
      data-note-id={id}
      style={{ ...style, borderLeftColor: `var(--c-${c.category}, var(--ai))` }}
      onClick={() => notes.activate(id, true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) notes.activate(id, true);
      }}
      className={cn(
        'w-full cursor-pointer rounded-md border border-l-[3px] bg-card p-3 text-left text-sm shadow-xs transition-shadow outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        notes.active === id && 'shadow-md ring-1 ring-ring/40',
        className,
      )}
    >
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span className="min-w-0 truncate">
          {label(c.category)}
          {c.title ? ` · ${c.title}` : ''}
        </span>
        {c.verdict && (
          <span
            className={cn(
              'ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] normal-case tracking-normal',
              BAD.test(c.verdict) ? 'bg-destructive/12 text-destructive' : 'bg-muted text-muted-foreground',
            )}
          >
            {c.verdict}
          </span>
        )}
      </div>
      {c.issue && <p className="mt-1.5 leading-snug">{c.issue}</p>}
      {c.suggestion && (
        <p className="mt-2 rounded bg-[var(--ins-bg)] px-2 py-1.5 font-write text-[15px] leading-snug text-[var(--ins)]">
          {c.suggestion}
        </p>
      )}
      {fixWarning && <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">⚠ {fixWarning}</p>}
      {c.origin && <p className="mt-2 text-xs text-muted-foreground">{ORIGIN[c.origin]}</p>}
      {open && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {c.suggestion && (
            <Button
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                notes.apply(id);
              }}
            >
              Apply
            </Button>
          )}
          {c.related && (
            <Button
              size="xs"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                notes.showRelated(id);
              }}
            >
              Show the other passage
            </Button>
          )}
          <Button
            size="xs"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              notes.dismiss(id);
            }}
          >
            {c.suggestion ? 'Dismiss' : 'Got it'}
          </Button>
        </div>
      )}
    </div>
  );
});

/** "Reading your draft…" while notes arrive; then "Editor's notes · 4". */
export const NotesSummaryCard = forwardRef<
  HTMLDivElement,
  { summary: NotesSummary; count: number; className?: string }
>(function NotesSummaryCard({ summary, count, className }, ref) {
  const notes = useNotes();
  const reading = summary.state === 'reading';
  const empty = !reading && !count && !summary.text;
  return (
    <div ref={ref} className={cn('rounded-md border bg-card p-3 text-sm shadow-xs', className)}>
      <div className="flex items-center gap-2 font-medium">
        {reading && <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-ai" />}
        <span className="min-w-0 flex-1">
          {reading ? summary.label || 'Reading your draft…' : `${summary.title || 'Editor’s notes'} · ${count}`}
        </span>
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={reading ? 'Stop' : 'Clear notes'}
          title={reading ? 'Stop' : 'Clear notes'}
          onClick={() => (reading ? notes.stop() : notes.clear())}
        >
          <XIcon />
        </Button>
      </div>
      {summary.text ? (
        <p className="mt-1.5 leading-snug text-muted-foreground">{summary.text}</p>
      ) : reading ? (
        <p className="mt-1.5 text-muted-foreground">{summary.waiting || 'An editor is reading it carefully.'}</p>
      ) : null}
      {empty && <p className="mt-1.5 text-muted-foreground">No notes — it reads cleanly.</p>}
    </div>
  );
});
