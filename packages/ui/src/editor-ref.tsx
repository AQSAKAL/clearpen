// The live page, for actions outside it (exports, versions, focus mode): the
// editor holding the text, and the title as typed, which may be newer than
// the last save.

import type { MarginEditor } from '@margin/editor';
import { createContext, type ReactNode, type RefObject, useContext, useMemo, useRef } from 'react';

export interface Page {
  editor: RefObject<MarginEditor | null>;
  title: RefObject<string>;
  /** Replaces the title as if the writer typed it. */
  setTitle: RefObject<((title: string) => void) | null>;
}

const PageContext = createContext<Page | null>(null);

export function EditorRefProvider({ children }: { children: ReactNode }) {
  const editor = useRef<MarginEditor | null>(null);
  const title = useRef('');
  const setTitle = useRef<((title: string) => void) | null>(null);
  const page = useMemo(() => ({ editor, title, setTitle }), []);
  return <PageContext.Provider value={page}>{children}</PageContext.Provider>;
}

export function usePage(): Page {
  const page = useContext(PageContext);
  if (!page) throw new Error('usePage needs an EditorRefProvider');
  return page;
}

export const useEditorRef = () => usePage().editor;
