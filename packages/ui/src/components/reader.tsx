// Reader mode: the article as a reader will see it.

import { toHTML } from '@clearpen/core';
import { useEffect, useMemo, useRef } from 'react';
import { useLibrary } from '../library.tsx';
import { usePrices } from '../tickers.ts';
import type { Counts } from './article-editor.tsx';

export function Reader({
  title,
  content,
  counts,
  onExit,
}: {
  title: string;
  content: string;
  counts: Counts;
  onExit(): void;
}) {
  const { backend } = useLibrary();
  const prices = usePrices();
  const html = useMemo(
    () => toHTML(content, { imageSrc: (src) => backend.media.url(src), tickers: prices }),
    [content, backend, prices],
  );
  const ref = useRef<HTMLElement>(null);

  useEffect(() => ref.current?.focus(), []);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: the click it handles is a link's, which Enter on the link also fires.
    <article
      ref={ref}
      tabIndex={-1}
      onDoubleClick={onExit}
      // A link opens in the browser; followed in place, it would take the app's window with it.
      onClick={(e) => {
        const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
        if (!a) return;
        e.preventDefault();
        const href = a.getAttribute('href') || '';
        if (/^(https?:|mailto:)/i.test(href)) void backend.openLink(href);
      }}
      className="prose prose-stone dark:prose-invert mx-auto w-full max-w-[700px] px-6 pt-10 pb-32 font-read text-[calc(18px*var(--f-read-scale))] leading-[1.7] outline-none sm:px-8 prose-headings:font-read prose-img:rounded-md [&_:is(h1,h2,h3,h4,h5,h6)_strong]:font-black"
    >
      <h1 className="mb-2 text-[calc(36px*var(--f-read-scale))] leading-[1.15]">{title || 'Untitled'}</h1>
      <p className="mt-0 font-sans text-sm text-muted-foreground">
        {counts.words.toLocaleString()} words · {counts.minutes} min read
      </p>
      {content.trim() ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: core's renderer escapes everything, allows only safe URLs, and adds only TradingView's ticker tag.
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-muted-foreground">Nothing to read yet.</p>
      )}
    </article>
  );
}
