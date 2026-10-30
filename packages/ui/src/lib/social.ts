// Getting an article onto a social platform. Substack and LinkedIn take rich
// HTML on the clipboard, so the article goes out with its structure and, where
// the platform accepts them, its images. X takes plain text and no formatting,
// so it gets clean text — its own composers do the rest.

import { toHTML } from '@clearpen/core';
import type { Backend } from '../backend.ts';

export type SocialPlatform = 'substack' | 'linkedin' | 'x';

const IMAGE_SRCS = /!\[[^[\]]*\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g;

/** Every local image in `content` as a data URL; remote images keep their address. */
async function imageResolver(content: string, backend: Backend): Promise<(src: string) => string | null> {
  const local = new Map<string, string>();
  for (const [, src] of content.matchAll(IMAGE_SRCS)) {
    if (!src || local.has(src)) continue;
    const data = await backend.media.dataUrl(src).catch(() => null);
    if (data) local.set(src, data);
  }
  return (src) => local.get(src) ?? (/^https?:\/\//i.test(src) ? src : null);
}

const HEADING = { '1': '1.75em', '2': '1.45em', '3': '1.2em', '4': '1.08em', '5': '1em', '6': '1em' };

function styleDocument(doc: Document, platform: SocialPlatform) {
  const set = (el: Element, css: string) => {
    (el as HTMLElement).style.cssText += `;${css}`;
  };
  for (const el of doc.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    const tag = el.tagName.toLowerCase();
    const level = tag[1] as keyof typeof HEADING;
    if (platform === 'linkedin') {
      // LinkedIn posts have no headings: keep the weight, drop the size.
      const p = doc.createElement('p');
      const strong = doc.createElement('strong');
      strong.innerHTML = el.innerHTML;
      p.appendChild(strong);
      set(p, 'margin:0 0 12px;font-size:1em;line-height:1.5');
      el.replaceWith(p);
      continue;
    }
    set(el, `font-size:${HEADING[level]};font-weight:700;line-height:1.25;margin:1.1em 0 0.5em;color:#111`);
  }
  for (const el of doc.querySelectorAll('p')) set(el, 'margin:0 0 12px;line-height:1.6;font-size:1em;color:#222');
  for (const el of doc.querySelectorAll('strong,b')) set(el, 'font-weight:700');
  for (const el of doc.querySelectorAll('em,i')) set(el, 'font-style:italic');
  for (const el of doc.querySelectorAll('u')) set(el, 'text-decoration:underline');
  for (const el of doc.querySelectorAll('del,s')) set(el, 'text-decoration:line-through');
  for (const el of doc.querySelectorAll('a')) set(el, 'color:#2563eb;text-decoration:underline');
  for (const el of doc.querySelectorAll('ul,ol')) set(el, 'margin:0 0 12px;padding-left:22px;line-height:1.6');
  for (const el of doc.querySelectorAll('li')) set(el, 'margin:0 0 4px');
  for (const el of doc.querySelectorAll('blockquote'))
    set(el, 'margin:0 0 12px;padding:4px 0 4px 16px;border-left:3px solid #d1d5db;color:#555');
  for (const el of doc.querySelectorAll('code'))
    set(
      el,
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:0.9em;background:#f3f4f6;padding:1px 4px;border-radius:4px',
    );
  for (const el of doc.querySelectorAll('pre'))
    set(el, 'margin:0 0 12px;padding:12px;background:#f6f8fa;border-radius:6px;overflow:auto;font-size:0.88em');
  for (const el of doc.querySelectorAll('pre code')) set(el, 'background:none;padding:0');
  for (const el of doc.querySelectorAll('table')) set(el, 'border-collapse:collapse;width:100%;margin:0 0 12px');
  for (const el of doc.querySelectorAll('th,td')) set(el, 'border:1px solid #ddd;padding:6px 8px;text-align:left');
  for (const el of doc.querySelectorAll('th')) set(el, 'background:#f6f8fa;font-weight:700');
  for (const el of doc.querySelectorAll('img'))
    set(el, 'max-width:100%;height:auto;display:block;margin:0 0 12px;border-radius:4px');
  for (const el of doc.querySelectorAll('hr')) set(el, 'border:0;border-top:1px solid #ddd;margin:20px 0');
}

/** The article as self-contained HTML a Substack or LinkedIn editor can take. */
export async function socialHtml(
  title: string,
  content: string,
  backend: Backend,
  platform: Exclude<SocialPlatform, 'x'>,
): Promise<string> {
  // Substack has a title field of its own; a heading here would duplicate it.
  const heading = platform !== 'substack' && title.trim() ? `# ${title.trim()}\n\n` : '';
  const html = toHTML(`${heading}${content}`, { imageSrc: await imageResolver(content, backend) });
  const doc = new DOMParser().parseFromString(html, 'text/html');

  // A clipboard full of multi-megabyte data URLs can fail to paste at all.
  // If the images are large, keep only the ones that live at an address.
  const inlineBytes = [...doc.querySelectorAll('img')].reduce(
    (n, img) => n + ((img.getAttribute('src') ?? '').startsWith('data:') ? (img.getAttribute('src')?.length ?? 0) : 0),
    0,
  );
  if (inlineBytes > 4_000_000) {
    for (const img of doc.querySelectorAll('img')) {
      if ((img.getAttribute('src') ?? '').startsWith('data:')) {
        const alt = img.getAttribute('alt')?.trim();
        img.replaceWith(doc.createTextNode(alt ? `[image: ${alt}]` : '[image]'));
      }
    }
  }

  styleDocument(doc, platform);
  return doc.body.innerHTML;
}

/** The article as plain text: what X's composer expects. */
export function socialText(title: string, content: string): string {
  const heading = title.trim() ? `# ${title.trim()}\n\n` : '';
  const doc = new DOMParser().parseFromString(toHTML(`${heading}${content}`), 'text/html');
  const out: string[] = [];
  const line = () => {
    if (out.length && !out[out.length - 1]!.endsWith('\n')) out.push('\n');
  };
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push(node.textContent ?? '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (tag === 'br') {
      out.push('\n');
      return;
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') ?? '';
      const text = (el.textContent ?? '').trim();
      out.push(text);
      if (/^https?:/i.test(href) && href !== text) out.push(` (${href})`);
      return;
    }
    if (tag === 'img') {
      const alt = el.getAttribute('alt')?.trim();
      out.push(alt ? `[image: ${alt}]` : '[image]');
      return;
    }
    const block = ['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'tr'].includes(tag);
    if (block) line();
    for (const child of el.childNodes) walk(child);
    if (block) line();
  };
  walk(doc.body);
  return out
    .join('')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Copies the article for a platform, and returns what to tell the writer. */
export async function copyForSocial(
  platform: SocialPlatform,
  title: string,
  content: string,
  backend: Backend,
): Promise<string> {
  if (platform === 'x') {
    const text = socialText(title, content);
    await navigator.clipboard.writeText(text);
    return text.length > 280
      ? `Copied as plain text (${text.length} characters) — X will need it split, and images uploaded separately`
      : 'Copied as plain text for X — add images in the post editor';
  }

  const html = await socialHtml(title, content, backend, platform);
  const plain = socialText(title, content);
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard.write) {
    await navigator.clipboard.writeText(plain);
    return 'Copied as plain text — this system can’t copy rich text';
  }
  await navigator.clipboard.write([
    new ClipboardItem({
      'text/html': new Blob([html], { type: 'text/html' }),
      'text/plain': new Blob([plain], { type: 'text/plain' }),
    }),
  ]);
  return platform === 'substack'
    ? 'Copied for Substack — paste into a new post'
    : 'Copied for LinkedIn — paste, then add images if the post editor drops them';
}
