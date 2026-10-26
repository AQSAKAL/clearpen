// Reader mode: the article as a reader will see it.

import { toHTML } from '@clearpen/core';
import { useEffect, useMemo, useRef } from 'react';
import { useLibrary } from '../library.tsx';
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
  const html = useMemo(() => toHTML(content, { imageSrc: (src) => backend.media.url(src) }), [content, backend]);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => ref.current?.focus(), []);

  return (
    <article
      ref={ref}
      tabIndex={-1}
      onDoubleClick={onExit}
      className="prose prose-stone dark:prose-invert mx-auto w-full max-w-[700px] px-6 pt-10 pb-32 font-read text-[20px] leading-[1.7] outline-none sm:px-8 prose-headings:font-read prose-img:rounded-md"
    >
      <h1 className="mb-2 text-[40px] leading-[1.15]">{title || 'Untitled'}</h1>
      <p className="mt-0 font-sans text-sm text-muted-foreground">
        {counts.words.toLocaleString()} words · {counts.minutes} min read
      </p>
      {content.trim() ? (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: core's renderer escapes everything and allows only safe URLs.
        <div dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="text-muted-foreground">Nothing to read yet.</p>
      )}
    </article>
  );
}
