// Whether a model is ready, checked now, every minute and whenever the
// choice of models changes. Click it to choose models.

import type { LLMStatus } from '@clearpen/core';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { useSettings } from '../settings.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.tsx';

const POLL_MS = 60_000;

export function ModelStatus({ onOpen }: { onOpen(): void }) {
  const { backend } = useLibrary();
  const { settings } = useSettings();
  const [status, setStatus] = useState<LLMStatus | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: check again when the writer picks other models.
  useEffect(() => {
    let live = true;
    const check = () =>
      backend.ai
        .status()
        .then((s) => live && setStatus(s))
        .catch(() => {});
    check();
    const t = setInterval(check, POLL_MS);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [backend, settings.models]);

  const label = !status ? 'Looking for a model…' : status.ok ? status.roles.quick : status.error || 'No model';
  const detail = !status
    ? ''
    : status.ok
      ? `${status.provider === 'ollama' ? 'Ollama' : status.provider} at ${status.baseUrl} · ${status.models.length} model${status.models.length === 1 ? '' : 's'} installed`
      : 'Clearpen’s AI features need a model. Install Ollama from ollama.com and pull one, for example qwen3:8b.';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onOpen}
          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent"
          aria-label={`Models: ${label}`}
        >
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              !status ? 'bg-faint' : status.ok ? 'bg-[var(--ins)]' : 'bg-destructive',
            )}
          />
          <span className="truncate">{label}</span>
        </button>
      </TooltipTrigger>
      {detail && <TooltipContent side="top">{detail}</TooltipContent>}
    </Tooltip>
  );
}
