// First-run setup. Clearpen's AI runs on this computer through Ollama, a free
// app. When Ollama isn't there, or has no model yet, this walks the writer
// through both: a link to download Ollama, then a model downloaded right
// here, with its progress. Writing works without any of it, and "Not now"
// leaves it for later — the model status in the sidebar opens it again.

import {
  type CatalogModel,
  type CatalogTag,
  defaultTag,
  formatBytes,
  type LLMStatus,
  MODEL_OFFERS,
  type ModelOffer,
  mainTags,
  OLLAMA_LIBRARY,
  type PullProgress,
  parseOllamaLibrary,
  parseOllamaTags,
  recommendedOffer,
  searchModels,
  writerModels,
} from '@clearpen/core';
import { CheckIcon, LoaderCircleIcon } from 'lucide-react';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Backend } from './backend.ts';
import { OpenRouterForm } from './components/openrouter-form.tsx';
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
import { Input } from './components/ui/input.tsx';
import { Label } from './components/ui/label.tsx';
import { Progress } from './components/ui/progress.tsx';
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select.tsx';
import { useEventActions } from './events.tsx';
import { cn } from './lib/utils.ts';
import { useSettings } from './settings.tsx';

export const OLLAMA_DOWNLOAD = 'https://ollama.com/download';
/** How often setup looks for Ollama while the writer installs it. */
export const SETUP_POLL_MS = 2000;

type Step =
  | { kind: 'checking' }
  | { kind: 'ollama' }
  | { kind: 'choose' }
  | { kind: 'openrouter' }
  | { kind: 'downloading'; offer: ModelOffer; progress: PullProgress | null }
  | { kind: 'ready'; model: string; name?: string; cloud?: boolean }
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

const fraction = (offer: ModelOffer, p: PullProgress | null) => {
  if (!p) return 0;
  if (p.done) return 1;
  const total = p.total || offer.bytes;
  return total > 0 ? p.completed / total : 0;
};

/** A model we know little about yet, as the offer the download screens show. */
const pickedOffer = (model: string, over: Partial<ModelOffer> = {}): ModelOffer => ({
  model,
  name: model,
  bytes: 0,
  memoryGB: 0,
  note: '',
  ...over,
});

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
  const { notify } = useEventActions();
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
      if (!s?.reachable) setStep(settings.aiProvider === 'openrouter' ? { kind: 'openrouter' } : { kind: 'ollama' });
      else if (s.ok && at !== 'choose') setStep({ kind: 'ready', model: s.roles.quick! });
      else setStep({ kind: 'choose' });
      return s;
    },
    [backend, settings.aiProvider],
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
        setStep({ kind: 'ready', model: offer.model, name: offer.name });
        setShown(true);
        notify({
          title: 'Model ready',
          body: `Clearpen can now write with ${offer.name}.`,
          severity: 'success',
        });
      } catch (err) {
        if (c.signal.aborted) return;
        setStep({ kind: 'failed', offer, error: err instanceof Error ? err.message : String(err) });
        setShown(true);
      } finally {
        if (ctrl.current === c) ctrl.current = null;
      }
    },
    [backend, set, notify],
  );

  const use = useCallback(
    (offer: ModelOffer) => {
      // Already there: just write with it.
      if (status?.models.includes(offer.model)) {
        const models = { ...live.current.models, quick: offer.model };
        set('models', models);
        backend.ai.setModels(models, { preload: true });
        setStep({ kind: 'ready', model: offer.model, name: offer.name });
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
            backend={backend}
            step={step}
            status={status}
            memory={memory}
            platform={backend.platform}
            onDownloadOllama={() => void backend.openLink(OLLAMA_DOWNLOAD)}
            onOpenRouter={() => setStep({ kind: 'openrouter' })}
            onBackFromOpenRouter={() => setStep({ kind: status?.reachable ? 'choose' : 'ollama' })}
            onCloudReady={(model) => setStep({ kind: 'ready', model, cloud: true })}
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
  backend,
  step,
  status,
  memory,
  platform,
  onDownloadOllama,
  onOpenRouter,
  onBackFromOpenRouter,
  onCloudReady,
  onUse,
  onCancel,
  onNotNow,
  onHide,
  canPull,
}: {
  backend: Backend;
  step: Step;
  status: LLMStatus | null;
  memory: number | null;
  platform: Backend['platform'];
  onDownloadOllama(): void;
  onOpenRouter(): void;
  onBackFromOpenRouter(): void;
  onCloudReady(model: string): void;
  onUse(offer: ModelOffer): void;
  onCancel(): void;
  onNotNow(): void;
  onHide(): void;
  canPull: boolean;
}) {
  const computer = platform === 'mac' ? 'Mac' : 'computer';

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
        {backend.ai.openRouter && (
          <Button variant="outline" onClick={onOpenRouter}>
            Use OpenRouter instead
          </Button>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onNotNow}>
            Not now
          </Button>
        </DialogFooter>
      </>
    );
  }

  if (step.kind === 'choose') {
    return (
      <ChooseModel
        backend={backend}
        status={status}
        memory={memory}
        computer={computer}
        canPull={canPull}
        onUse={onUse}
        onOpenRouter={onOpenRouter}
        onNotNow={onNotNow}
      />
    );
  }

  if (step.kind === 'openrouter') {
    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">Use OpenRouter</DialogTitle>
          <DialogDescription>
            OpenRouter runs hundreds of models in the cloud through one key. Bring your own key: it stays in your
            operating system’s keychain, and only requests for your writing go to openrouter.ai.
          </DialogDescription>
        </DialogHeader>
        <OpenRouterForm backend={backend} onConnected={onCloudReady} />
        <DialogFooter>
          <Button variant="ghost" className="mr-auto" onClick={onBackFromOpenRouter}>
            Back
          </Button>
          <Button variant="ghost" onClick={onNotNow}>
            Not now
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
              {formatBytes(step.progress?.completed ?? 0)} of {total ? formatBytes(total) : '…'}
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
          {step.cloud ? (
            <>{step.name ?? step.model} answers through OpenRouter. You can change the model later in Models.</>
          ) : (
            <>
              {step.name ?? MODEL_OFFERS.find((o) => o.model === step.model)?.name ?? step.model} runs on this{' '}
              {computer}. Select a paragraph to edit it, or finish a sentence and pause.
            </>
          )}
        </DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button onClick={onHide}>Start writing</Button>
      </DialogFooter>
    </>
  );
}

/**
 * The model chooser: the models Clearpen recommends for the computer, then
 * ollama.com's whole library, searchable, so any model (and any size) can be
 * chosen. A name typed by hand covers what the library page doesn't list yet.
 */
function ChooseModel({
  backend,
  status,
  memory,
  computer,
  canPull,
  onUse,
  onOpenRouter,
  onNotNow,
}: {
  backend: Backend;
  status: LLMStatus | null;
  memory: number | null;
  computer: string;
  canPull: boolean;
  onUse(offer: ModelOffer): void;
  onOpenRouter(): void;
  onNotNow(): void;
}) {
  const recommended = recommendedOffer(memory);
  const [choice, setChoice] = useState(recommended.model);
  const [query, setQuery] = useState('');
  const [catalog, setCatalog] = useState<CatalogModel[] | null>(null);
  const [catalogState, setCatalogState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [selected, setSelected] = useState<CatalogModel | null>(null);
  const [tags, setTags] = useState<CatalogTag[] | null>(null);
  const [tagsState, setTagsState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [manual, setManual] = useState('');
  const tagsRequest = useRef(0);
  const tagsCache = useRef(new Map<string, CatalogTag[]>());
  const catalogRequest = useRef(false);

  useEffect(() => setChoice(recommended.model), [recommended.model]);

  // The library page is one request, made the first time the writer looks for
  // a model. A failure leaves the recommended models and the name box.
  function loadCatalog() {
    if (catalogRequest.current) return;
    catalogRequest.current = true;
    if (!backend.fetchPage) {
      setCatalogState('error');
      return;
    }
    setCatalogState('loading');
    backend
      .fetchPage(OLLAMA_LIBRARY)
      .then((page) => {
        const models = writerModels(parseOllamaLibrary(page.text));
        // The page came back, but not as the library we know: the name box still works.
        if (!models.length) return setCatalogState('error');
        setCatalog(models);
        setCatalogState('ready');
      })
      .catch(() => setCatalogState('error'));
  }

  function pick(model: CatalogModel) {
    setSelected(model);
    setManual('');
    setChoice(model.name);
    setTags(null);
    const request = ++tagsRequest.current;
    const cached = tagsCache.current.get(model.name);
    if (cached) {
      setTags(cached);
      setTagsState('ready');
      const tag = defaultTag(cached);
      if (tag) setChoice(`${model.name}:${tag.name}`);
      return;
    }
    setTagsState('loading');
    if (!backend.fetchPage) {
      setTagsState('error');
      return;
    }
    // The model's page lists its sizes; Ollama's own default if it can't be read.
    backend
      .fetchPage(`${OLLAMA_LIBRARY}/${encodeURIComponent(model.name)}/tags`)
      .then((page) => {
        if (request !== tagsRequest.current) return;
        const found = parseOllamaTags(page.text);
        tagsCache.current.set(model.name, found);
        setTags(found);
        setTagsState('ready');
        const tag = defaultTag(found);
        if (tag) setChoice(`${model.name}:${tag.name}`);
      })
      .catch(() => {
        if (request === tagsRequest.current) setTagsState('error');
      });
  }

  function typeModel(value: string) {
    setManual(value);
    if (!value.trim()) {
      setChoice(recommended.model);
      return;
    }
    setSelected(null);
    setTags(null);
    setTagsState('idle');
    tagsRequest.current++;
    setChoice(value.trim());
  }

  const picked = (() => {
    if (manual.trim()) return pickedOffer(manual.trim());
    if (selected) {
      const tag = tags?.find((t) => `${selected.name}:${t.name}` === choice);
      return pickedOffer(choice, {
        ...(tag?.bytes ? { bytes: tag.bytes } : {}),
        note: selected.description,
      });
    }
    return MODEL_OFFERS.find((o) => o.model === choice) ?? recommended;
  })();

  const installed = status?.models.includes(picked.model) ?? false;
  const installedCatalog = (model: CatalogModel) =>
    status?.models.some((m) => m === model.name || m.startsWith(`${model.name}:`)) ?? false;
  const results = catalog ? searchModels(catalog, query, query.trim() ? 40 : 10) : [];

  return (
    <>
      <DialogHeader>
        <DialogTitle>Choose your writing model</DialogTitle>
        <DialogDescription>
          It downloads once and runs on this {computer}.
          {memory ? ` This ${computer} has ${Math.round(memory / 2 ** 30)} GB of memory.` : ''}
        </DialogDescription>
      </DialogHeader>
      <div className="grid max-h-[55vh] gap-5 overflow-y-auto pr-1">
        {!query.trim() && (
          <RadioGroup
            value={choice}
            onValueChange={(v) => {
              setManual('');
              setSelected(null);
              setTags(null);
              tagsRequest.current++;
              setChoice(v);
            }}
            aria-label="Writing model"
          >
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
        )}

        <div className="grid gap-2">
          <Label htmlFor="model-search">Search Ollama’s library</Label>
          <Input
            id="model-search"
            value={query}
            onFocus={loadCatalog}
            onChange={(e) => {
              setQuery(e.target.value);
              loadCatalog();
            }}
            placeholder="llama, mistral, a size…"
            autoComplete="off"
          />
          {catalogState === 'loading' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <LoaderCircleIcon className="size-3.5 animate-spin" /> Looking through Ollama’s library…
            </p>
          )}
          {catalogState === 'error' && (
            <p className="text-xs text-muted-foreground">
              Couldn’t reach ollama.com. Type a model’s name below instead.
            </p>
          )}
          {catalogState === 'ready' && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No models match “{query}”.</p>
          )}
          {catalogState === 'ready' && results.length > 0 && (
            <RadioGroup
              value={selected?.name ?? ''}
              onValueChange={(name) => {
                const model = catalog?.find((m) => m.name === name);
                if (model) pick(model);
              }}
              aria-label="Ollama library"
            >
              <div className="grid max-h-56 gap-1 overflow-y-auto">
                {results.map((m) => (
                  <Label
                    key={m.name}
                    htmlFor={`catalog-${m.name}`}
                    className={cn(
                      'flex cursor-pointer items-start gap-3 rounded-lg border p-2.5 font-normal',
                      selected?.name === m.name && 'border-primary bg-muted/40',
                    )}
                  >
                    <RadioGroupItem id={`catalog-${m.name}`} value={m.name} className="mt-0.5" />
                    <span className="grid gap-0.5">
                      <span className="flex flex-wrap items-center gap-2 font-medium">
                        {m.name}
                        {m.sizes.length > 0 && (
                          <span className="font-normal text-muted-foreground">{m.sizes.join(' · ')}</span>
                        )}
                        {installedCatalog(m) && <Badge variant="outline">Installed</Badge>}
                      </span>
                      <span className="line-clamp-2 text-xs leading-snug text-muted-foreground">{m.description}</span>
                    </span>
                  </Label>
                ))}
              </div>
            </RadioGroup>
          )}

          {selected && (
            <div className="grid gap-1.5 rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{selected.name}</span>
                {tagsState === 'loading' && <LoaderCircleIcon className="size-3.5 animate-spin" />}
              </div>
              {tags && tags.length > 0 ? (
                <Select value={choice} onValueChange={setChoice}>
                  <SelectTrigger className="w-full" aria-label={`Version of ${selected.name}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {mainTags(tags).map((t) => (
                      <SelectItem key={t.name} value={`${selected.name}:${t.name}`}>
                        {t.name}
                        {t.bytes ? ` · ${formatBytes(t.bytes)}` : ''}
                        {t.context ? ` · ${t.context} context` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {tagsState === 'loading' ? 'Looking for its versions…' : 'Ollama’s default version will download.'}
                </p>
              )}
            </div>
          )}

          <div className="grid gap-1.5">
            <Label htmlFor="model-name">Or type any model from ollama.com/library</Label>
            <Input
              id="model-name"
              value={manual}
              onChange={(e) => typeModel(e.target.value)}
              placeholder="mistral:7b"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </div>
      </div>
      {!canPull && !installed && (
        <p className="text-xs text-muted-foreground">
          This model server can’t download models. Add {picked.model} on the server, then choose it here.
        </p>
      )}
      <DialogFooter>
        {backend.ai.openRouter && (
          <Button variant="link" className="mr-auto px-0" onClick={onOpenRouter}>
            Use OpenRouter instead
          </Button>
        )}
        <Button variant="ghost" onClick={onNotNow}>
          Not now
        </Button>
        <Button onClick={() => onUse(picked)} disabled={(!canPull && !installed) || !picked.model}>
          {installed ? `Use ${picked.name}` : picked.bytes ? `Download ${formatBytes(picked.bytes)}` : 'Download'}
        </Button>
      </DialogFooter>
    </>
  );
}
