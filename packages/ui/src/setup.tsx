// First-run setup. Clearpen's AI runs on this computer through Ollama, a free
// app. When Ollama isn't there, or has no model yet, this walks the writer
// through both: a link to download Ollama, then a model downloaded right
// here, with its progress. Writing works without any of it, and "Not now"
// leaves it for later — the model status in the sidebar opens it again.

import {
  formatBytes,
  type LLMStatus,
  MODEL_OFFERS,
  type ModelOffer,
  type PullProgress,
  recommendedOffer,
} from '@clearpen/core';
import { CheckIcon, LoaderCircleIcon } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Backend } from './backend.ts';
import { Badge } from './components/ui/badge.tsx';
import { Button } from './components/ui/button.tsx';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './components/ui/dialog.tsx';
import { Label } from './components/ui/label.tsx';
import { Progress } from './components/ui/progress.tsx';
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group.tsx';
import { cn } from './lib/utils.ts';
import { useSettings } from './settings.tsx';

export const OLLAMA_DOWNLOAD = 'https://ollama.com/download';
/** How often setup looks for Ollama while the writer installs it. */
export const SETUP_POLL_MS = 2000;

type Step =
  | { kind: 'checking' }
  | { kind: 'ollama' }
  | { kind: 'choose' }
  | { kind: 'downloading'; offer: ModelOffer; progress: PullProgress | null }
  | { kind: 'ready'; model: string }
  | { kind: 'failed'; offer: ModelOffer; error: string };

interface SetupValue {
  /** Opens setup: where it's needed, or straight at the choice of model. */
  open(at?: 'choose'): void;
  /** The download under way, for the sidebar while the window is closed. */
  downloading: { offer: ModelOffer; fraction: number } | null;
  /** Nothing of the setup is on screen or under way, and the look at launch is done: what comes after it can start. */
  idle: boolean;
}

const SetupContext = createContext<SetupValue | null>(null);

const fraction = (offer: ModelOffer, p: PullProgress | null) =>
  p ? (p.done ? 1 : p.completed / Math.max(p.total, offer.bytes * 0.98)) : 0;

/** Ollama's step, in the writer's words. */
function phase(p: PullProgress | null): string {
  const s = p?.status ?? '';
  if (!p || s === 'pulling manifest') return 'Starting…';
  if (s.startsWith('pulling')) return 'Downloading…';
  if (s.startsWith('verifying')) return 'Checking the download…';
  return 'Finishing…';
}

export function SetupProvider({ backend, children }: { backend: Backend; children: ReactNode }) {
  const { settings, set } = useSettings();
  const [shown, setShown] = useState(false);
  const [step, setStep] = useState<Step>({ kind: 'checking' });
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [memory, setMemory] = useState<number | null>(null);
  // The look at launch has finished (or was never needed), so nothing more opens on its own.
  const [settled, setSettled] = useState(settings.setupSkipped);
  const ctrl = useRef<AbortController | null>(null);
  const live = useRef({ models: settings.models });
  live.current = { models: settings.models };

  const look = useCallback(
    async (at?: 'choose') => {
      const s = await backend.ai.status().catch(() => null);
      setStatus(s);
      if (!s?.reachable) setStep({ kind: 'ollama' });
      else if (s.ok && at !== 'choose') setStep({ kind: 'ready', model: s.roles.quick! });
      else setStep({ kind: 'choose' });
      return s;
    },
    [backend],
  );

  // At launch: no model ready, and the writer hasn't said "not now".
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, at launch.
  useEffect(() => {
    backend
      .memory()
      .then(setMemory)
      .catch(() => {});
    if (settings.setupSkipped) return;
    void look().then((s) => {
      if (s && !s.ok) setShown(true);
      setSettled(true);
    });
  }, [backend]);

  // While the writer installs Ollama, look for it every couple of seconds.
  useEffect(() => {
    if (!shown || step.kind !== 'ollama') return;
    const t = setInterval(() => void look(), SETUP_POLL_MS);
    return () => clearInterval(t);
  }, [shown, step.kind, look]);

  const download = useCallback(
    async (offer: ModelOffer) => {
      if (!backend.ai.pull) return;
      ctrl.current?.abort();
      const c = new AbortController();
      ctrl.current = c;
      setStep({ kind: 'downloading', offer, progress: null });
      try {
        let last: PullProgress | null = null;
        for await (const p of backend.ai.pull(offer.model, { signal: c.signal })) {
          last = p;
          setStep({ kind: 'downloading', offer, progress: p });
        }
        if (!last?.done) throw new Error('The download stopped before it finished.');
        // The model they chose is the one Clearpen writes with.
        const models = { ...live.current.models, quick: offer.model };
        set('models', models);
        backend.ai.setModels(models, { preload: true });
        setStep({ kind: 'ready', model: offer.model });
        setShown(true);
      } catch (err) {
        if (c.signal.aborted) return;
        setStep({ kind: 'failed', offer, error: err instanceof Error ? err.message : String(err) });
        setShown(true);
      } finally {
        if (ctrl.current === c) ctrl.current = null;
      }
    },
    [backend, set],
  );

  const use = useCallback(
    (offer: ModelOffer) => {
      // Already there: just write with it.
      if (status?.models.includes(offer.model)) {
        const models = { ...live.current.models, quick: offer.model };
        set('models', models);
        backend.ai.setModels(models, { preload: true });
        setStep({ kind: 'ready', model: offer.model });
      } else void download(offer);
    },
    [status, backend, set, download],
  );

  const cancel = () => {
    ctrl.current?.abort();
    setStep({ kind: 'choose' });
  };

  const notNow = () => {
    set('setupSkipped', true);
    setShown(false);
  };

  const value = useMemo<SetupValue>(
    () => ({
      open(at) {
        setShown(true);
        if (step.kind === 'downloading') return;
        setStep({ kind: 'checking' });
        void look(at);
      },
      downloading:
        step.kind === 'downloading' ? { offer: step.offer, fraction: fraction(step.offer, step.progress) } : null,
      idle: settled && !shown && step.kind !== 'downloading',
    }),
    [step, look, settled, shown],
  );

  return (
    <SetupContext.Provider value={value}>
      {children}
      <Dialog
        open={shown}
        onOpenChange={(o) => !o && (step.kind === 'ollama' || step.kind === 'choose' ? notNow() : setShown(false))}
      >
        <DialogContent className="sm:max-w-md" onInteractOutside={(e) => e.preventDefault()}>
          <SetupBody
            step={step}
            status={status}
            memory={memory}
            platform={backend.platform}
            onDownloadOllama={() => void backend.openLink(OLLAMA_DOWNLOAD)}
            onUse={use}
            onCancel={cancel}
            onNotNow={notNow}
            onHide={() => setShown(false)}
            canPull={!!backend.ai.pull}
          />
        </DialogContent>
      </Dialog>
    </SetupContext.Provider>
  );
}

export function useSetup(): SetupValue {
  const v = useContext(SetupContext);
  if (!v) throw new Error('useSetup needs a SetupProvider');
  return v;
}

function SetupBody({
  step,
  status,
  memory,
  platform,
  onDownloadOllama,
  onUse,
  onCancel,
  onNotNow,
  onHide,
  canPull,
}: {
  step: Step;
  status: LLMStatus | null;
  memory: number | null;
  platform: Backend['platform'];
  onDownloadOllama(): void;
  onUse(offer: ModelOffer): void;
  onCancel(): void;
  onNotNow(): void;
  onHide(): void;
  canPull: boolean;
}) {
  const computer = platform === 'mac' ? 'Mac' : 'computer';
  const recommended = recommendedOffer(memory);
  const [choice, setChoice] = useState(recommended.model);
  useEffect(() => setChoice(recommended.model), [recommended.model]);

  if (step.kind === 'checking') {
    return (
      <DialogHeader>
        <DialogTitle>Set up Clearpen’s AI</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <LoaderCircleIcon className="size-4 animate-spin" /> Looking for Ollama…
        </DialogDescription>
      </DialogHeader>
    );
  }

  if (step.kind === 'ollama') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Set up Clearpen’s AI</DialogTitle>
          <DialogDescription>
            Clearpen’s editing runs on this {computer} through Ollama, a free app for AI models. Your writing never
            leaves it.
          </DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3 text-sm">
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">1</span>
            <div className="grid gap-2">
              <span>Download Ollama and install it.</span>
              <Button size="sm" className="w-fit" onClick={onDownloadOllama}>
                Download Ollama
              </Button>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs">2</span>
            <span>Open it. Clearpen finds it on its own — already installed? Just open it.</span>
          </li>
        </ol>
        <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
          <LoaderCircleIcon className="size-3.5 animate-spin" /> Looking for Ollama…
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onNotNow}>
            Not now
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (step.kind === 'choose') {
    const offer = MODEL_OFFERS.find((o) => o.model === choice) ?? recommended;
    const installed = status?.models.includes(offer.model);
    return (
      <>
        <DialogHeader>
          <DialogTitle>Choose your writing model</DialogTitle>
          <DialogDescription>
            It downloads once and runs on this {computer}.
            {memory ? ` This ${computer} has ${Math.round(memory / 2 ** 30)} GB of memory.` : ''}
          </DialogDescription>
        </DialogHeader>
        <RadioGroup value={choice} onValueChange={setChoice} aria-label="Writing model">
          {MODEL_OFFERS.map((o) => (
            <Label
              key={o.model}
              htmlFor={`offer-${o.model}`}
              className={cn(
                'flex cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal',
                choice === o.model && 'border-primary bg-muted/40',
              )}
            >
              <RadioGroupItem id={`offer-${o.model}`} value={o.model} className="mt-0.5" />
              <span className="grid gap-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {o.name}
                  <span className="font-normal text-muted-foreground">{formatBytes(o.bytes)}</span>
                  {o.model === recommended.model && <Badge variant="secondary">Recommended</Badge>}
                  {status?.models.includes(o.model) && <Badge variant="outline">Installed</Badge>}
                </span>
                <span className="text-xs leading-snug text-muted-foreground">{o.note}</span>
              </span>
            </Label>
          ))}
        </RadioGroup>
        {!canPull && !installed && (
          <p className="text-xs text-muted-foreground">
            This model server can’t download models. Add {offer.model} on the server, then choose it here.
          </p>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onNotNow}>
            Not now
          </Button>
          <Button onClick={() => onUse(offer)} disabled={!canPull && !installed}>
            {installed ? `Use ${offer.name}` : `Download ${formatBytes(offer.bytes)}`}
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (step.kind === 'downloading') {
    const f = fraction(step.offer, step.progress);
    const total = step.progress?.total || step.offer.bytes;
    return (
      <>
        <DialogHeader>
          <DialogTitle>Downloading {step.offer.name}</DialogTitle>
          <DialogDescription>{phase(step.progress)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <Progress value={Math.round(f * 100)} aria-label="Download progress" />
          <p className="flex justify-between text-xs text-muted-foreground tabular-nums">
            <span>
              {formatBytes(step.progress?.completed ?? 0)} of {formatBytes(total)}
            </span>
            <span>{Math.floor(f * 100)}%</span>
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          You can keep writing: the download carries on, and the sidebar shows how far it’s got.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onCancel}>
            Cancel download
          </Button>
          <Button variant="outline" onClick={onHide}>
            Keep writing
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (step.kind === 'failed') {
    return (
      <>
        <DialogHeader>
          <DialogTitle>The download stopped</DialogTitle>
          <DialogDescription>{step.error}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Ollama keeps what it downloaded, so trying again carries on from there.
        </p>
        <DialogFooter>
          <Button variant="ghost" onClick={onNotNow}>
            Not now
          </Button>
          <Button onClick={() => onUse(step.offer)}>Try again</Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CheckIcon className="size-5 text-[var(--ins)]" /> Clearpen is ready
        </DialogTitle>
        <DialogDescription>
          {MODEL_OFFERS.find((o) => o.model === step.model)?.name ?? step.model} runs on this {computer}. Select a
          paragraph to edit it, or finish a sentence and pause.
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onHide}>Start writing</Button>
      </DialogFooter>
    </>
  );
}
