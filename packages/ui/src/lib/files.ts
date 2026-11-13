// Sorting for the file explorer. Folders stay above files, like Finder's
// "keep folders on top"; the chosen column orders each group.

import type { FileEntry, FolderSize } from '../backend.ts';

export type SortKey = 'name' | 'size' | 'modified';
export type SortDir = 'asc' | 'desc';

export interface Sort {
  key: SortKey;
  dir: SortDir;
}

function bytesOf(entry: FileEntry, sizes: Record<string, FolderSize>): number {
  if (entry.isDir) return sizes[entry.path]?.bytes ?? -1;
  return entry.size ?? -1;
}

function compare(a: FileEntry, b: FileEntry, key: SortKey, sizes: Record<string, FolderSize>): number {
  if (key === 'size') return bytesOf(a, sizes) - bytesOf(b, sizes);
  if (key === 'modified') return (a.modified ?? 0) - (b.modified ?? 0);
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true });
}

/** A new array; the input is left alone. */
export function sortEntries(entries: readonly FileEntry[], sort: Sort, sizes: Record<string, FolderSize>): FileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
    if (sort.key === 'size') {
      // A folder whose size is still being calculated belongs after the
      // folders that have one, whichever direction is chosen.
      const aPending = a.isDir ? sizes[a.path]?.bytes == null : a.size == null;
      const bPending = b.isDir ? sizes[b.path]?.bytes == null : b.size == null;
      if (aPending !== bPending) return aPending ? 1 : -1;
    }
    const order = compare(a, b, sort.key, sizes);
    return sort.dir === 'asc' ? order : -order;
  });
}
