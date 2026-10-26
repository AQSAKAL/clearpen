// Getting an article out: Markdown, rich text and standalone HTML. Exports
// that leave the app carry their images inside them as data URLs.

import { escapeHTML, toDocument, toHTML } from '@margin/core';
import { slugify } from '@margin/db';
import type { Backend } from '../backend.ts';

export const markdownOf = (title: string, content: string) => (title.trim() ? `# ${title.trim()}\n\n` : '') + content;

export const fileName = (title: string, ext: string) => `${slugify(title) || 'untitled'}.${ext}`;

const IMAGE_SRCS = /!\[[^[\]]*\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g;

/** Every image in `content` as a data URL, keyed by its Markdown source. */
async function dataUrls(content: string, backend: Backend): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const [, src] of content.matchAll(IMAGE_SRCS)) {
    if (!src || out.has(src)) continue;
    const data = await backend.media.dataUrl(src).catch(() => null);
    if (data) out.set(src, data);
  }
  return out;
}

const inline = (images: Map<string, string>) => (src: string) =>
  images.get(src) ?? (/^https:\/\//.test(src) ? src : null);

export async function htmlOf(title: string, content: string, backend: Backend): Promise<string> {
  const images = await dataUrls(content, backend);
  return `${title.trim() ? `<h1>${escapeHTML(title.trim())}</h1>\n` : ''}${toHTML(content, { imageSrc: inline(images) })}`;
}

export async function documentOf(title: string, content: string, backend: Backend): Promise<string> {
  return toDocument(title, content, { imageSrc: inline(await dataUrls(content, backend)) });
}

export async function copyMarkdown(title: string, content: string) {
  await navigator.clipboard.writeText(markdownOf(title, content));
}

/** Copies formatted text that pastes into Google Docs, Medium or WordPress, with plain text as a fallback. */
export async function copyRichText(title: string, content: string, backend: Backend) {
  const html = await htmlOf(title, content, backend);
  const plain = markdownOf(title, content);
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) {
    await navigator.clipboard.writeText(plain);
    return;
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    }),
  ]);
}
