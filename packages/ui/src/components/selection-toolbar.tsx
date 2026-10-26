// The bar over a selection: Improve, Shorten, Simplify, Fix grammar, a change
// of tone, or an instruction in your own words. It appears a moment after
// the mouse lets go, sits above the selection (below it near the top of the
// window), and keeps the editor's selection while you use it.

import { intentOf, type Lens, type RewriteAction } from '@clearpen/core';
import { ChevronDownIcon, SparklesIcon } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAI } from '../ai.tsx';
import { REWRITE_ACTIONS, type Span, TONES, useEditActions } from '../edit-actions.ts';
import { usePage } from '../editor-ref.tsx';
import { LENSES } from '../review-actions.ts';
import { useStatus } from '../status.tsx';
import { Button } from './ui/button.tsx';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from './ui/dropdown-menu.tsx';
import { Input } from './ui/input.tsx';
import { Separator } from './ui/separator.tsx';

const SHOW_AFTER_MS = 180;

export function SelectionToolbar({ mod, check }: { mod: string; check(span: Span, lens: Lens): void }) {
  const page = usePage();
  const ai = useAI();
  const status = useStatus();
  const { rewrite, editWith } = useEditActions(mod);
  const bar = useRef<HTMLDivElement>(null);
  const [span, setSpan] = useState<Span | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [instruction, setInstruction] = useState('');
  const menuOpen = useRef(false);
  const mouseDown = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const busy = useRef(ai.busy);
  busy.current = ai.busy;

  const inBar = useCallback(() => !!bar.current?.contains(document.activeElement), []);

  const hide = useCallback(() => {
    clearTimeout(timer.current);
    setSpan(null);
    setPos(null);
  }, []);

  const maybeShow = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const ed = page.editor.current;
      if (!ed || mouseDown.current || busy.current) return;
      const sel = ed.getSelection();
      if (sel.empty || sel.text.trim().length < 2 || !ed.view.hasFocus) {
        if (!inBar() && !menuOpen.current) hide();
        return;
      }
      setInstruction('');
      setSpan({ from: sel.from, to: sel.to });
    }, SHOW_AFTER_MS);
  }, [page, hide, inBar]);

  // Follow the editor's selection and the mouse.
  useEffect(() => {
    const off = page.on('update', (u) => {
      if (!u.selectionSet && !u.docChanged && !u.focusChanged) return;
      const ed = page.editor.current;
      if (ed?.getSelection().empty && !inBar() && !menuOpen.current) hide();
      else maybeShow();
    });
    const dom = page.editor.current?.view.dom;
    const down = () => {
      mouseDown.current = true;
      hide();
    };
    const up = () => {
      if (!mouseDown.current) return;
      mouseDown.current = false;
      maybeShow();
    };
    dom?.addEventListener('mousedown', down);
    window.addEventListener('mouseup', up);
    return () => {
      off();
      dom?.removeEventListener('mousedown', down);
      window.removeEventListener('mouseup', up);
      clearTimeout(timer.current);
    };
  }, [page, hide, maybeShow, inBar]);

  // Out of the way while the AI works.
  useEffect(() => {
    if (ai.busy) hide();
  }, [ai.busy, hide]);

  // Above the selection, centred on it when it's on one line.
  const place = useCallback(() => {
    const ed = page.editor.current;
    const el = bar.current;
    if (!ed || !el || !span) return;
    // Where the selection is on screen; when that can't be measured (it's
    // scrolled out of view), the top of the editor.
    const box = ed.view.dom.getBoundingClientRect();
    const fallback = { top: box.top, bottom: box.top, left: box.left, right: box.left };
    const a = ed.coordsAt(span.from, 1) ?? fallback;
    const b = ed.coordsAt(span.to, -1) ?? fallback;
    const { width, height } = el.getBoundingClientRect();
    const sameLine = Math.abs(a.top - b.top) < 4;
    const mid = sameLine ? (a.left + b.right) / 2 : a.left + 160;
    const left = Math.max(12, Math.min(Math.round(mid - width / 2), window.innerWidth - width - 12));
    let top = Math.round(a.top - height - 10);
    if (top < 60) top = Math.round(b.bottom + 10);
    setPos({ left, top });
  }, [page, span]);

  useLayoutEffect(() => {
    if (!span) return;
    place();
    const again = () => place();
    window.addEventListener('scroll', again, true);
    window.addEventListener('resize', again);
    return () => {
      window.removeEventListener('scroll', again, true);
      window.removeEventListener('resize', again);
    };
  }, [span, place]);

  if (!span) return null;

  const act = (action: RewriteAction) => {
    const s = span;
    hide();
    rewrite(s, action);
  };

  return (
    <div
      ref={bar}
      role="toolbar"
      aria-label="Edit the selection"
      className="fixed z-30 flex max-w-[calc(100vw-24px)] flex-wrap items-center gap-0.5 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg animate-in fade-in-0 zoom-in-95"
      style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden', left: 0, top: 0 }}
      // Keep the editor's selection when clicking a button; the input may take focus.
      onMouseDown={(e) => {
        if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
      }}
    >
      {(Object.entries(REWRITE_ACTIONS) as [RewriteAction, string][]).map(([action, label]) => (
        <Button key={action} size="sm" variant="ghost" onClick={() => act(action)}>
          {label}
        </Button>
      ))}
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          menuOpen.current = open;
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            Check <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          {(Object.entries(LENSES) as [Lens, (typeof LENSES)[Lens]][]).map(([lens, l]) => (
            <DropdownMenuItem
              key={lens}
              className="flex-col items-start gap-0"
              onSelect={() => {
                const s = span;
                hide();
                check(s, lens);
              }}
            >
              <span>{l.label}</span>
              <span className="text-xs text-muted-foreground">{l.hint}</span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu
        modal={false}
        onOpenChange={(open) => {
          menuOpen.current = open;
        }}
      >
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            Tone <ChevronDownIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={(e) => e.preventDefault()}>
          {(Object.entries(TONES) as [RewriteAction, string][]).map(([action, label]) => (
            <DropdownMenuItem key={action} onSelect={() => act(action)}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Separator orientation="vertical" className="mx-1 h-5" />
      <form
        className="flex items-center"
        onSubmit={(e) => {
          e.preventDefault();
          const what = instruction.trim();
          if (!what) return;
          const s = span;
          hide();
          // "Fact-check it" or "is this right?" want a verdict, not an edit.
          const intent = intentOf(what);
          if (intent === 'ask')
            status.show({ text: 'Questions about a passage come with Ask, in a later update.', ms: 5000 });
          else if (intent) check(s, intent);
          else editWith(s, what);
        }}
      >
        <SparklesIcon className="ml-1.5 size-3.5 shrink-0 text-ai" aria-hidden />
        <Input
          id="selection-instruction"
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              hide();
              page.editor.current?.focus();
            }
          }}
          placeholder="Ask AI to…"
          aria-label="Ask AI to change the selection"
          className="h-8 w-48 border-0 bg-transparent shadow-none focus-visible:ring-0 dark:bg-transparent"
        />
      </form>
    </div>
  );
}
