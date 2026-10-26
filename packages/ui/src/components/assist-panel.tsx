// The Assist panel: Insights, and the notes when the margin has no room for
// them. A column beside the page in a wide window, a sheet in a narrow one.
// Plan, Ask and Publish join it with the thinking aids.

import { XIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { type HighlightState, Insights } from './insights.tsx';
import { NotesList } from './margin-notes.tsx';
import { Button } from './ui/button.tsx';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from './ui/sheet.tsx';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs.tsx';

export type AssistTab = 'notes' | 'insights';

interface Props {
  tab: AssistTab | null;
  onTab(tab: AssistTab | null): void;
  /** The notes are in the margin, so the panel doesn't list them. */
  notesInMargin: boolean;
  /** Beside the page (true) or over it (false). */
  inline: boolean;
  highlight: HighlightState;
}

function Body({ tab, onTab, notesInMargin, highlight, close }: Props & { close: ReactNode }) {
  const current = !notesInMargin || tab !== 'notes' ? (tab ?? 'insights') : 'insights';
  return (
    <Tabs value={current} onValueChange={(v) => onTab(v as AssistTab)} className="flex h-full min-h-0 flex-col gap-0">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <TabsList>
          {!notesInMargin && <TabsTrigger value="notes">Notes</TabsTrigger>}
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>
        <div className="flex-1" />
        {close}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!notesInMargin && (
          <TabsContent value="notes">
            <NotesList />
          </TabsContent>
        )}
        <TabsContent value="insights">
          <Insights highlight={highlight} />
        </TabsContent>
      </div>
    </Tabs>
  );
}

export function AssistPanel(props: Props) {
  const { tab, onTab, inline } = props;
  if (inline) {
    if (!tab) return null;
    return (
      <aside aria-label="Assist" className="flex h-full w-[360px] shrink-0 flex-col border-l bg-background">
        <Body
          {...props}
          close={
            <Button size="icon-sm" variant="ghost" aria-label="Close" onClick={() => onTab(null)}>
              <XIcon />
            </Button>
          }
        />
      </aside>
    );
  }
  return (
    <Sheet open={!!tab} onOpenChange={(o) => !o && onTab(null)}>
      <SheetContent side="right" className="w-[min(380px,92vw)] gap-0 p-0 sm:max-w-none">
        <SheetHeader className="sr-only">
          <SheetTitle>Assist</SheetTitle>
          <SheetDescription>Notes on your draft, and insights.</SheetDescription>
        </SheetHeader>
        <Body {...props} close={null} />
      </SheetContent>
    </Sheet>
  );
}
