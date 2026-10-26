// One AI task at a time. `run` shows what's happening, lets Esc stop it, and
// reports a failure in words; the task itself reports what it found.

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useStatus } from './status.tsx';

interface AIValue {
  busy: boolean;
  /** Runs `task`, showing `doing` until it reports something itself. */
  run(doing: string, task: (signal: AbortSignal) => Promise<void>): Promise<void>;
  stop(): void;
}

const AIContext = createContext<AIValue | null>(null);

const aborted = (err: unknown, signal: AbortSignal) =>
  signal.aborted || (err instanceof Error && err.name === 'AbortError');

export function AIProvider({ children }: { children: ReactNode }) {
  const status = useStatus();
  const [busy, setBusy] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const stop = useCallback(() => ctrl.current?.abort(), []);

  const run = useCallback(
    async (doing: string, task: (signal: AbortSignal) => Promise<void>) => {
      if (ctrl.current) {
        status.show('Wait for the current AI task to finish.');
        return;
      }
      const c = new AbortController();
      ctrl.current = c;
      setBusy(true);
      const id = status.show({ text: `${doing}…`, busy: true, keys: ['Esc'] });
      try {
        await task(c.signal);
        // The task didn't say anything: it's done, so stop pulsing.
        status.clear(id);
      } catch (err) {
        if (aborted(err, c.signal)) status.show({ text: 'Stopped', ms: 1500 });
        else {
          status.clear(id);
          toast.error(err instanceof Error ? err.message : String(err));
        }
      } finally {
        ctrl.current = null;
        setBusy(false);
      }
    },
    [status],
  );

  // Esc stops the running task, unless something else (the editor, a dialog) used it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || !ctrl.current) return;
      e.preventDefault();
      stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stop]);

  const value = useMemo(() => ({ busy, run, stop }), [busy, run, stop]);
  return <AIContext.Provider value={value}>{children}</AIContext.Provider>;
}

export function useAI(): AIValue {
  const v = useContext(AIContext);
  if (!v) throw new Error('useAI needs an AIProvider');
  return v;
}
