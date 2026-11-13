// The integrated terminal: a panel of tabs at the bottom of the window, each a
// real shell on this computer. The desktop backend owns the pseudo-terminal;
// xterm.js draws it and sends every keystroke back. "AI Runner" opens a tab in
// a folder the writer chooses and starts opencode there.
//
// Tabs stay alive while the panel is hidden, so closing the panel is not the
// same as ending a shell. Closing a tab (or the window) ends it.

import '@xterm/xterm/css/xterm.css';
import { FitAddon } from '@xterm/addon-fit';
import { WebglAddon } from '@xterm/addon-webgl';
import { Terminal } from '@xterm/xterm';
import { BotIcon, ChevronDownIcon, PlusIcon, TerminalIcon, XIcon } from 'lucide-react';
import {
  forwardRef,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { TerminalSession } from '../backend.ts';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { useTheme } from '../theme.tsx';
import { Button } from './ui/button.tsx';

export type TerminalKind = 'shell' | 'ai';

export interface TerminalPanelRef {
  /** Opens a new tab: a plain shell, or opencode in a chosen folder. */
  create(kind: TerminalKind): void;
}

interface Tab {
  id: string;
  kind: TerminalKind;
  title: string;
  cwd?: string;
  command?: string;
}

const MIN_HEIGHT = 160;

/** xterm needs literal colours, not the app's CSS variables. These are the editor's palette. */
function themeOf(resolved: 'light' | 'dark') {
  return resolved === 'dark'
    ? {
        background: '#1c1b18',
        foreground: '#ece8df',
        cursor: '#ef6a4f',
        cursorAccent: '#1c1b18',
        selectionBackground: 'rgba(157, 140, 255, 0.28)',
        black: '#1c1b18',
        red: '#f08e80',
        green: '#7fd6a0',
        yellow: '#e0a948',
        blue: '#6f9ff5',
        magenta: '#da77f2',
        cyan: '#3cc1b8',
        white: '#ece8df',
        brightBlack: '#6e6a62',
        brightRed: '#ffb3a8',
        brightGreen: '#a8ebbe',
        brightYellow: '#f1c97a',
        brightBlue: '#9bbcff',
        brightMagenta: '#e8a6fa',
        brightCyan: '#76ddd5',
        brightWhite: '#ffffff',
      }
    : {
        background: '#ffffff',
        foreground: '#1d1c1a',
        cursor: '#d6452b',
        cursorAccent: '#ffffff',
        selectionBackground: 'rgba(102, 80, 224, 0.2)',
        black: '#1d1c1a',
        red: '#b4372a',
        green: '#17703f',
        yellow: '#b7791f',
        blue: '#2f6fde',
        magenta: '#9c36b5',
        cyan: '#0f8f87',
        white: '#e9e5dc',
        brightBlack: '#7a766d',
        brightRed: '#d6452b',
        brightGreen: '#2b8a3e',
        brightYellow: '#d9a441',
        brightBlue: '#4f86f0',
        brightMagenta: '#b84fd0',
        brightCyan: '#17a69c',
        brightWhite: '#faf9f6',
      };
}

function TerminalView({ tab, active, open }: { tab: Tab; active: boolean; open: boolean }) {
  const { backend } = useLibrary();
  const { resolved } = useTheme();
  const host = useRef<HTMLDivElement>(null);
  const term = useRef<Terminal | null>(null);
  const fit = useRef<FitAddon | null>(null);
  const session = useRef<TerminalSession | null>(null);

  // One terminal per tab: its id is the lifecycle. The theme, the panel and
  // the tab's process outlive each other, so they aren't dependencies.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the shell outlives a theme, tab or panel change.
  useEffect(() => {
    const service = backend.terminal;
    const el = host.current;
    if (!service || !el) return;

    let cancelled = false;
    let frame = 0;
    let observer: ResizeObserver | null = null;
    let webgl: WebglAddon | null = null;

    const terminal = new Terminal({
      cursorBlink: true,
      fontFamily: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: themeOf(resolved),
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(el);
    // WebGL is quicker on long output, but some drivers refuse it; the canvas
    // renderer xterm falls back to is fine.
    try {
      webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl?.dispose();
        webgl = null;
      });
      terminal.loadAddon(webgl);
    } catch {
      webgl = null;
    }

    term.current = terminal;
    fit.current = fitAddon;

    const refit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (cancelled || !el.clientWidth || !el.clientHeight) return;
        try {
          fitAddon.fit();
        } catch {
          // The panel is hidden mid-measure; the next resize fits it.
        }
      });
    };

    const input = terminal.onData((data) => session.current?.write(data));
    const resized = terminal.onResize(({ cols, rows }) => session.current?.resize(cols, rows));

    refit();
    void (async () => {
      try {
        const opened = await service.open({
          cols: Math.max(terminal.cols, 2),
          rows: Math.max(terminal.rows, 2),
          ...(tab.cwd ? { cwd: tab.cwd } : {}),
          ...(tab.command ? { command: tab.command } : {}),
          onData: (data) => {
            if (!cancelled) terminal.write(data);
          },
          onExit: () => {
            if (!cancelled) {
              terminal.write('\r\n\x1b[2m[the process ended — close this tab or open another]\x1b[0m\r\n');
            }
          },
        });
        if (cancelled) {
          opened.close();
          return;
        }
        session.current = opened;
        try {
          fitAddon.fit();
        } catch {
          // Hidden mid-measure; the observer fits it when it is shown.
        }
        opened.resize(terminal.cols, terminal.rows);
        if (active && open) terminal.focus();
      } catch (err) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          terminal.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`);
        }
      }
    })();

    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(refit);
      observer.observe(el);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      input.dispose();
      resized.dispose();
      session.current?.close();
      session.current = null;
      webgl?.dispose();
      terminal.dispose();
      term.current = null;
      fit.current = null;
    };
  }, [backend, tab.id]);

  useEffect(() => {
    if (term.current) term.current.options.theme = themeOf(resolved);
  }, [resolved]);

  // Coming back to a tab, or reopening the panel, needs a measure and a cursor.
  useEffect(() => {
    if (!active || !open) return;
    const id = requestAnimationFrame(() => {
      try {
        fit.current?.fit();
      } catch {
        // The panel is still settling; the observer will fit it.
      }
      term.current?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [active, open]);

  return <div ref={host} className="h-full w-full px-2 py-1" />;
}

export const TerminalPanel = forwardRef<TerminalPanelRef, { open: boolean; onClose(): void }>(function TerminalPanel(
  { open, onClose },
  ref,
) {
  const { backend } = useLibrary();
  const service = backend.terminal;
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [height, setHeight] = useState(() => Math.max(MIN_HEIGHT, Math.min(300, Math.round(window.innerHeight / 3))));
  const drag = useRef<{ y: number; height: number } | null>(null);
  const count = useRef(0);

  const create = useCallback(
    async (kind: TerminalKind) => {
      if (!service) return;
      let cwd: string | undefined;
      if (kind === 'ai') {
        if (service.chooseFolder) {
          const chosen = await service.chooseFolder();
          if (!chosen) return;
          cwd = chosen;
        } else {
          cwd = await service.defaultCwd().catch(() => undefined);
        }
      } else {
        cwd = await service.defaultCwd().catch(() => undefined);
      }
      count.current += 1;
      const id = `term-${Date.now()}-${count.current}`;
      setTabs((list) => [
        ...list,
        {
          id,
          kind,
          title: kind === 'ai' ? 'opencode' : `Terminal ${count.current}`,
          ...(cwd ? { cwd } : {}),
          ...(kind === 'ai' ? { command: 'opencode' } : {}),
        },
      ]);
      setActive(id);
    },
    [service],
  );

  useImperativeHandle(ref, () => ({ create: (kind) => void create(kind) }), [create]);

  const closeTab = useCallback(
    (id: string) => {
      const index = tabs.findIndex((tab) => tab.id === id);
      const rest = tabs.filter((tab) => tab.id !== id);
      setTabs(rest);
      setActive((current) => (current === id ? (rest[Math.min(index, rest.length - 1)]?.id ?? null) : current));
    },
    [tabs],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { y: e.clientY, height };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = drag.current.height + (drag.current.y - e.clientY);
    setHeight(Math.max(MIN_HEIGHT, Math.min(next, Math.round(window.innerHeight * 0.8))));
  };
  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <section
      aria-label="Terminal"
      className={cn('flex shrink-0 flex-col border-t bg-background', !open && 'hidden')}
      style={{ height, maxHeight: 'min(80svh, calc(100svh - 160px))' }}
    >
      <hr
        aria-label="Resize the terminal"
        className="m-0 h-1 shrink-0 cursor-row-resize border-0 bg-transparent hover:bg-border"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
      <div className="flex h-9 shrink-0 items-center gap-1 border-b px-2">
        <div
          role="tablist"
          aria-label="Terminal tabs"
          className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              role="tab"
              aria-selected={tab.id === active}
              tabIndex={tab.id === active ? 0 : -1}
              className={cn(
                'group flex h-7 max-w-52 shrink-0 cursor-default items-center gap-1.5 rounded-md px-2 text-xs',
                tab.id === active
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
              onClick={() => setActive(tab.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setActive(tab.id);
              }}
            >
              {tab.kind === 'ai' ? (
                <BotIcon className="size-3.5 shrink-0 text-[var(--ai)]" />
              ) : (
                <TerminalIcon className="size-3.5 shrink-0" />
              )}
              <span className="truncate">{tab.title}</span>
              <button
                type="button"
                aria-label={`Close ${tab.title}`}
                className="grid size-4 shrink-0 place-items-center rounded-sm text-muted-foreground opacity-60 hover:bg-background hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
              >
                <XIcon className="size-3" />
              </button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="New terminal"
          title="New terminal"
          onClick={() => void create('shell')}
        >
          <PlusIcon />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs"
          title="Run opencode in a folder you choose"
          onClick={() => void create('ai')}
        >
          <BotIcon />
          <span className="max-sm:hidden">AI Runner</span>
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Hide the terminal"
          title="Hide the terminal"
          onClick={onClose}
        >
          <ChevronDownIcon />
        </Button>
      </div>
      <div className="relative min-h-0 flex-1 bg-background">
        {!service && (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-muted-foreground">
            The integrated terminal runs in the desktop app.
          </div>
        )}
        {service && tabs.length === 0 && (
          <div className="grid h-full place-items-center px-6 text-center">
            <div className="space-y-3">
              <TerminalIcon className="mx-auto size-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Run a shell, or opencode, without leaving Clearpen.</p>
              <div className="flex justify-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void create('shell')}>
                  <TerminalIcon />
                  New terminal
                </Button>
                <Button size="sm" onClick={() => void create('ai')}>
                  <BotIcon />
                  Run opencode
                </Button>
              </div>
            </div>
          </div>
        )}
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={cn('absolute inset-0', (tab.id !== active || !open) && 'invisible')}
            aria-hidden={tab.id !== active}
          >
            <TerminalView tab={tab} active={tab.id === active} open={open} />
          </div>
        ))}
      </div>
    </section>
  );
});
