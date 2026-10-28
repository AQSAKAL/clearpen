// Insights: instant, private statistics about the draft — no AI involved —
// highlights in the text for long sentences, passive voice, adverbs, filler
// and clichés, what kind of piece this is, the skeleton: each sentence by its
// opening words and its verb, and the terms: each thing the draft defines,
// with every name used for it.

import {
  briefForMode,
  countByKind,
  type HighlightKind,
  headings,
  highlights,
  isModeId,
  MODE,
  MODE_GROUPS,
  type ModeId,
  modeOf,
  skeleton,
  stats,
  TEMPLATES,
  type TermSource,
  terms,
} from '@clearpen/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePage } from '../editor-ref.tsx';
import { useGuide } from '../guide.tsx';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Label } from './ui/label.tsx';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from './ui/select.tsx';
import { Switch } from './ui/switch.tsx';

export const KINDS: [HighlightKind, string][] = [
  ['vlong', 'Very long sentences'],
  ['long', 'Long sentences'],
  ['passive', 'Passive voice'],
  ['adverb', 'Adverbs'],
  ['weak', 'Filler & weak words'],
  ['cliche', 'Clichés & AI-isms'],
];

/** How a term came to be defined, as the Terms list says it. */
const TERM_SOURCES: Record<TermSource, string> = {
  initials: 'initials',
  called: '“we call”',
  'that-is': '“that is”',
  emphasis: 'bold at first use',
  definition: 'definition',
  cluster: 'several names',
};

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
  const { current, edit } = useLibrary();
  const text = useLiveText();
  const s = useMemo(() => stats(text), [text]);
  const counts = useMemo(() => countByKind(highlights(text)), [text]);
  const toc = useMemo(() => headings(text), [text]);
  const [showSkeleton, setShowSkeleton] = useState(false);
  const bones = useMemo(() => (showSkeleton ? skeleton(text) : []), [text, showSkeleton]);
  const [showTerms, setShowTerms] = useState(false);
  const glossary = useMemo(() => (showTerms ? terms(text) : []), [text, showTerms]);
  const guide = useGuide();
  const mode = modeOf(current?.brief);
  const setMode = (id: ModeId) => {
    if (current) edit({ brief: { ...current.brief, ...briefForMode(id) } });
  };
  // A mode with frames, not yet started on this page: offer to start them at the end of the text.
  const frames = mode.template && !guide.template && !guide.offer ? TEMPLATES[mode.template.id] : null;

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

      <div className="grid gap-1.5">
        <Label htmlFor="mode" className="font-medium">
          What this is
        </Label>
        <Select value={mode.id} onValueChange={(v) => isModeId(v) && setMode(v)}>
          <SelectTrigger id="mode" className="w-full" aria-label="What this is">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {MODE_GROUPS.map(([label, ids]) => (
              <SelectGroup key={label}>
                <SelectLabel>{label}</SelectLabel>
                {ids.map((id) => (
                  <SelectItem key={id} value={id}>
                    {MODE[id].label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <p className="text-muted-foreground">{mode.hint}</p>
        {frames && (
          <div>
            <Button size="xs" variant="outline" onClick={() => guide.start(frames.id)}>
              Start the frames at the end of the text
            </Button>
          </div>
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

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="skeleton-on" className="font-medium">
            Skeleton
          </Label>
          <Switch id="skeleton-on" checked={showSkeleton} onCheckedChange={setShowSkeleton} />
        </div>
        <p className="text-muted-foreground">
          Each sentence by its opening words and its verb. A paragraph reads as a story about whoever keeps opening its
          sentences; a verb shown in grey is “is” or “has”, so the action may be hiding in a noun.
        </p>
        {showSkeleton && (
          <ol className="grid gap-2">
            {bones.map((p, i) => (
              <li key={p.from} className="rounded-md border bg-card px-1.5 py-1.5">
                {p.heading && p.heading !== bones[i - 1]?.heading && (
                  <div className="mb-1 truncate px-1.5 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                    {p.heading}
                  </div>
                )}
                <ul className="grid">
                  {p.sentences.map((x) => (
                    <li key={x.from}>
                      <button
                        type="button"
                        onClick={() => jump(x.from)}
                        className="flex w-full items-baseline gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-accent"
                      >
                        <span className="min-w-0 flex-1 truncate">{x.opener}</span>
                        {x.verb && <span className="shrink-0 text-muted-foreground">{x.verb}</span>}
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{x.words}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="terms-on" className="font-medium">
            Terms
          </Label>
          <Switch id="terms-on" checked={showTerms} onCheckedChange={setShowTerms} />
        </div>
        <p className="text-muted-foreground">
          Each thing the draft defines — initials in brackets, bold at first use, “we call this…” — with every name used
          for it and how often. The same thing keeps the same name; a form in italics is one you never defined.
        </p>
        {showTerms &&
          (glossary.length ? (
            <ol className="grid gap-1">
              {glossary.map((t) => (
                <li key={`${t.source}:${t.first.from}`}>
                  <button
                    type="button"
                    onClick={() => jump(t.first.from)}
                    className="grid w-full gap-0.5 rounded-md px-1.5 py-1 text-left hover:bg-accent"
                  >
                    <span className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{TERM_SOURCES[t.source]}</span>
                    </span>
                    <span className="flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                      {t.names.map((n) => (
                        <span key={n.name} className={cn(n.variant && 'italic')}>
                          {n.name} <span className="tabular-nums">{n.count}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-muted-foreground">
              Nothing defined yet. A term is one the draft introduces: “the data quality service (DQS)”, “we call this
              the stress position”, or a phrase in bold the first time it appears.
            </p>
          ))}
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
