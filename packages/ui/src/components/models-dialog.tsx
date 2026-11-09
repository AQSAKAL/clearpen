// Which model does which job: on this computer, or through the writer's
// OpenRouter key. Each role can use its own model; "Automatic" picks the best
// one available.

import type { LLMStatus, Role } from '@clearpen/core';
import { useEffect, useState } from 'react';
import type { ModelChoice } from '../backend.ts';
import { useLibrary } from '../library.tsx';
import { useSettings } from '../settings.tsx';
import { useSetup } from '../setup.tsx';
import { OpenRouterForm } from './openrouter-form.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';

const AUTO = '__auto__';

const ROLES: { role: Role; label: string; what: string }[] = [
  { role: 'quick', label: 'Writing model', what: 'Edits, rewrites and the next sentence. A fast model feels best.' },
  { role: 'coach', label: 'Planning model', what: 'Outlines and section notes.' },
  { role: 'checker', label: 'Fact-checking model', what: 'Checking claims. A larger model helps most here.' },
];

export function ModelsDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const { backend } = useLibrary();
  const { settings, set } = useSettings();
  const [status, setStatus] = useState<LLMStatus | null>(null);
  const [local, setLocal] = useState<LLMStatus | null>(null);
  const [source, setSource] = useState<'local' | 'openrouter'>(settings.aiProvider);
  const [draft, setDraft] = useState<ModelChoice>(settings.models);
  const setup = useSetup();

  useEffect(() => {
    if (!open) return;
    setDraft(settings.models);
    setStatus(null);
    setLocal(null);
    setSource(settings.aiProvider);
    backend.ai
      .status()
      .then((s) => {
        setStatus(s);
        // If OpenRouter wouldn't come back at launch, show what is actually in use.
        if (s.provider !== 'openrouter') setSource('local');
      })
      .catch(() => {});
    backend.ai
      .localStatus()
      .then(setLocal)
      .catch(() => {});
  }, [open, backend, settings.aiProvider, settings.models]);

  const installed = local?.models ?? [];
  const where = local ? `${local.provider === 'ollama' ? 'Ollama' : local.provider} at ${local.baseUrl}` : '';

  function saveLocal() {
    set('models', draft);
    set('aiProvider', 'local');
    void backend.ai.switchToLocal(draft);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Models</DialogTitle>
          <DialogDescription>
            {source === 'openrouter'
              ? `Answers come from OpenRouter. Your key is kept in ${
                  backend.secrets.persistent ? 'your operating system’s keychain' : 'this tab’s memory'
                }, not in your library.`
              : !status
                ? 'Looking for models…'
                : status.provider === 'openrouter'
                  ? 'OpenRouter is in use. Choose local models below to switch back.'
                  : !local
                    ? 'Looking for models on this computer…'
                    : local.ok
                      ? `Connected to ${where}. Everything runs on this computer.`
                      : `${local.error || 'No models found.'} Clearpen’s AI features need Ollama and a model, for example qwen3.5:4b.`}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={source} onValueChange={(v) => setSource(v === 'openrouter' ? 'openrouter' : 'local')}>
          {backend.ai.openRouter && (
            <TabsList className="w-full">
              <TabsTrigger value="local">On this computer</TabsTrigger>
              <TabsTrigger value="openrouter">OpenRouter</TabsTrigger>
            </TabsList>
          )}

          <TabsContent value="local">
            <div className="grid gap-5">
              {ROLES.map(({ role, label, what }) => {
                const value = draft[role] ?? AUTO;
                const auto = local?.roles[role];
                return (
                  <div key={role} className="grid gap-1.5">
                    <Label htmlFor={`model-${role}`}>{label}</Label>
                    <Select
                      value={installed.includes(value) ? value : AUTO}
                      onValueChange={(v) => setDraft({ ...draft, [role]: v === AUTO ? null : v })}
                      disabled={!installed.length}
                    >
                      <SelectTrigger id={`model-${role}`} className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={AUTO}>Automatic{auto && !draft[role] ? ` (${auto})` : ''}</SelectItem>
                        {installed.map((m) => (
                          <SelectItem key={m} value={m}>
                            {m}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">{what}</p>
                  </div>
                );
              })}
            </div>
          </TabsContent>

          {backend.ai.openRouter && (
            <TabsContent value="openrouter">
              <OpenRouterForm backend={backend} />
            </TabsContent>
          )}
        </Tabs>

        <DialogFooter>
          {source === 'local' ? (
            <>
              <Button
                variant="link"
                className="mr-auto px-0"
                onClick={() => {
                  onOpenChange(false);
                  setup.open('choose');
                }}
              >
                Download a model…
              </Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button onClick={saveLocal} disabled={!installed.length}>
                Save
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Done</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
