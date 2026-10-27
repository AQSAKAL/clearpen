// The library as the UI sees it: projects, the article list, the open
// article, and autosave. Saves are queued per article and sent after a short
// pause; a failed save keeps its changes and retries with a growing delay.

import type { Document, DocumentPatch, DocumentSummary, NewDocument, Project } from '@clearpen/db';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Backend } from './backend.ts';

export type SaveState = 'saved' | 'editing' | 'saving' | 'retrying';

export const SAVE_DELAY_MS = 700;
const MAX_RETRY_MS = 30_000;

export interface LibraryValue {
  backend: Backend;
  projects: Project[];
  docs: DocumentSummary[];
  /** The open article, as last loaded; its live text is in the editor. */
  current: Document | null;
  saveState: SaveState;
  /** How many saves in a row have failed. */
  failures: number;
  open(id: string): Promise<void>;
  create(fields?: NewDocument): Promise<Document>;
  /** Queues changes to the open article. */
  edit(patch: DocumentPatch): void;
  /** Sends every queued change now. */
  flush(): Promise<void>;
  refresh(): Promise<void>;
  createProject(name: string): Promise<Project>;
  renameProject(id: string, name: string): Promise<void>;
  deleteProject(id: string): Promise<number>;
  move(docId: string, projectId: string | null): Promise<void>;
  trash(docId: string): Promise<void>;
  restore(docId: string): Promise<void>;
  purge(docId: string): Promise<void>;
}

const LibraryContext = createContext<LibraryValue | null>(null);

export function LibraryProvider({
  backend,
  onOpen,
  children,
}: {
  backend: Backend;
  /** Called after an article opens, with its id. */
  onOpen?(id: string): void;
  children: ReactNode;
}) {
  const lib = backend.library;
  const [projects, setProjects] = useState<Project[]>([]);
  const [docs, setDocs] = useState<DocumentSummary[]>([]);
  const [current, setCurrent] = useState<Document | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [failures, setFailures] = useState(0);

  const pending = useRef(new Map<string, DocumentPatch>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const saving = useRef<Promise<void> | null>(null);
  const failed = useRef(0);
  const currentRef = useRef<Document | null>(null);
  currentRef.current = current;

  const refresh = useCallback(async () => {
    const [p, d] = await Promise.all([lib.projects.list(), lib.documents.list()]);
    setProjects(p);
    setDocs(d);
  }, [lib]);

  const send = useCallback(async (): Promise<void> => {
    if (saving.current) {
      await saving.current;
      if (pending.current.size) return send();
      return;
    }
    if (!pending.current.size) return;
    const batch = [...pending.current];
    pending.current.clear();
    setSaveState('saving');
    const run = (async () => {
      for (const [id, patch] of batch) {
        try {
          const saved = await lib.documents.update(id, patch);
          setDocs((list) =>
            list
              .map((d) =>
                d.id === id
                  ? {
                      ...d,
                      ...(patch.title !== undefined ? { title: patch.title } : {}),
                      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
                      words: saved.words,
                      excerpt: saved.excerpt,
                      updatedAt: saved.updatedAt,
                    }
                  : d,
              )
              .sort((a, b) => b.updatedAt - a.updatedAt),
          );
        } catch (err) {
          // Keep the changes (newer edits win) and try again later.
          pending.current.set(id, { ...patch, ...pending.current.get(id) });
          console.error('Save failed', err);
        }
      }
    })();
    saving.current = run;
    await run;
    saving.current = null;
    if (pending.current.size) {
      failed.current += 1;
      setFailures(failed.current);
      setSaveState('retrying');
      clearTimeout(timer.current);
      timer.current = setTimeout(() => void send(), Math.min(1000 * 2 ** failed.current, MAX_RETRY_MS));
    } else {
      failed.current = 0;
      setFailures(0);
      setSaveState('saved');
    }
  }, [lib]);

  const flush = useCallback(async () => {
    clearTimeout(timer.current);
    await send();
  }, [send]);

  const edit = useCallback(
    (patch: DocumentPatch) => {
      const doc = currentRef.current;
      if (!doc) return;
      pending.current.set(doc.id, { ...pending.current.get(doc.id), ...patch });
      // The editor holds the text; the brief lives only here, so show it at once.
      if (patch.brief) setCurrent({ ...doc, brief: patch.brief });
      if (failed.current === 0) {
        setSaveState('editing');
        clearTimeout(timer.current);
        timer.current = setTimeout(() => void send(), SAVE_DELAY_MS);
      }
    },
    [send],
  );

  const open = useCallback(
    async (id: string) => {
      await flush();
      const doc = await lib.documents.get(id);
      if (!doc || doc.deletedAt !== null) throw new Error('That article is no longer in the library.');
      setCurrent(doc);
      onOpen?.(id);
    },
    [flush, lib, onOpen],
  );

  const create = useCallback(
    async (fields: NewDocument = {}) => {
      await flush();
      const doc = await lib.documents.create(fields);
      await refresh();
      setCurrent(doc);
      onOpen?.(doc.id);
      return doc;
    },
    [flush, lib, refresh, onOpen],
  );

  /** After the open article leaves the list: open the newest remaining, or a blank one. */
  const reopen = useCallback(
    async (list: DocumentSummary[]) => {
      const next = list[0];
      if (next) await open(next.id);
      else await create();
    },
    [open, create],
  );

  const value = useMemo<LibraryValue>(
    () => ({
      backend,
      projects,
      docs,
      current,
      saveState,
      failures,
      open,
      create,
      edit,
      flush,
      refresh,
      async createProject(name) {
        const p = await lib.projects.create(name);
        await refresh();
        return p;
      },
      async renameProject(id, name) {
        await lib.projects.rename(id, name);
        await refresh();
      },
      async deleteProject(id) {
        await flush();
        const { moved } = await lib.projects.remove(id);
        await refresh();
        const cur = currentRef.current;
        if (cur?.projectId === id) setCurrent({ ...cur, projectId: null });
        return moved;
      },
      async move(docId, projectId) {
        await flush();
        await lib.documents.update(docId, { projectId });
        const cur = currentRef.current;
        if (cur?.id === docId) setCurrent({ ...cur, projectId });
        await refresh();
      },
      async trash(docId) {
        await flush();
        await lib.documents.trash(docId);
        const list = await lib.documents.list();
        await refresh();
        if (currentRef.current?.id === docId) await reopen(list);
      },
      async restore(docId) {
        await lib.documents.restore(docId);
        await refresh();
      },
      async purge(docId) {
        await lib.documents.purge(docId);
      },
    }),
    [backend, lib, projects, docs, current, saveState, failures, open, create, edit, flush, refresh, reopen],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return <LibraryContext.Provider value={value}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): LibraryValue {
  const v = useContext(LibraryContext);
  if (!v) throw new Error('useLibrary needs a LibraryProvider');
  return v;
}
