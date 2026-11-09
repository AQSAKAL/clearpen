// A project's recurring writing: choose how often, and Clearpen keeps an
// article waiting in the project. The rhythm can be changed or deleted here.

import type { Cadence, Project } from '@clearpen/db';
import { CalendarClockIcon, Trash2Icon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAsk } from '../ask.tsx';
import { formatDate } from '../lib/time.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select.tsx';

const RHYTHMS: { id: Cadence; label: string; hint: string }[] = [
  { id: 'daily', label: 'Every day', hint: 'A new article each day, titled with its date.' },
  { id: 'weekly', label: 'Every week', hint: 'A new article each week, on the same day.' },
  { id: 'biweekly', label: 'Every two weeks', hint: 'A new article every other week.' },
  { id: 'monthly', label: 'Every month', hint: 'A new article each month, on the same day.' },
];

export function ScheduleDialog({
  project,
  onOpenChange,
}: {
  project: Project | null;
  onOpenChange(open: boolean): void;
}) {
  const lib = useLibrary();
  const { confirm } = useAsk();
  const saved = project ? lib.scheduleFor(project.id) : undefined;
  const [cadence, setCadence] = useState<Cadence>(saved?.cadence ?? 'weekly');
  const [busy, setBusy] = useState(false);

  // Each time the dialog opens for a project, start from its rhythm.
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the project or its saved rhythm changes.
  useEffect(() => {
    if (project) setCadence(lib.scheduleFor(project.id)?.cadence ?? 'weekly');
  }, [project?.id, saved?.cadence]);

  const hint = RHYTHMS.find((r) => r.id === cadence)?.hint;

  async function save() {
    if (!project) return;
    setBusy(true);
    try {
      await lib.setSchedule(project.id, cadence);
      toast(saved ? 'Schedule updated' : 'Scheduled — the first article is ready');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!project) return;
    const ok = await confirm({
      title: `Stop scheduled writing in “${project.name}”?`,
      description: 'The articles already created stay in the project. Clearpen stops making new ones.',
      action: 'Delete schedule',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await lib.deleteSchedule(project.id);
      toast('Schedule deleted');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!project} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClockIcon /> Schedule writing
          </DialogTitle>
          <DialogDescription>
            Choose how often a new article should wait for you in “{project?.name}”. Clearpen creates it ahead of time,
            and you can delete the schedule whenever you like.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <p className="text-sm font-medium">How often</p>
          <Select value={cadence} onValueChange={(v) => setCadence(v as Cadence)}>
            <SelectTrigger className="w-full" aria-label="How often">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RHYTHMS.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>

        <p className="text-sm text-muted-foreground">
          {saved ? `Next article: ${formatDate(saved.nextAt)}.` : 'The first article is created as soon as you save.'}
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          {saved ? (
            <Button variant="destructive" onClick={remove} disabled={busy}>
              <Trash2Icon /> Delete schedule
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={save} disabled={busy}>
              {saved ? 'Update schedule' : 'Set schedule'}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
