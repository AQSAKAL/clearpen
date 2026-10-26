// The status pill at the bottom of the window: what the AI is doing, what it
// suggested (with Accept all / Reject all), and short confirmations. One
// message at a time; a new one replaces the last.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from './components/ui/button.tsx';
import { Kbd } from './components/ui/kbd.tsx';
import { cn } from './lib/utils.ts';

export interface StatusAction {
  label: string;
  onClick(): void;
  primary?: boolean;
}

export interface StatusMessage {
  text: ReactNode;
  /** Shows a pulse; stays until replaced. */
  busy?: boolean;
  /** Hides after this long (ms). Messages without `busy` or `sticky` default to 3 s. */
  ms?: number;
  /** Stays until replaced or cleared. */
  sticky?: boolean;
  actions?: StatusAction[];
  /** Keyboard hints shown after the text, such as ['⌘↵', 'Esc']. */
  keys?: string[];
  warning?: boolean;
}

interface StatusValue {
  /** Shows a message; returns its id, for `clear(id)`. */
  show(message: StatusMessage | string): number;
  /** Clears the message — only if it's still message `id`, when given. */
  clear(id?: number): void;
}

const StatusContext = createContext<StatusValue | null>(null);

export function StatusProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<(StatusMessage & { id: number }) | null>(null);
  const seq = useRef(0);
  const current = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const clear = useCallback((id?: number) => {
    if (id !== undefined && id !== current.current) return;
    clearTimeout(timer.current);
    current.current = 0;
    setMessage(null);
  }, []);

  const show = useCallback(
    (m: StatusMessage | string) => {
      const msg = typeof m === 'string' ? { text: m } : m;
      const id = ++seq.current;
      current.current = id;
      clearTimeout(timer.current);
      setMessage({ ...msg, id });
      const ms = msg.ms ?? (msg.busy || msg.sticky ? 0 : 3000);
      if (ms) timer.current = setTimeout(() => clear(id), ms);
      return id;
    },
    [clear],
  );

  useEffect(() => () => clearTimeout(timer.current), []);
  const value = useMemo(() => ({ show, clear }), [show, clear]);

  return (
    <StatusContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4"
        style={{ bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))' }}
      >
        <div role="status" aria-live="polite" className="contents">
          {message && (
            <div
              key={message.id}
              className={cn(
                'pointer-events-auto flex max-w-full flex-wrap items-center gap-x-2 gap-y-1 rounded-full border bg-popover px-4 py-2 text-sm text-popover-foreground shadow-lg animate-in fade-in-0 slide-in-from-bottom-2',
                message.warning && 'border-amber-500/40',
              )}
            >
              {message.busy && <span aria-hidden className="size-2 shrink-0 animate-pulse rounded-full bg-ai" />}
              <span className="min-w-0">{message.text}</span>
              {message.actions?.map((a) => (
                <Button
                  key={a.label}
                  size="xs"
                  variant={a.primary ? 'default' : 'ghost'}
                  onClick={a.onClick}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  {a.label}
                </Button>
              ))}
              {message.keys && (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {message.keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </StatusContext.Provider>
  );
}

export function useStatus(): StatusValue {
  const v = useContext(StatusContext);
  if (!v) throw new Error('useStatus needs a StatusProvider');
  return v;
}
