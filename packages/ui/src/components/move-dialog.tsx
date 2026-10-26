// Move an article into a project, or out of one.

import { CheckIcon, FolderIcon, InboxIcon } from 'lucide-react';
import { toast } from 'sonner';
import { useLibrary } from '../library.tsx';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from './ui/command.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx';

export function MoveDialog({ docId, onOpenChange }: { docId: string | null; onOpenChange(open: boolean): void }) {
  const lib = useLibrary();
  const doc = lib.docs.find((d) => d.id === docId);

  const move = (projectId: string | null) => {
    if (!docId) return;
    onOpenChange(false);
    if (doc?.projectId === projectId) return;
    lib.move(docId, projectId).catch((err) => toast.error(err.message));
  };

  return (
    <Dialog open={!!docId} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>Move to project</DialogTitle>
          <DialogDescription>Choose a project for “{doc?.title || 'Untitled'}”.</DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder="Move to project…" />
          <CommandList>
            <CommandEmpty>
              {lib.projects.length ? 'No project matches.' : 'No projects yet — make one with New project.'}
            </CommandEmpty>
            <CommandGroup>
              {lib.projects.map((p) => (
                <CommandItem key={p.id} value={p.name} onSelect={() => move(p.id)}>
                  <FolderIcon /> {p.name}
                  {doc?.projectId === p.id && <CheckIcon className="ml-auto" />}
                </CommandItem>
              ))}
              <CommandItem value="No project" onSelect={() => move(null)}>
                <InboxIcon /> No project
                {doc && !doc.projectId && <CheckIcon className="ml-auto" />}
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
