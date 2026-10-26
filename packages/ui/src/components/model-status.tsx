// Whether a model is ready, checked now and every minute. The models dialog
// (choosing a model per role) comes with the AI features.

import type { LLMStatus } from '@margin/core';
import { useEffect, useState } from 'react';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip.tsx';

const POLL_MS = 60_000;

export function ModelStatus() {
  const { backend } = useLibrary();
  const [status, setStatus] = useState<LLMStatus | null>(null);

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
  }, [backend]);

  const label = !status ? 'Looking for a model…' : status.ok ? status.roles.quick : status.error || 'No model';
  const detail = !status
    ? ''
    : status.ok
      ? `${status.provider === 'ollama' ? 'Ollama' : status.provider} at ${status.baseUrl} · ${status.models.length} model${status.models.length === 1 ? '' : 's'} installed`
      : 'Margin’s AI features need a model. Install Ollama from ollama.com and pull one, for example qwen3:8b.';

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-muted-foreground" role="status">
          <span
            aria-hidden
            className={cn(
              'size-2 shrink-0 rounded-full',
              !status ? 'bg-faint' : status.ok ? 'bg-[var(--ins)]' : 'bg-destructive',
            )}
          />
          <span className="truncate">{label}</span>
        </div>
      </TooltipTrigger>
      {detail && <TooltipContent side="top">{detail}</TooltipContent>}
    </Tooltip>
  );
}
