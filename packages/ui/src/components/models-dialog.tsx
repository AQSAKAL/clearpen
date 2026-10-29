// Which model does which job. Each role can use its own model; "Automatic"
// picks the best one installed.

import type { LLMStatus, Role } from '@clearpen/core';
import { useEffect, useState } from 'react';
import type { ModelChoice } from '../backend.ts';
import { useLibrary } from '../library.tsx';
import { useSettings } from '../settings.tsx';
import { useSetup } from '../setup.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Label } from './ui/label.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';

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
  const [draft, setDraft] = useState<ModelChoice>(settings.models);
  const setup = useSetup();

  useEffect(() => {
    if (!open) return;
    setDraft(settings.models);
    setStatus(null);
    backend.ai
      .status()
      .then(setStatus)
      .catch(() => {});
  }, [open, backend, settings.models]);

  const installed = status?.models ?? [];
  const where = status ? `${status.provider === 'ollama' ? 'Ollama' : status.provider} at ${status.baseUrl}` : '';

  function save() {
    set('models', draft);
    backend.ai.setModels(draft, { preload: true });
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Models</DialogTitle>
          <DialogDescription>
            {!status
              ? 'Looking for models…'
              : status.ok
                ? `Connected to ${where}. Everything runs on this computer.`
                : `${status.error || 'No models found.'} Clearpen’s AI features need Ollama and a model, for example qwen3.5:4b.`}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-5">
          {ROLES.map(({ role, label, what }) => {
            const value = draft[role] ?? AUTO;
            const auto = status?.roles[role];
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
        <DialogFooter>
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
          <Button onClick={save} disabled={!installed.length}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
