// Adding, refreshing and removing the open article's sources — from the
// Sources tab, or from a link the writer put in the text. A page is fetched
// once and kept with the article; what it lands in is the article as it is
// when the fetch is done, not as it was when it started.

import { countWords, MAX_SOURCES, type Source } from '@clearpen/core';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { useLibrary } from './library.tsx';
import { sourceFromPage, sourceFromText } from './sources.ts';

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** A typed or pasted address as the page to fetch: "example.com/page" gets its https://. */
export const pageUrl = (typed: string) => {
  const t = typed.trim().replace(/^<(.*)>$/, '$1');
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
};

export function useSourceActions() {
  const { backend, current, edit } = useLibrary();
  const latest = useRef(current);
  latest.current = current;
  const [busy, setBusy] = useState<string | null>(null);
  const sources = current?.brief.sources ?? [];
  const full = sources.length >= MAX_SOURCES;

  /** Changes the sources of article `id`, unless another article has opened meanwhile. */
  const change = useCallback(
    (id: string, f: (list: Source[]) => Source[]) => {
      const doc = latest.current;
      if (!doc || doc.id !== id) return false;
      edit({ brief: { ...doc.brief, sources: f(doc.brief.sources ?? []) } });
      return true;
    },
    [edit],
  );

  const fetchInto = useCallback(
    async (id: string, href: string, replace?: Source): Promise<boolean> => {
      if (!backend.fetchPage) return false;
      setBusy(href);
      try {
        const fresh = sourceFromPage(await backend.fetchPage(href));
        const source = replace ? { ...fresh, id: replace.id } : fresh;
        const done = change(id, (list) =>
          replace ? list.map((s) => (s.id === replace.id ? source : s)) : [...list, source],
        );
        if (done)
          toast(
            `${replace ? 'Refreshed' : 'Added'} “${source.title}” — ${countWords(source.markdown).toLocaleString()} words`,
          );
        return done;
      } catch (err) {
        toast.error(`Couldn’t ${replace ? 'refresh' : 'add'} that page: ${message(err)}`, {
          description: 'You can paste its text instead.',
        });
        return false;
      } finally {
        setBusy(null);
      }
    },
    [backend, change],
  );

  /** Is the page at this address one of the open article's sources? */
  const has = useCallback((typed: string) => {
    const href = pageUrl(typed);
    return (latest.current?.brief.sources ?? []).some((s) => s.url === href);
  }, []);

  /** Fetches a page and adds it; false, with the reason shown, when it can't. */
  const addPage = useCallback(
    async (typed: string): Promise<boolean> => {
      const doc = latest.current;
      if (!typed.trim() || !doc) return false;
      if ((doc.brief.sources ?? []).length >= MAX_SOURCES) {
        toast(`That’s ${MAX_SOURCES} sources — remove one to add another`);
        return false;
      }
      if (has(typed)) {
        toast('That page is already one of this article’s sources');
        return false;
      }
      return fetchInto(doc.id, pageUrl(typed));
    },
    [fetchInto, has],
  );

  const addText = useCallback(
    (title: string, text: string): boolean => {
      const doc = latest.current;
      if (!text.trim() || !doc || (doc.brief.sources ?? []).length >= MAX_SOURCES) return false;
      const source = sourceFromText(title, text);
      const done = change(doc.id, (list) => [...list, source]);
      if (done) toast(`Added “${source.title}”`);
      return done;
    },
    [change],
  );

  const refresh = useCallback(
    (source: Source) => (latest.current ? fetchInto(latest.current.id, source.url, source) : Promise.resolve(false)),
    [fetchInto],
  );

  const remove = useCallback(
    (source: Source) => latest.current && change(latest.current.id, (list) => list.filter((x) => x.id !== source.id)),
    [change],
  );

  return { sources, busy, full, canFetch: !!backend.fetchPage, has, addPage, addText, refresh, remove };
}
