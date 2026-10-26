// The trash: articles you deleted, until you restore them or delete them for good.

import type { DocumentSummary } from '@clearpen/db';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAsk } from '../ask.tsx';
import { timeAgo } from '../lib/time.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { ScrollArea } from './ui/scroll-area.tsx';

export function TrashDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const lib = useLibrary();
  const { confirm } = useAsk();
  const [items, setItems] = useState<DocumentSummary[] | null>(null);
  const trashed = lib.backend.library.documents.trashed;

  const load = useCallback(() => trashed().then(setItems), [trashed]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  async function restore(d: DocumentSummary) {
    await lib.restore(d.id);
    await load();
    toast(`Restored “${d.title || 'Untitled'}”`, { action: { label: 'Open', onClick: () => lib.open(d.id) } });
  }

  async function purge(d: DocumentSummary) {
    const ok = await confirm({
      title: `Delete “${d.title || 'Untitled'}” for good?`,
      description: 'The article and all its versions will be gone. This can’t be undone.',
      action: 'Delete for good',
      destructive: true,
    });
    if (!ok) return;
    await lib.purge(d.id);
    await load();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Articles you delete wait here until you restore them or delete them for good.
          </DialogDescription>
        </DialogHeader>
        {items && !items.length ? (
          <p className="py-6 text-center text-sm text-muted-foreground">The trash is empty.</p>
        ) : (
          <ScrollArea className="max-h-[50vh]">
            <ul className="grid gap-1">
              {items?.map((d) => (
                <li key={d.id} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/60">
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        d.title ? 'truncate text-sm font-medium' : 'truncate text-sm italic text-muted-foreground'
                      }
                    >
                      {d.title || 'Untitled'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Deleted {timeAgo(d.deletedAt ?? d.updatedAt)} · {d.words.toLocaleString()} words
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => restore(d)}>
                    Restore
                  </Button>
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => purge(d)}>
                    Delete
                  </Button>
                </li>
              ))}
            </ul>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
