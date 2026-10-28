// The guide's card beside the page: the frame to complete, the question it
// answers, the coach's reply, and Why this?, Skip and Stop. It stays put
// while the author types, so the frame is still readable once the grey
// text at the cursor has gone. Before a guide starts, the same card offers
// a template the mode suggests.

import { BLANK, type Frame } from '@clearpen/core';
import { XIcon } from 'lucide-react';
import { useState } from 'react';
import { useGuide } from '../guide.tsx';
import { cn } from '../lib/utils.ts';
import { Button } from './ui/button.tsx';

/** "I feel ___ today." with the blank drawn as a gap. */
export function FrameText({ frame }: { frame: Frame }) {
  const [before, after] = frame.text.split(BLANK);
  return (
    <p className="font-write text-[16px] leading-snug">
      {before}
      <span aria-hidden className="mx-0.5 inline-block w-10 border-b border-foreground/40 align-baseline" />
      <span className="sr-only">(blank)</span>
      {after}
    </p>
  );
}

export function GuideCard({ placement }: { placement: 'margin' | 'floating' }) {
  const g = useGuide();
  const box = cn(
    'rounded-md border border-l-[3px] border-l-ai bg-card p-3 text-sm shadow-xs',
    placement === 'margin' ? 'sticky top-14 z-10 mb-4' : 'fixed right-4 bottom-16 z-30 w-[300px] shadow-md',
  );
  if (g.offer) {
    const t = g.offer;
    return (
      <aside aria-label="Guide" className={box}>
        <p className="font-medium">Start with {t.label.toLowerCase()}?</p>
        <p className="mt-1 text-muted-foreground">{t.hint}</p>
        <div className="mt-2.5 flex gap-1.5">
          <Button size="xs" onClick={() => g.start(t.id)}>
            Start
          </Button>
          <Button size="xs" variant="ghost" onClick={g.declineOffer}>
            Just write
          </Button>
        </div>
      </aside>
    );
  }
  if (!g.template) return null;
  const t = g.template;
  const n = t.frames.length;
  const frame = t.frames[g.step];
  if (!frame) {
    return (
      <aside aria-label="Guide" className={box}>
        <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          <span className="min-w-0 flex-1">
            {t.label} · {n} of {n}
          </span>
          <Button size="icon-xs" variant="ghost" aria-label="Close" title="Close" onClick={g.stop}>
            <XIcon />
          </Button>
        </div>
        <p className="mt-1.5 leading-snug">{t.done}</p>
        {g.complete && <p className="mt-1 text-xs text-ai">¶ point made</p>}
      </aside>
    );
  }
  return <Step key={`${t.id}:${g.step}`} frame={frame} label={`${t.label} · ${g.step + 1} of ${n}`} className={box} />;
}

function Step({ frame, label, className }: { frame: Frame; label: string; className: string }) {
  const g = useGuide();
  const [why, setWhy] = useState(false);
  return (
    <aside aria-label="Guide" className={className}>
      <div className="flex items-center gap-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
        <span className="min-w-0 flex-1 truncate">{label}</span>
        <Button size="icon-xs" variant="ghost" aria-label="Stop" title="Stop the frames" onClick={g.stop}>
          <XIcon />
        </Button>
      </div>
      <div className="mt-1.5">
        <FrameText frame={frame} />
      </div>
      <p className="mt-1.5 leading-snug text-muted-foreground">{g.said?.next || frame.ask}</p>
      {g.said?.missing && (
        <p className="mt-2 flex gap-1.5 leading-snug">
          <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-ai" />
          <span>{g.said.missing}</span>
        </p>
      )}
      {g.thinking && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden className="size-1.5 shrink-0 animate-pulse rounded-full bg-ai" />
          Listening…
        </p>
      )}
      {why && (
        <p className="mt-2 rounded bg-muted px-2 py-1.5 text-xs leading-snug text-muted-foreground">{frame.why}</p>
      )}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button size="xs" variant="outline" aria-pressed={why} onClick={() => setWhy((w) => !w)}>
          Why this?
        </Button>
        <Button size="xs" variant="ghost" onClick={g.skip}>
          Skip
        </Button>
      </div>
    </aside>
  );
}
