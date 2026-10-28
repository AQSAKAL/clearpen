// The bar above the page: save state, word count, reader mode and the ⋯ menu.

import { BookOpenIcon, MessageSquareTextIcon, MoreHorizontalIcon, PanelRightIcon, PencilLineIcon } from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { type SaveState, useLibrary } from '../library.tsx';
import { type ThemeSetting, useTheme } from '../theme.tsx';
import type { Counts } from './article-editor.tsx';
import { Button } from './ui/button.tsx';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from './ui/dropdown-menu.tsx';
import { SidebarTrigger, useSidebar } from './ui/sidebar.tsx';

export type Command =
  | 'review'
  | 'assist'
  | 'insights'
  | 'autocomplete'
  | 'autocorrect'
  | 'focus'
  | 'reader'
  | 'fonts'
  | 'version'
  | 'history'
  | 'copy-md'
  | 'copy-rich'
  | 'save-md'
  | 'save-html'
  | 'shortcuts'
  | 'move'
  | 'trash';

const SAVE_LABELS: Record<SaveState, string> = {
  saved: 'Saved',
  editing: 'Editing',
  saving: 'Saving…',
  retrying: 'Not saved — retrying',
};

export function TopBar({
  counts,
  reading,
  focus,
  autocomplete,
  autocorrect,
  mod,
  onCommand,
}: {
  counts: Counts;
  reading: boolean;
  focus: boolean;
  autocomplete: boolean;
  autocorrect: boolean;
  /** ⌘ on Mac, Ctrl elsewhere. */
  mod: string;
  onCommand(c: Command): void;
}) {
  const { backend, saveState, failures } = useLibrary();
  const { open, isMobile } = useSidebar();
  const { theme, setTheme } = useTheme();
  // tauri.conf.json's trafficLightPosition centres the window's buttons in this
  // 48px bar. Its y is not the buttons' top: macOS keeps them a few points
  // below it, so y: 27 was measured to put their centre at 24px.
  const roomForLights = backend.overlayTitleBar && (!open || isMobile);

  return (
    <header
      data-tauri-drag-region
      className={cn(
        'sticky top-0 z-10 flex h-12 shrink-0 items-center gap-1 bg-background/90 px-3 backdrop-blur',
        roomForLights && 'pl-20',
      )}
    >
      {(!open || isMobile) && <SidebarTrigger className="text-muted-foreground" />}
      <span
        data-tauri-drag-region
        className={cn('px-2 text-xs text-muted-foreground', saveState === 'retrying' && 'text-destructive')}
        role="status"
        aria-live="polite"
      >
        {saveState === 'retrying' && failures > 2 ? 'Not saved — can’t reach the library' : SAVE_LABELS[saveState]}
      </span>
      <div data-tauri-drag-region className="h-full flex-1" />
      <Button
        variant="ghost"
        size="sm"
        className="text-xs font-normal text-muted-foreground tabular-nums"
        onClick={() => onCommand('insights')}
        title="Insights"
      >
        {counts.words.toLocaleString()} words<span className="max-sm:hidden"> · {counts.minutes} min read</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCommand('reader')}
        title={reading ? 'Back to editing (Esc)' : `Reader mode (${mod}⇧P)`}
      >
        {reading ? <PencilLineIcon /> : <BookOpenIcon />}
        <span className="max-sm:hidden">{reading ? 'Edit' : 'Read'}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onCommand('review')} title={`Review the draft (${mod}⇧E)`}>
        <MessageSquareTextIcon />
        <span className="max-sm:hidden">Review</span>
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => onCommand('assist')}
        aria-label="Assist"
        title={`Assist: notes and insights (${mod}⇧A)`}
      >
        <PanelRightIcon />
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon-sm" aria-label="More">
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuCheckboxItem checked={focus} onSelect={() => onCommand('focus')}>
            Focus mode <DropdownMenuShortcut>{mod}.</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={autocomplete} onSelect={() => onCommand('autocomplete')}>
            Next-sentence suggestions <DropdownMenuShortcut>{mod}J</DropdownMenuShortcut>
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem checked={autocorrect} onSelect={() => onCommand('autocorrect')}>
            Fix typos as I write
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onSelect={() => onCommand('reader')}>
            Reader mode <DropdownMenuShortcut>{mod}⇧P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('fonts')}>Fonts…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Theme</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as ThemeSetting)}>
            <DropdownMenuRadioItem value="light">Light</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">Same as the system</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand('version')}>
            Save a version <DropdownMenuShortcut>{mod}S</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('history')}>Version history…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand('copy-md')}>Copy as Markdown</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('copy-rich')}>Copy as rich text</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('save-md')}>Save as Markdown…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('save-html')}>Save as web page…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand('shortcuts')}>Keyboard shortcuts</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('move')}>Move to project…</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onCommand('trash')}>
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
