// A television-news rail for the economy pages. Four RSS feeds are fetched in
// parallel and rolled vertically; nothing is written to the library, and the
// headlines are gone when the rail closes.
//
// The roll is two copies of the same list in one animated column. Translating
// it by half its height loops seamlessly. Hover pauses it; reduced motion
// leaves a plain scrollable list.

import { NewspaperIcon, RotateCwIcon, XIcon } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FEEDS, type FeedItem, loadFeeds } from '../feed.ts';
import { timeAgo } from '../lib/time.ts';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';

const REFRESH_MS = 10 * 60 * 1000;

const TONE: Record<string, string> = {
  wsj: 'bg-[#0274b6]',
  ft: 'bg-[#b8514a]',
  marketwatch: 'bg-[#0f8f87]',
  cnbc: 'bg-[#2f6fde]',
};

function Roll({ items, onOpen }: { items: FeedItem[]; onOpen(item: FeedItem): void }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id} className="border-b border-border/60">
          <button
            type="button"
            className="group block w-full px-3 py-2 text-left hover:bg-muted/50"
            onClick={() => onOpen(item)}
            title={item.summary}
          >
            <span className="flex items-center gap-1.5 text-[10px] tracking-wider text-muted-foreground uppercase">
              <span className={cn('size-1.5 shrink-0 rounded-full', TONE[item.source])} />
              {item.sourceName}
              {item.at && <span className="ml-auto tracking-normal normal-case">{timeAgo(item.at)}</span>}
            </span>
            <span className="mt-1 block text-[13px] leading-[1.35] text-foreground">{item.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function NewsFeed({ onClose }: { onClose(): void }) {
  const { backend } = useLibrary();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [failed, setFailed] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const abort = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setLoading(true);
    try {
      const result = await loadFeeds(backend, controller.signal);
      if (controller.signal.aborted) return;
      setItems(result.items);
      setFailed(result.failed);
      setUpdatedAt(Date.now());
    } catch {
      if (!controller.signal.aborted) setFailed(FEEDS.map((feed) => feed.id));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
      if (abort.current === controller) abort.current = null;
    }
  }, [backend]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => {
      clearInterval(timer);
      abort.current?.abort();
    };
  }, [refresh]);

  const open = (item: FeedItem) => void backend.openLink(item.url);

  return (
    <aside aria-label="World financial news" className="flex w-[280px] shrink-0 flex-col border-l bg-background">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b px-3">
        <span className="relative flex size-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium">Markets & economy</p>
          <p className="text-[10px] text-muted-foreground">Live headlines, not saved</p>
        </div>
        <div className="ml-auto flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh headlines"
            title="Refresh headlines"
            onClick={() => void refresh()}
          >
            <RotateCwIcon className={cn(loading && items.length > 0 && 'animate-spin')} />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="Hide headlines" title="Hide headlines" onClick={onClose}>
            <XIcon />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-3 py-1.5 text-[10px] text-muted-foreground">
        {FEEDS.map((feed) => (
          <span key={feed.id} className="flex items-center gap-1">
            <span className={cn('size-1 rounded-full', TONE[feed.id])} />
            {feed.short}
          </span>
        ))}
      </div>

      <div className="news-rail-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {items.length === 0 ? (
          <div className="grid h-full place-items-center p-4 text-center">
            <div>
              <NewspaperIcon className="mx-auto size-5 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                {loading ? 'Fetching headlines…' : 'The feeds didn’t answer.'}
              </p>
              {!loading && (
                <p className="mt-1 text-xs text-muted-foreground/80">
                  {backend.fetchPage ? 'Check your connection and try again.' : 'Live feeds run in the desktop app.'}
                </p>
              )}
              {!loading && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void refresh()}>
                  <RotateCwIcon /> Try again
                </Button>
              )}
            </div>
          </div>
        ) : (
          <Roll items={items} onOpen={open} />
        )}
      </div>

      {updatedAt && (
        <div className="border-t px-3 py-1 text-[10px] text-muted-foreground">
          Updated {timeAgo(updatedAt)}
          {failed.length > 0 && ` · ${failed.length} feed${failed.length === 1 ? '' : 's'} unreachable`}
        </div>
      )}
    </aside>
  );
}
