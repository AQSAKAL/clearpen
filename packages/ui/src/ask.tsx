// `prompt()` and `confirm()` as promises, drawn with shadcn's Dialog and
// AlertDialog, so actions can ask a question in one line of code.

import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from './components/ui/alert-dialog.tsx';
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

interface PromptOptions {
  title: string;
  description?: string;
  value?: string;
  placeholder?: string;
  action?: string;
}

interface ConfirmOptions {
  title: string;
  description?: string;
  action?: string;
  destructive?: boolean;
}

type Request =
  | { kind: 'prompt'; opts: PromptOptions; resolve(v: string | null): void }
  | { kind: 'confirm'; opts: ConfirmOptions; resolve(v: boolean): void };

interface AskValue {
  prompt(opts: PromptOptions): Promise<string | null>;
  confirm(opts: ConfirmOptions): Promise<boolean>;
}

const AskContext = createContext<AskValue | null>(null);

export function AskProvider({ children }: { children: ReactNode }) {
  const [req, setReq] = useState<Request | null>(null);
  const [text, setText] = useState('');

  const prompt = useCallback(
    (opts: PromptOptions) =>
      new Promise<string | null>((resolve) => {
        setText(opts.value ?? '');
        setReq({ kind: 'prompt', opts, resolve });
      }),
    [],
  );
  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setReq({ kind: 'confirm', opts, resolve })),
    [],
  );

  const close = (answer: string | boolean | null) => {
    if (req?.kind === 'prompt') req.resolve(typeof answer === 'string' ? answer : null);
    if (req?.kind === 'confirm') req.resolve(answer === true);
    setReq(null);
  };

  const value = useMemo(() => ({ prompt, confirm }), [prompt, confirm]);

  return (
    <AskContext.Provider value={value}>
      {children}
      <Dialog open={req?.kind === 'prompt'} onOpenChange={(o) => !o && close(null)}>
        {req?.kind === 'prompt' && (
          <DialogContent className="sm:max-w-md">
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (text.trim()) close(text.trim());
              }}
            >
              <DialogHeader>
                <DialogTitle>{req.opts.title}</DialogTitle>
                {req.opts.description && <DialogDescription>{req.opts.description}</DialogDescription>}
              </DialogHeader>
              <Input
                autoFocus
                value={text}
                placeholder={req.opts.placeholder}
                onChange={(e) => setText(e.target.value)}
                aria-label={req.opts.title}
              />
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => close(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!text.trim()}>
                  {req.opts.action ?? 'OK'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        )}
      </Dialog>
      <AlertDialog open={req?.kind === 'confirm'} onOpenChange={(o) => !o && close(false)}>
        {req?.kind === 'confirm' && (
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{req.opts.title}</AlertDialogTitle>
              {req.opts.description && <AlertDialogDescription>{req.opts.description}</AlertDialogDescription>}
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => close(false)}>Cancel</AlertDialogCancel>
              <AlertDialogAction variant={req.opts.destructive ? 'destructive' : 'default'} onClick={() => close(true)}>
                {req.opts.action ?? 'OK'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        )}
      </AlertDialog>
    </AskContext.Provider>
  );
}

export function useAsk(): AskValue {
  const v = useContext(AskContext);
  if (!v) throw new Error('useAsk needs an AskProvider');
  return v;
}
