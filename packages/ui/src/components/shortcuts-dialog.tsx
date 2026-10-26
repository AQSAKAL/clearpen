import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Kbd, KbdGroup } from './ui/kbd.tsx';

export function shortcuts(mod: string): [string[], string][] {
  return [
    [[`${mod}S`], 'Save a version'],
    [[`${mod}\\`], 'Show or hide the library'],
    [[`${mod}.`], 'Focus mode'],
    [[`${mod}⇧P`], 'Reader mode (Esc to leave)'],
    [[`${mod}B`, `${mod}I`], 'Bold, italic'],
    [[`${mod}F`], 'Find in the article'],
    [['Tab', '⇧Tab'], 'Indent or outdent a list item'],
    [['Esc', 'Tab'], 'Leave the editor with the keyboard'],
    [[`${mod}Z`, `${mod}⇧Z`], 'Undo, redo'],
  ];
}

export function ShortcutsDialog({
  open,
  onOpenChange,
  mod,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  mod: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Tab never leaves the editor by accident: press Esc first.</DialogDescription>
        </DialogHeader>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 text-sm">
          {shortcuts(mod).map(([keys, what]) => (
            <div key={what} className="contents">
              <dt>
                <KbdGroup>
                  {keys.map((k) => (
                    <Kbd key={k}>{k}</Kbd>
                  ))}
                </KbdGroup>
              </dt>
              <dd className="text-muted-foreground">{what}</dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
