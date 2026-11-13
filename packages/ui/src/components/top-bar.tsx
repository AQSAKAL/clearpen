// The bar above the page: save state, word count, reader mode and the ⋯ menu.

import type { Mode } from '@clearpen/core';
import {
  BookOpenIcon,
  BotIcon,
  MessageSquareTextIcon,
  MoreHorizontalIcon,
  NewspaperIcon,
  PanelRightIcon,
  PencilLineIcon,
} from 'lucide-react';
import { cn } from '../lib/utils.ts';
import { type SaveState, useLibrary } from '../library.tsx';
import { type ThemeSetting, useTheme } from '../theme.tsx';
import type { Counts } from './article-editor.tsx';
import { BrandXIcon } from './brand-icons.tsx';
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

export type Command =
  | 'review'
  | 'assist'
  | 'insights'
  | 'sources'
  | 'terminal'
  | 'news'
  | 'ai-runner'
  | 'autocomplete'
  | 'autocorrect'
  | 'prices'
  | 'focus'
  | 'reader'
  | 'fonts'
  | 'version'
  | 'history'
  | 'copy-md'
  | 'copy-rich'
  | 'copy-substack'
  | 'copy-linkedin'
  | 'copy-x'
  | 'save-md'
  | 'save-html'
  | 'shortcuts'
  | 'example'
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
  prices,
  mode,
  mod,
  onCommand,
}: {
  counts: Counts;
  reading: boolean;
  focus: boolean;
  autocomplete: boolean;
  autocorrect: boolean;
  prices: boolean;
  /** The article's writing mode: it may turn an aid off. */
  mode: Mode;
  /** ⌘ on Mac, Ctrl elsewhere. */
  mod: string;
  onCommand(c: Command): void;
}) {
  const { backend, saveState, failures } = useLibrary();
  const { theme, setTheme } = useTheme();
  return (
    <>
      <span
        data-tauri-drag-region
        className={cn(
          'hidden text-xs text-muted-foreground @[640px]:inline',
          saveState === 'retrying' && 'inline text-destructive',
        )}
        role="status"
        aria-live="polite"
      >
        {saveState === 'retrying' && failures > 2 ? 'Not saved — can’t reach the library' : SAVE_LABELS[saveState]}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="text-xs font-normal text-muted-foreground tabular-nums"
        onClick={() => onCommand('insights')}
        title="Insights"
      >
        {counts.words.toLocaleString()} words
        <span className="hidden @[640px]:inline"> · {counts.minutes} min read</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCommand('reader')}
        title={reading ? 'Back to editing (Esc)' : `Reader mode (${mod}⇧P)`}
      >
        {reading ? <PencilLineIcon /> : <BookOpenIcon />}
        <span className="hidden @[640px]:inline">{reading ? 'Edit' : 'Read'}</span>
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onCommand('review')} title={`Review the draft (${mod}⇧E)`}>
        <MessageSquareTextIcon />
        <span className="hidden @[640px]:inline">Review</span>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onCommand('assist')}
        aria-label="Assist"
        title={`Assist: notes, insights and sources (${mod}⇧A)`}
      >
        <PanelRightIcon /> <span className="hidden @[640px]:inline">Assist</span>
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
          <DropdownMenuCheckboxItem
            checked={autocomplete && mode.aids.next}
            disabled={!mode.aids.next}
            onSelect={() => onCommand('autocomplete')}
          >
            Next-sentence suggestions{' '}
            {mode.aids.next ? (
              <DropdownMenuShortcut>{mod}J</DropdownMenuShortcut>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground">off in {mode.label}</span>
            )}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={autocorrect && mode.aids.typos}
            disabled={!mode.aids.typos}
            onSelect={() => onCommand('autocorrect')}
          >
            Fix typos as I write
            {!mode.aids.typos && <span className="ml-auto text-xs text-muted-foreground">off in {mode.label}</span>}
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={prices && mode.aids.tickers}
            disabled={!mode.aids.tickers}
            onSelect={() => onCommand('prices')}
          >
            Live prices beside tickers
            {!mode.aids.tickers && <span className="ml-auto text-xs text-muted-foreground">investment notes only</span>}
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem onSelect={() => onCommand('reader')}>
            Reader mode <DropdownMenuShortcut>{mod}⇧P</DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('sources')}>Sources…</DropdownMenuItem>
          {(backend.terminal || backend.webRunnerUrl) && (
            <DropdownMenuItem onSelect={() => onCommand('ai-runner')}>
              <BotIcon /> Run opencode (AI Runner)
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => onCommand('news')}>
            <NewspaperIcon /> Markets and economy headlines
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
          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs text-muted-foreground">Copy for</DropdownMenuLabel>
          <DropdownMenuItem onSelect={() => onCommand('copy-substack')}>Substack post</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('copy-linkedin')}>LinkedIn post</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('copy-x')}>
            <BrandXIcon className="size-4" /> X post (plain text)
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('save-md')}>Save as Markdown…</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('save-html')}>Save as web page…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand('shortcuts')}>Keyboard shortcuts</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onCommand('example')}>Start from an example…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => onCommand('move')}>Move to project…</DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => onCommand('trash')}>
            Move to trash
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
}
