// Insights: instant, private statistics about the draft — no AI involved —
// and highlights in the text for long sentences, passive voice, adverbs,
// filler and clichés.

import { countByKind, type HighlightKind, headings, highlights, stats } from '@margin/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePage } from '../editor-ref.tsx';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Label } from './ui/label.tsx';
import { Switch } from './ui/switch.tsx';

export const KINDS: [HighlightKind, string][] = [
  ['vlong', 'Very long sentences'],
  ['long', 'Long sentences'],
  ['passive', 'Passive voice'],
  ['adverb', 'Adverbs'],
  ['weak', 'Filler & weak words'],
  ['cliche', 'Clichés & AI-isms'],
];

export interface HighlightState {
  on: boolean;
  kinds: ReadonlySet<HighlightKind>;
  setOn(on: boolean): void;
  toggle(kind: HighlightKind): void;
}

const REFRESH_MS = 300;

/** The text, kept fresh a moment after each edit. */
function useLiveText(): string {
  const page = usePage();
  const { current } = useLibrary();
  const [text, setText] = useState(() => page.editor.current?.getText() ?? '');
  // biome-ignore lint/correctness/useExhaustiveDependencies: read the text again when another article opens.
  useEffect(() => {
    setText(page.editor.current?.getText() ?? '');
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = page.on('update', (u) => {
      if (!u.docChanged) return;
      clearTimeout(t);
      t = setTimeout(() => setText(page.editor.current?.getText() ?? ''), REFRESH_MS);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, [page, current?.id]);
  return text;
}

/** Which highlights show in the text; kept up to date while the writer edits. */
export function useHighlights(): HighlightState {
  const page = usePage();
  const text = useLiveText();
  const [on, setOn] = useState(false);
  const [kinds, setKinds] = useState<ReadonlySet<HighlightKind>>(() => new Set(KINDS.map(([k]) => k)));

  useEffect(() => {
    page.editor.current?.setAnalysis(on ? highlights(text).filter((r) => kinds.has(r.kind)) : []);
  }, [page, text, on, kinds]);

  const toggle = useCallback((kind: HighlightKind) => {
    setOn(true);
    setKinds((k) => {
      const next = new Set(k);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  }, []);

  return useMemo(() => ({ on, kinds, setOn, toggle }), [on, kinds, toggle]);
}

export function Insights({ highlight }: { highlight: HighlightState }) {
  const page = usePage();
  const text = useLiveText();
  const s = useMemo(() => stats(text), [text]);
  const counts = useMemo(() => countByKind(highlights(text)), [text]);
  const toc = useMemo(() => headings(text), [text]);

  const tiles: [string, string][] = [
    [s.words.toLocaleString(), 'words'],
    [String(s.readingMinutes), 'min read'],
    [String(s.avgSentence), 'words / sentence'],
    [String(s.sentences), 'sentences'],
    [String(s.paragraphs), 'paragraphs'],
    [s.characters.toLocaleString(), 'characters'],
  ];

  const jump = (pos: number) => {
    const ed = page.editor.current;
    if (!ed) return;
    ed.setSelection(pos);
    ed.scrollTo(pos);
    ed.focus();
  };

  return (
    <div className="grid gap-6 text-sm">
      <p className="text-muted-foreground">Instant, and private — no AI involved.</p>

      <div className="grid grid-cols-3 gap-2">
        {tiles.map(([value, label]) => (
          <div key={label} className="rounded-md border bg-card px-2 py-2.5 text-center">
            <div className="text-lg font-semibold tabular-nums">{value}</div>
            <div className="text-xs text-muted-foreground">{label}</div>
          </div>
        ))}
      </div>

      <div>
        <p className="font-medium">{s.label}</p>
        {s.words > 20 && (
          <p className="mt-1 text-muted-foreground">
            Reading grade {s.grade} · Flesch reading ease {s.ease}. Most published articles aim for grade 8–10.
          </p>
        )}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="highlights-on" className="font-medium">
            Highlight in your text
          </Label>
          <Switch id="highlights-on" checked={highlight.on} onCheckedChange={highlight.setOn} />
        </div>
        <ul className="grid gap-1">
          {KINDS.map(([kind, label]) => (
            <li key={kind}>
              <button
                type="button"
                aria-pressed={highlight.on && highlight.kinds.has(kind)}
                onClick={() => highlight.toggle(kind)}
                className={cn(
                  'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-accent',
                  !(highlight.on && highlight.kinds.has(kind)) && 'text-muted-foreground',
                )}
              >
                <span className={cn('cm-an inline-block h-3.5 w-6 shrink-0 rounded-sm border', `cm-an-${kind}`)} />
                <span className="flex-1">{label}</span>
                <span className="tabular-nums text-muted-foreground">{counts[kind] ?? 0}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {toc.length > 0 && (
        <div className="grid gap-1">
          <p className="font-medium">Structure</p>
          <ul className="grid">
            {toc.map((h) => (
              <li key={`${h.pos}`}>
                <button
                  type="button"
                  onClick={() => jump(h.pos)}
                  className={cn(
                    'w-full truncate rounded-md px-2 py-1 text-left hover:bg-accent',
                    h.level >= 3 && 'pl-6',
                  )}
                >
                  {h.text}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
