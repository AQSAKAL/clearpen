// The live page, for actions outside it (exports, versions, focus mode): the
// editor holding the text, and the title as typed, which may be newer than
// the last save.

import type { ClearpenEditor, EditorUpdate, Suggestion } from '@clearpen/editor';
import { createContext, type ReactNode, type RefObject, useContext, useMemo, useRef } from 'react';

export interface PageEvents {
  update: EditorUpdate;
  accept: { id: string; suggestion: Suggestion & { count?: number } };
  reject: { id: string; suggestion: Suggestion | undefined };
  /** ⌘J: suggest the next sentence now. */
  complete: null;
  /** A click in the text, on a noted passage (its id) or elsewhere (null). */
  note: string | null;
  /** The editor's layout changed: anything placed beside the text should move. */
  geometry: null;
  /** A guided frame changed (started, skipped): show it. */
  guide: null;
}

export interface Page {
  editor: RefObject<ClearpenEditor | null>;
  title: RefObject<string>;
  /** Replaces the title as if the writer typed it. */
  setTitle: RefObject<((title: string) => void) | null>;
  /** What the editor does, for the parts of the window that follow it. */
  emit<K extends keyof PageEvents>(type: K, detail: PageEvents[K]): void;
  on<K extends keyof PageEvents>(type: K, listener: (detail: PageEvents[K]) => void): () => void;
}

const PageContext = createContext<Page | null>(null);

export function EditorRefProvider({ children }: { children: ReactNode }) {
  const editor = useRef<ClearpenEditor | null>(null);
  const title = useRef('');
  const setTitle = useRef<((title: string) => void) | null>(null);
  const page = useMemo<Page>(() => {
    const target = new EventTarget();
    return {
      editor,
      title,
      setTitle,
      emit: (type, detail) => target.dispatchEvent(new CustomEvent(type, { detail })),
      on(type, listener) {
        const handle = (e: Event) => listener((e as CustomEvent).detail);
        target.addEventListener(type, handle);
        return () => target.removeEventListener(type, handle);
      },
    };
  }, []);
  return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}

export function usePage(): Page {
  const page = useContext(PageContext);
  if (!page) throw new Error('usePage needs an EditorRefProvider');
  return page;
}

export const useEditorRef = () => usePage().editor;
