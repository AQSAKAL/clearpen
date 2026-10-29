// The page: the title and the CodeMirror editor. The editor holds the live
// text; every change is queued for autosave, and the text is only reloaded
// when a different article opens.

import { altFromFileName, countWords, ImageError, imageBlock } from '@clearpen/core';
import { type ClearpenEditor, createEditor } from '@clearpen/editor';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { usePage } from '../editor-ref.tsx';
import { useLibrary } from '../library.tsx';
import { usePrices } from '../tickers.ts';
import { Textarea } from './ui/textarea.tsx';

export interface Counts {
  words: number;
  minutes: number;
}

const WORDS_PER_MINUTE = 238;

export function countsOf(text: string): Counts {
  const words = countWords(text);
  return { words, minutes: Math.max(1, Math.round(words / WORDS_PER_MINUTE)) };
}

export function ArticleEditor({ onCounts }: { onCounts(c: Counts): void }) {
  const { backend, current, edit } = useLibrary();
  const page = usePage();
  const ref = page.editor;
  const host = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(current?.title ?? '');
  const loading = useRef(false);
  const docId = useRef<string | null>(null);
  const countsTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef({ edit, onCounts });
  latest.current = { edit, onCounts };
  const prices = usePrices();

  // One editor for the life of the page.
  useEffect(() => {
    if (!host.current) return;
    const recount = (ed: ClearpenEditor) => {
      clearTimeout(countsTimer.current);
      countsTimer.current = setTimeout(() => latest.current.onCounts(countsOf(ed.getText())), 120);
    };
    const ed: ClearpenEditor = createEditor(host.current, {
      doc: '',
      placeholder: 'Start writing…',
      resolveImage: (src) => backend.media.url(src),
      onUpdate(u) {
        page.emit('update', u);
        if (!u.docChanged || loading.current) return;
        latest.current.edit({ content: ed.getText() });
        recount(ed);
      },
      onAccept: (id, suggestion) => page.emit('accept', { id, suggestion }),
      onReject: (id, suggestion) => page.emit('reject', { id, suggestion }),
      onNoteClick: (id) => page.emit('note', id),
      onGeometry: () => page.emit('geometry', null),
      onRequestCompletion() {
        page.emit('complete', null);
        return true;
      },
      onImages(files, from, to) {
        void addImages(ed, files, from, to);
      },
    });
    ref.current = ed;

    async function addImages(ed: ClearpenEditor, files: File[], from: number, to: number) {
      const forDoc = docId.current;
      const lines: string[] = [];
      for (const file of files) {
        try {
          const img = await backend.media.add(file);
          const alt = altFromFileName(file.name);
          lines.push(`![${alt}](${img.src})`);
        } catch (err) {
          toast.error(err instanceof ImageError ? err.message : 'Couldn’t add that image.');
        }
      }
      // The writer moved to another article while the images were stored.
      if (!lines.length || docId.current !== forDoc) return;
      ed.replace(from, to, imageBlock(ed.getText(), from, to, lines));
      ed.focus();
      toast(
        lines.length > 1 ? `${lines.length} images added` : 'Image added — describe it in the [ ] for screen readers',
      );
    }

    return () => {
      clearTimeout(countsTimer.current);
      ref.current = null;
      ed.destroy();
    };
  }, [backend, ref, page]);

  // Load the text when a different article opens.
  useEffect(() => {
    const ed = ref.current;
    if (!ed || !current || docId.current === current.id) return;
    docId.current = current.id;
    loading.current = true;
    ed.setText(current.content);
    loading.current = false;
    setTitle(current.title);
    onCounts(countsOf(current.content));
    if (!current.title && !current.content) titleRef.current?.focus();
  }, [current, ref, onCounts]);

  // Prices follow the article's mode and the setting. Loading an article
  // resets the editor's, so they're applied again after each load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the article's id stands for the load above.
  useEffect(() => {
    ref.current?.setTickers(prices);
  }, [prices, current?.id, ref]);

  // Let actions outside the page read and replace the title.
  page.title.current = title;
  useEffect(() => {
    page.setTitle.current = (value: string) => {
      setTitle(value);
      latest.current.edit({ title: value.trim() });
    };
    return () => {
      page.setTitle.current = null;
    };
  }, [page]);

  // Keep the title textarea as tall as its text.
  // biome-ignore lint/correctness/useExhaustiveDependencies: measure again whenever the title changes.
  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [title]);

  return (
    <div className="mx-auto w-full max-w-[700px] px-6 pt-10 pb-[40vh] sm:px-8">
      <Textarea
        ref={titleRef}
        value={title}
        rows={1}
        placeholder="Title"
        aria-label="Title"
        spellCheck
        className="mb-4 min-h-0 resize-none overflow-hidden rounded-none border-0 bg-transparent p-0 font-write text-[calc(36px*var(--f-write-scale))] leading-[1.15] font-semibold tracking-tight shadow-none focus-visible:ring-0 md:text-[calc(36px*var(--f-write-scale))] dark:bg-transparent"
        onChange={(e) => {
          const value = e.target.value.replace(/\s*\n\s*/g, ' ');
          setTitle(value);
          edit({ title: value.trim() });
        }}
        onKeyDown={(e) => {
          const el = e.currentTarget;
          const atEnd = el.selectionStart === el.value.length;
          if (e.key === 'Enter' || (e.key === 'ArrowDown' && atEnd)) {
            e.preventDefault();
            const ed = ref.current;
            if (ed) {
              ed.setSelection(0);
              ed.focus();
            }
          }
        }}
      />
      <div ref={host} className="editor" />
    </div>
  );
}
