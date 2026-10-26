// Versions of the open article: pick one, read it, restore it.

import type { Version, VersionSummary } from '@margin/db';
import { useEffect, useState } from 'react';
import { formatDateTime } from '../lib/time.ts';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { ScrollArea } from './ui/scroll-area.tsx';

export function HistoryDialog({
  open,
  onOpenChange,
  onRestore,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  onRestore(v: Version): void;
}) {
  const { backend, current, flush } = useLibrary();
  const [versions, setVersions] = useState<VersionSummary[] | null>(null);
  const [selected, setSelected] = useState<Version | null>(null);
  const versionsApi = backend.library.versions;
  const docId = current?.id;

  useEffect(() => {
    if (!open || !docId) return;
    let live = true;
    setVersions(null);
    setSelected(null);
    (async () => {
      // The newest version is always the text as it is now.
      await flush();
      await versionsApi.save(docId, '');
      const list = await versionsApi.list(docId);
      if (!live) return;
      setVersions(list);
      if (list[0]) setSelected(await versionsApi.get(docId, list[0].id));
    })();
    return () => {
      live = false;
    };
  }, [open, docId, flush, versionsApi]);

  const pick = async (id: string) => docId && setSelected(await versionsApi.get(docId, id));
  const isNewest = selected && versions?.[0]?.id === selected.id;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Version history</DialogTitle>
          <DialogDescription>
            Margin saves a version every ten minutes while you write, and whenever you save one yourself.
          </DialogDescription>
        </DialogHeader>
        <div className="grid h-[60vh] gap-3 sm:grid-cols-[220px_1fr]">
          <ScrollArea className="h-full rounded-md border max-sm:h-40">
            <ul className="p-1">
              {versions?.map((v, i) => (
                <li key={v.id}>
                  <button
                    type="button"
                    onClick={() => pick(v.id)}
                    className={cn(
                      'w-full rounded-md px-2.5 py-2 text-left hover:bg-accent',
                      selected?.id === v.id && 'bg-accent',
                    )}
                  >
                    <span className="block text-sm font-medium">{v.label || (i === 0 ? 'Current' : 'Autosave')}</span>
                    <span className="block text-xs text-muted-foreground">
                      {formatDateTime(v.createdAt)} · {v.words.toLocaleString()} words
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </ScrollArea>
          <ScrollArea className="h-full rounded-md border">
            <div className="p-4 font-write text-[15px] leading-relaxed whitespace-pre-wrap">
              {selected ? (
                <>
                  <p className="mb-3 text-xl font-semibold">{selected.title || 'Untitled'}</p>
                  {selected.content || <span className="text-muted-foreground">Empty</span>}
                </>
              ) : (
                <span className="text-muted-foreground">Loading…</span>
              )}
            </div>
          </ScrollArea>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!selected || !!isNewest} onClick={() => selected && onRestore(selected)}>
            Restore this version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
