// The file explorer: a Finder-style view of the real filesystem. The Rust
// shell does the listing and the parallel path search; this only draws it.
//
// Search is scoped to the folder you are in. A query with a path in it
// (`docs/report`) matches parent folders; a bare word matches file and folder
// names. Nothing is indexed or written to the library.

import {
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FileArchiveIcon,
  FileCodeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  FolderSearchIcon,
  HardDriveIcon,
  HomeIcon,
  ImageIcon,
  MonitorIcon,
  MusicIcon,
  RefreshCwIcon,
  SearchIcon,
  SparklesIcon,
  VideoIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FileEntry, FilePlace, FilePlaces, FolderSize, LargeFiles } from '../backend.ts';
import { type Sort, sortEntries } from '../lib/files.ts';
import { timeAgo } from '../lib/time.ts';
import { cn } from '../lib/utils.ts';
import { useLibrary } from '../library.tsx';
import { Button } from './ui/button.tsx';
import { Input } from './ui/input.tsx';

const IMAGE = /\.(png|jpe?g|gif|webp|svg|heic|tiff?|bmp)$/i;
const CODE =
  /\.(rs|ts|tsx|js|jsx|mjs|cjs|py|go|rb|java|kt|c|cc|cpp|h|hpp|cs|swift|css|scss|html|json|toml|yaml|yml|sh|zsh|bash|fish|sql)$/i;
const TEXT = /\.(md|mdx|txt|rtf|pdf|doc|docx|pages|epub)$/i;
const ARCHIVE = /\.(zip|tar|gz|bz2|xz|7z|rar|dmg|iso)$/i;
const AUDIO = /\.(mp3|wav|flac|m4a|aac|ogg|aiff)$/i;
const VIDEO = /\.(mp4|mov|mkv|avi|webm|m4v)$/i;

const PLACE_ICON: Record<string, typeof HomeIcon> = {
  home: HomeIcon,
  desktop: MonitorIcon,
  documents: FileTextIcon,
  downloads: DownloadIcon,
  volume: HardDriveIcon,
};

function formatSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}

function parentOf(path: string): string {
  const trimmed = path.replace(/[\\/]+$/, '');
  const index = Math.max(trimmed.lastIndexOf('/'), trimmed.lastIndexOf('\\'));
  if (index < 0) return path;
  if (index === 0) return '/';
  if (index === 2 && /^[A-Za-z]:/.test(trimmed)) return `${trimmed.slice(0, 2)}\\`;
  return trimmed.slice(0, index);
}

function relativeTo(path: string, root: string): string {
  if (!root) return path;
  const relative = path.startsWith(root) ? path.slice(root.length) : path;
  return relative.replace(/^[\\/]+/, '');
}

function iconFor(entry: FileEntry) {
  if (entry.isDir) return FolderIcon;
  if (IMAGE.test(entry.name)) return ImageIcon;
  if (CODE.test(entry.name)) return FileCodeIcon;
  if (TEXT.test(entry.name)) return FileTextIcon;
  if (ARCHIVE.test(entry.name)) return FileArchiveIcon;
  if (AUDIO.test(entry.name)) return MusicIcon;
  if (VIDEO.test(entry.name)) return VideoIcon;
  return FileIcon;
}

function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export function FilesView() {
  const { backend } = useLibrary();
  const service = backend.explorer;
  const picker = useRef<HTMLInputElement>(null);
  const [folderRevision, setFolderRevision] = useState(0);
  const [places, setPlaces] = useState<FilePlaces | null>(null);
  const [path, setPath] = useState('');
  const [pathDraft, setPathDraft] = useState('');
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FileEntry[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showHidden, setShowHidden] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [future, setFuture] = useState<string[]>([]);
  const [sizes, setSizes] = useState<Record<string, FolderSize>>({});
  const [cleanup, setCleanup] = useState(false);
  const [large, setLarge] = useState<LargeFiles | null>(null);
  const [scanning, setScanning] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' });
  const sizesRef = useRef(sizes);
  sizesRef.current = sizes;
  const searchId = useRef(0);

  // Folder sizes are computed in Rust and streamed back; the list never waits
  // for a full walk of a huge tree.
  const requestSizes = useCallback(
    (list: FileEntry[]) => {
      if (!service) return;
      const dirs = list.filter((entry) => entry.isDir && !sizesRef.current[entry.path]).map((entry) => entry.path);
      for (let i = 0; i < dirs.length; i += 24) {
        const batch = dirs.slice(i, i + 24);
        void service
          .folderSizes(batch)
          .then((found) => {
            setSizes((prev) => {
              const next = { ...prev };
              for (const size of found) {
                // A live event may have beaten this response; don't replace a
                // known size with the pending placeholder.
                if (size.bytes == null && next[size.path]?.bytes != null) continue;
                next[size.path] = size;
              }
              return next;
            });
          })
          .catch(() => {});
      }
    },
    [service],
  );

  useEffect(() => {
    if (!service) return;
    return service.onFolderSize((size) => setSizes((prev) => ({ ...prev, [size.path]: size })));
  }, [service]);

  const fetchDir = useCallback(
    async (dir: string, hidden = showHidden) => {
      if (!service) return;
      setCleanup(false);
      setLoading(true);
      setError('');
      setQuery('');
      setResults([]);
      setSelected(null);
      try {
        const list = await service.list(dir, { showHidden: hidden });
        setEntries(list);
        requestSizes(list);
        setPath(dir);
        setPathDraft(dir);
      } catch (err) {
        setError(errorText(err));
      } finally {
        setLoading(false);
      }
    },
    [service, showHidden, requestSizes],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: choosing a folder changes the files held by the same service.
  useEffect(() => {
    if (!service) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const found = await service.places();
        if (cancelled) return;
        setPlaces(found);
        if (!found.home && service.selectFolder) return;
        const home = found.home || '/';
        setPath(home);
        setPathDraft(home);
        setLoading(true);
        const list = await service.list(home, { showHidden: false });
        if (!cancelled) {
          setEntries(list);
          requestSizes(list);
        }
      } catch (err) {
        if (!cancelled) setError(errorText(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [service, requestSizes, folderRevision]);

  const navigate = useCallback(
    (dir: string) => {
      if (!dir || dir === path) return;
      setHistory((all) => (path ? [...all, path] : all));
      setFuture([]);
      void fetchDir(dir);
    },
    [path, fetchDir],
  );

  const goBack = () => {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory(history.slice(0, -1));
    setFuture((all) => [...all, path]);
    void fetchDir(previous);
  };

  const goForward = () => {
    const next = future[future.length - 1];
    if (!next) return;
    setFuture(future.slice(0, -1));
    setHistory((all) => [...all, path]);
    void fetchDir(next);
  };

  const toggleHidden = () => {
    const next = !showHidden;
    setShowHidden(next);
    if (path) void fetchDir(path, next);
  };

  const openEntry = useCallback(
    (entry: FileEntry) => {
      if (entry.isDir) {
        navigate(entry.path);
        return;
      }
      void service?.open(entry.path).catch((err) => setError(errorText(err)));
    },
    [navigate, service],
  );

  useEffect(() => {
    const text = query.trim();
    if (!service || !path || !text) {
      setResults([]);
      setSearching(false);
      return;
    }
    const current = ++searchId.current;
    setSearching(true);
    const timer = setTimeout(() => {
      void service
        .search(path, text, { showHidden })
        .then((found) => {
          if (searchId.current !== current) return;
          setResults(found);
          requestSizes(found);
          setSearching(false);
        })
        .catch((err) => {
          if (searchId.current !== current) return;
          setError(errorText(err));
          setSearching(false);
        });
    }, 180);
    return () => clearTimeout(timer);
  }, [service, path, query, showHidden, requestSizes]);

  const searchMode = query.trim().length > 0;
  const shown = useMemo(
    () => (cleanup ? (large?.files ?? []) : searchMode ? results : entries),
    [cleanup, large, searchMode, results, entries],
  );
  const sorted = useMemo(() => sortEntries(shown, sort, sizes), [shown, sort, sizes]);
  const selectedEntry = sorted.find((entry) => entry.path === selected) ?? null;
  const home = places?.home ?? '/';
  const atRoot = parentOf(path) === path || (!!service?.selectFolder && path === home);
  const cleanupTotal = (large?.files ?? []).reduce((sum, entry) => sum + (entry.size ?? 0), 0);

  const startCleanup = useCallback(async () => {
    if (!service) return;
    const root = places?.home || path || '/';
    setCleanup(true);
    setScanning(true);
    setError('');
    setQuery('');
    setResults([]);
    setSelected(null);
    setSort({ key: 'size', dir: 'desc' });
    try {
      setLarge(await service.largeFiles(root, 100));
    } catch (err) {
      setLarge(null);
      setError(errorText(err));
    } finally {
      setScanning(false);
    }
  }, [service, places?.home, path]);

  const sortBy = (key: Sort['key']) => {
    setSort((current) =>
      current.key === key
        ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: key === 'name' ? 'asc' : 'desc' },
    );
  };

  const SortArrow = sort.dir === 'asc' ? ChevronUpIcon : ChevronDownIcon;

  const folderPicker = service?.selectFolder && (
    <>
      <input
        ref={picker}
        type="file"
        aria-label="Choose folder"
        className="hidden"
        multiple
        {...{ webkitdirectory: '' }}
        onChange={(event) => {
          const files = event.currentTarget.files;
          if (!files?.length) return;
          service.selectFolder?.(files);
          setHistory([]);
          setFuture([]);
          setSizes({});
          setQuery('');
          setError('');
          setSelected(null);
          setCleanup(false);
          setFolderRevision((n) => n + 1);
          event.currentTarget.value = '';
        }}
      />
      <Button variant="outline" size="sm" onClick={() => picker.current?.click()}>
        <FolderIcon /> Choose folder
      </Button>
    </>
  );
  if (!service || (service.selectFolder && !places?.home)) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center p-8 text-center">
        <div className="max-w-sm space-y-3">
          <FolderSearchIcon className="mx-auto size-8 text-muted-foreground" />
          <h2 className="font-serif text-2xl">Browse your files</h2>
          <p className="text-sm text-muted-foreground">
            {service
              ? 'Choose a folder to browse, search and compare file sizes on this device.'
              : 'File access is unavailable on this device.'}
          </p>
          {folderPicker}
        </div>
      </div>
    );
  }

  return (
    <div className="workspace-page flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-1 border-b px-2 py-1.5">
        {folderPicker}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Back"
          title="Back"
          disabled={history.length === 0}
          onClick={goBack}
        >
          <ChevronLeftIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Forward"
          title="Forward"
          disabled={future.length === 0}
          onClick={goForward}
        >
          <ChevronRightIcon />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Up one folder"
          title="Up one folder"
          disabled={atRoot}
          onClick={() => navigate(parentOf(path))}
        >
          <ArrowUpIcon />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Home" title="Home" onClick={() => navigate(home)}>
          <HomeIcon />
        </Button>

        <Input
          value={pathDraft}
          onChange={(event) => setPathDraft(event.target.value)}
          aria-label="Folder path"
          spellCheck={false}
          className="mx-1 h-8 min-w-40 flex-1 font-mono text-xs"
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              navigate(pathDraft.trim());
            }
          }}
        />

        <div className="relative w-full min-w-48 sm:w-auto">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              if (cleanup) setCleanup(false);
            }}
            placeholder="Search this folder"
            aria-label="Search files"
            spellCheck={false}
            autoFocus
            className="h-8 pl-7 text-xs sm:w-56"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setQuery('');
            }}
          />
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          title={showHidden ? 'Hide hidden files' : 'Show hidden files'}
          onClick={toggleHidden}
        >
          {showHidden ? <EyeOffIcon /> : <EyeIcon />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Refresh"
          title={cleanup ? 'Scan again' : 'Refresh'}
          onClick={() => (cleanup ? void startCleanup() : void fetchDir(path))}
        >
          <RefreshCwIcon className={cn((loading || scanning) && 'animate-spin')} />
        </Button>
        {service.reveal && (
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            disabled={!selectedEntry}
            title="Show in Finder"
            onClick={() =>
              selectedEntry && void service.reveal?.(selectedEntry.path).catch((err) => setError(errorText(err)))
            }
          >
            Reveal
          </Button>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="w-44 shrink-0 overflow-y-auto border-r p-2" aria-label="Places">
          <div className="mb-2 border-b pb-2">
            <button
              type="button"
              title="Find the 100 largest files in your home folder"
              onClick={() => void startCleanup()}
              className={cn(
                'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                cleanup ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              <SparklesIcon className="size-3.5 shrink-0" />
              <span>Cleanup</span>
            </button>
            <p className="px-2 pt-1 text-[10px] leading-snug text-muted-foreground">Top 100 largest files</p>
          </div>
          <p className="px-2 py-1 text-[10px] font-medium tracking-wider text-muted-foreground uppercase">Places</p>
          <div className="space-y-0.5">
            {(places?.places ?? []).map((place: FilePlace) => {
              const Icon = PLACE_ICON[place.kind] ?? HardDriveIcon;
              return (
                <button
                  key={`${place.kind}:${place.path}`}
                  type="button"
                  title={place.path}
                  onClick={() => navigate(place.path)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs',
                    path === place.path
                      ? 'bg-muted text-foreground'
                      : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                  )}
                >
                  <Icon className="size-3.5 shrink-0" />
                  <span className="truncate">{place.name}</span>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-2 border-b px-3 py-1.5 text-[10px] text-muted-foreground">
            <span className="min-w-0 flex-1 truncate">
              {cleanup
                ? `Cleanup · largest files in ${home}${large ? ` · ${large.files.length}` : ''}${
                    large && !large.complete ? ' · time limit' : ''
                  }${large ? ` · ${(large.scannedMs / 1000).toFixed(1)}s` : ''}`
                : searchMode
                  ? `${searching ? 'Searching' : 'Results'} in ${path}${searchMode && !searching ? ` · ${results.length}` : ''}`
                  : path}
            </span>
            {error && <span className="text-destructive">{error}</span>}
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)_80px_120px] gap-2 border-b px-3 py-1">
            <button
              type="button"
              onClick={() => sortBy('name')}
              className="flex items-center gap-1 text-left text-[10px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground"
              title="Sort by name"
            >
              Name {sort.key === 'name' && <SortArrow className="size-3" />}
            </button>
            <button
              type="button"
              onClick={() => sortBy('size')}
              className="flex items-center justify-end gap-1 text-right text-[10px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground"
              title="Sort by size"
            >
              {sort.key === 'size' && <SortArrow className="size-3" />} Size
            </button>
            <button
              type="button"
              onClick={() => sortBy('modified')}
              className="flex items-center gap-1 text-left text-[10px] font-medium tracking-wider text-muted-foreground uppercase hover:text-foreground"
              title="Sort by date modified"
            >
              Modified {sort.key === 'modified' && <SortArrow className="size-3" />}
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading || (cleanup && scanning) ? (
              <p className="px-3 py-6 text-sm text-muted-foreground">
                {cleanup ? 'Scanning your home folder for the largest files…' : `Reading ${path}…`}
              </p>
            ) : sorted.length === 0 ? (
              <div className="grid h-full place-items-center px-6 py-12 text-center">
                <div>
                  <FolderIcon className="mx-auto size-6 text-muted-foreground" />
                  <p className="mt-2 text-sm text-muted-foreground">
                    {cleanup
                      ? 'No large files found.'
                      : searchMode
                        ? 'No matches in this folder.'
                        : 'This folder is empty.'}
                  </p>
                </div>
              </div>
            ) : (
              sorted.map((entry) => {
                const Icon = iconFor(entry);
                const folderSize = entry.isDir ? sizes[entry.path] : undefined;
                const sizeLabel = entry.isDir
                  ? folderSize?.bytes != null
                    ? `${folderSize.complete ? '' : '≥ '}${formatSize(folderSize.bytes)}`
                    : '…'
                  : formatSize(entry.size);
                return (
                  <button
                    key={entry.path}
                    type="button"
                    onClick={() => setSelected(entry.path)}
                    onDoubleClick={() => openEntry(entry)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        openEntry(entry);
                      }
                    }}
                    title={entry.path}
                    className={cn(
                      'grid w-full grid-cols-[minmax(0,1fr)_80px_120px] items-center gap-2 border-b border-border/50 px-3 py-1.5 text-left text-xs',
                      selected === entry.path ? 'bg-muted text-foreground' : 'hover:bg-muted/50',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon className={cn('size-4 shrink-0', entry.isDir ? 'text-ai' : 'text-muted-foreground')} />
                      <span className="min-w-0">
                        <span className="block truncate">{entry.name}</span>
                        {(searchMode || cleanup) && (
                          <span className="block truncate text-[10px] text-muted-foreground">
                            {relativeTo(entry.path, cleanup ? home : path) || entry.name}
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className="text-right text-muted-foreground tabular-nums"
                      title={
                        entry.isDir && folderSize?.bytes != null && !folderSize.complete
                          ? 'At least this size — the walk hit its time limit'
                          : undefined
                      }
                    >
                      {sizeLabel}
                    </span>
                    <span className="truncate text-muted-foreground">
                      {entry.modified ? timeAgo(entry.modified) : '—'}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          <div className="flex items-center justify-between border-t px-3 py-1 text-[10px] text-muted-foreground">
            <span>
              {cleanup
                ? `${sorted.length} file${sorted.length === 1 ? '' : 's'} · ${formatSize(cleanupTotal)}`
                : `${sorted.length} item${sorted.length === 1 ? '' : 's'}${searchMode ? ' found' : ''}`}
            </span>
            <span className="truncate">{cleanup ? 'Read-only review — nothing is deleted here' : path}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
