// Connecting Clearpen to OpenRouter: the writer's own key, kept in the
// operating system's credential store (or, in the browser preview, in this
// tab's memory), and a model chosen from OpenRouter's catalogue.

import { type OpenRouterModel, searchOpenRouterModels } from '@clearpen/core';
import { CheckIcon, ExternalLinkIcon, LoaderCircleIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Backend } from '../backend.ts';
import { useSettings } from '../settings.tsx';
import { Badge } from './ui/badge.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';
import { Label } from './ui/label.tsx';

export const OPENROUTER_KEYS = 'https://openrouter.ai/keys';

const tokens = (n: number) => (n >= 1_000_000 ? `${Math.round(n / 1_000_000)}M` : `${Math.round(n / 1_000)}K`);

/** "$0.25 in · $1.50 out per million tokens", or "Free". */
function cost(m: OpenRouterModel): string {
  if (m.free) return 'Free';
  const money = (n: number) => `$${n < 0.01 ? n.toFixed(3) : n.toFixed(2)}`;
  if (m.inputPrice === undefined && m.outputPrice === undefined) return '';
  return `${money(m.inputPrice ?? 0)} in · ${money(m.outputPrice ?? 0)} out per 1M tokens`;
}

/**
 * The OpenRouter half of model setup. A key that works is saved and used at
 * once; a key that doesn't says why and is not kept.
 */
export function OpenRouterForm({ backend, onConnected }: { backend: Backend; onConnected?(model: string): void }) {
  const { settings, set } = useSettings();
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState(false);
  const [connected, setConnected] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [catalogue, setCatalogue] = useState<OpenRouterModel[] | null>(null);
  const [choice, setChoice] = useState(settings.openrouterModels.quick ?? '');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState<'checking' | 'connecting' | 'loading' | null>('checking');
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  // What is already here: a saved key, and whether it is the one in use.
  useEffect(() => {
    let live = true;
    void (async () => {
      const status = await backend.ai.status().catch(() => null);
      const has = !!(await backend.secrets.get('openrouter').catch(() => null));
      if (!live) return;
      setSaved(has);
      const active = status?.provider === 'openrouter' && status.ok;
      setConnected(active);
      setBusy(active ? 'loading' : null);
      if (active) {
        setChoice(status.roles.quick ?? '');
        const models = await backend.ai.catalogue().catch(() => []);
        if (live) {
          setCatalogue(models);
          setBusy(null);
        }
      }
    })();
    return () => {
      live = false;
    };
  }, [backend]);

  async function connect(withKey: string) {
    setBusy('connecting');
    setError('');
    setNote('');
    try {
      const status = await backend.ai.switchToOpenRouter(withKey, settings.openrouterModels);
      const model = status.roles.quick ?? '';
      try {
        await backend.secrets.set('openrouter', withKey);
        setSaved(true);
      } catch {
        setNote('Connected, but the key couldn’t be saved. You’ll need to enter it again after a restart.');
      }
      const models = { ...settings.openrouterModels, quick: model };
      set('openrouterModels', models);
      set('aiProvider', 'openrouter');
      setChoice(model);
      setConnected(true);
      setReplacing(false);
      setKey('');
      onConnected?.(model);
      setBusy('loading');
      setCatalogue(await backend.ai.catalogue().catch(() => []));
    } catch (err) {
      const said = err instanceof Error ? err.message : String(err);
      // A fetch error must never put the key on screen.
      setError(withKey ? said.split(withKey).join('the key') : said);
    } finally {
      setBusy(null);
    }
  }

  async function connectSaved() {
    const withKey = await backend.secrets.get('openrouter').catch(() => null);
    if (!withKey) {
      setSaved(false);
      return;
    }
    await connect(withKey);
  }

  function chooseModel(id: string) {
    const models = { ...settings.openrouterModels, quick: id };
    setChoice(id);
    set('openrouterModels', models);
    set('aiProvider', 'openrouter');
    backend.ai.setModels(models);
    onConnected?.(id);
  }

  const results = catalogue ? searchOpenRouterModels(catalogue, query, query.trim() ? 60 : 30) : [];
  const where = backend.secrets.persistent ? 'your operating system’s keychain' : 'this tab’s memory';

  if (busy === 'checking') {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
        <LoaderCircleIcon className="size-4 animate-spin" /> Looking for a saved OpenRouter key…
      </p>
    );
  }

  return (
    <div className="grid gap-4">
      {connected && !replacing ? (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3 text-sm">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-[var(--ins)]" />
          <span>
            Connected to OpenRouter. Answers are written by the model you choose below and sent from openrouter.ai. Your
            key is in {where}.
          </span>
        </p>
      ) : saved && !replacing ? (
        <div className="grid gap-2 rounded-lg border bg-muted/30 p-3">
          <p className="text-sm">Your OpenRouter key is saved in {where}.</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void connectSaved()} disabled={busy === 'connecting'}>
              {busy === 'connecting' && <LoaderCircleIcon className="size-4 animate-spin" />} Use saved key
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setReplacing(true)}>
              Use another key
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="grid gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (key.trim()) void connect(key.trim());
          }}
        >
          <Label htmlFor="openrouter-key">OpenRouter API key</Label>
          <Input
            id="openrouter-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="sk-or-v1-…"
            autoComplete="off"
            spellCheck={false}
          />
          <p className="text-xs leading-snug text-muted-foreground">
            Create a key at{' '}
            <button
              type="button"
              className="inline-flex items-center gap-0.5 underline underline-offset-2"
              onClick={() => void backend.openLink(OPENROUTER_KEYS)}
            >
              openrouter.ai/keys <ExternalLinkIcon className="size-3" />
            </button>
            . It is kept in {where} — never in Clearpen’s library, a settings file or a log.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" disabled={!key.trim() || busy === 'connecting'}>
              {busy === 'connecting' && <LoaderCircleIcon className="size-4 animate-spin" />} Connect
            </Button>
            {saved && replacing && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setReplacing(false)}>
                Keep the saved key
              </Button>
            )}
          </div>
        </form>
      )}

      {connected && !replacing && (
        <div className="grid gap-2">
          <Label htmlFor="openrouter-model">Model</Label>
          <Input
            id="openrouter-model"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search: claude, gemini, qwen, a size…"
            autoComplete="off"
          />
          {busy === 'loading' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <LoaderCircleIcon className="size-3.5 animate-spin" /> Looking through OpenRouter’s models…
            </p>
          )}
          {catalogue && results.length === 0 && (
            <p className="text-xs text-muted-foreground">No models match “{query}”.</p>
          )}
          {results.length > 0 && (
            <div className="grid max-h-56 gap-1 overflow-y-auto pr-1" role="listbox" aria-label="OpenRouter models">
              {results.map((m) => {
                const picked = m.id === choice;
                return (
                  <button
                    type="button"
                    key={m.id}
                    role="option"
                    aria-selected={picked}
                    onClick={() => chooseModel(m.id)}
                    className={`grid gap-0.5 rounded-lg border p-2.5 text-left hover:bg-muted/50 ${
                      picked ? 'border-primary bg-muted/40' : ''
                    }`}
                  >
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      {m.name ?? m.id}
                      {m.free && <Badge variant="secondary">Free</Badge>}
                      {m.context ? (
                        <span className="font-normal text-muted-foreground">{tokens(m.context)} context</span>
                      ) : null}
                    </span>
                    <span className="text-xs text-muted-foreground">{m.id}</span>
                    {cost(m) && <span className="text-xs text-muted-foreground">{cost(m)}</span>}
                  </button>
                );
              })}
            </div>
          )}
          {choice && <p className="truncate text-xs text-muted-foreground">Writing with {choice}</p>}
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {note && <p className="text-xs text-muted-foreground">{note}</p>}
    </div>
  );
}
