// A web page as one of the writer's sources: fetched once, its main text kept
// as Markdown — headings, paragraphs, lists, quotes, code and tables — and the
// page's menus, scripts and footers left behind. Done here, where the DOM is:
// a parser, not a pattern, takes a page apart.

import { MAX_SOURCE_CHARS, type Source } from '@clearpen/core';
import type { FetchedPage } from './backend.ts';

/** The most of a page Clearpen reads; a longer one is cut. */
export const MAX_PAGE_CHARS = 5_000_000;

const PAGE_ACCEPT = 'text/html,application/xhtml+xml,text/markdown,text/plain;q=0.9,*/*;q=0.5';

/** `fetchPage` for a backend, on whichever fetch can reach the web from there. */
export function pageFetcher(fetchImpl: typeof fetch) {
  return async (url: string, { signal }: { signal?: AbortSignal } = {}): Promise<FetchedPage> => {
    if (!/^https?:\/\//i.test(url)) throw new Error('Only web pages (http or https) can be added.');
    const res = await fetchImpl(url, {
      headers: { Accept: PAGE_ACCEPT, 'User-Agent': 'Mozilla/5.0 (compatible; Clearpen)' },
      ...(signal ? { signal } : {}),
    });
    if (!res.ok) throw new Error(`The page answered ${res.status}${res.statusText ? ` ${res.statusText}` : ''}.`);
    const text = await res.text();
    return { url: res.url || url, type: res.headers.get('content-type') ?? '', text: text.slice(0, MAX_PAGE_CHARS) };
  };
}

// Cloudflare hides an address (or anything shaped like one, such as the
// password@host of a connection string) behind a script; the page's text
// says "[email protected]" until it runs. The hex is the text, XORed with
// its first byte.
function decodeProtected(hex: string): string {
  const key = Number.parseInt(hex.slice(0, 2), 16);
  let out = '';
  for (let i = 2; i + 1 < hex.length; i += 2)
    out += String.fromCharCode(Number.parseInt(hex.slice(i, i + 2), 16) ^ key);
  return out;
}

function revealProtected(doc: Document): void {
  for (const el of doc.querySelectorAll('[data-cfemail]')) {
    el.replaceWith(doc.createTextNode(decodeProtected(el.getAttribute('data-cfemail') ?? '')));
  }
  for (const a of doc.querySelectorAll('a[href*="/cdn-cgi/l/email-protection#"]')) {
    const hex = (a.getAttribute('href') ?? '').split('#')[1] ?? '';
    if (/^[0-9a-f]+$/i.test(hex)) a.replaceWith(doc.createTextNode(decodeProtected(hex)));
  }
}

const DROP =
  'script, style, noscript, template, svg, canvas, iframe, form, button, input, select, nav, footer, aside, dialog, [hidden], [aria-hidden="true"]';

const BLOCK = new Set([
  'ADDRESS',
  'ARTICLE',
  'BLOCKQUOTE',
  'DD',
  'DETAILS',
  'DIV',
  'DL',
  'DT',
  'FIGCAPTION',
  'FIGURE',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HGROUP',
  'HR',
  'LI',
  'MAIN',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'SUMMARY',
  'TABLE',
  'UL',
]);

const squash = (s: string) => s.replace(/\s+/g, ' ');

/** An element's text on one line, inline code kept as code. */
function inline(node: Node): string {
  let out = '';
  for (const child of node.childNodes) {
    if (child.nodeType === 3) out += squash(child.textContent ?? '');
    else if (child.nodeType === 1) {
      const el = child as Element;
      if (el.tagName === 'BR') out += ' ';
      else if (el.tagName === 'CODE') {
        const code = squash(el.textContent ?? '').trim();
        if (code) out += code.includes('`') ? `\`\` ${code} \`\`` : `\`${code}\``;
      } else if (el.tagName === 'IMG') out += el.getAttribute('alt') ? ` ${el.getAttribute('alt')} ` : '';
      else out += inline(el);
    }
  }
  return out;
}

function table(el: Element): string {
  const rows = [...el.querySelectorAll('tr')]
    .map((tr) => [...tr.querySelectorAll('th, td')].map((c) => inline(c).trim().replace(/\|/g, '\\|')))
    .filter((cells) => cells.some(Boolean));
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [line(rows[0]!), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(line)].join('\n');
}

/** The element's blocks as Markdown, in order; loose text between blocks is a paragraph of its own. */
function blocks(el: Element, out: string[]): void {
  let loose = '';
  const flush = () => {
    if (loose.trim()) out.push(loose.trim());
    loose = '';
  };
  for (const child of el.childNodes) {
    if (child.nodeType === 3) {
      loose += squash(child.textContent ?? '');
      continue;
    }
    if (child.nodeType !== 1) continue;
    const c = child as Element;
    if (!BLOCK.has(c.tagName) && c.tagName !== 'BR') {
      loose += inline(c);
      continue;
    }
    flush();
    const h = /^H([1-6])$/.exec(c.tagName);
    if (h) {
      const text = inline(c).trim();
      if (text) out.push(`${'#'.repeat(Number(h[1]))} ${text}`);
    } else if (c.tagName === 'P' || c.tagName === 'DT' || c.tagName === 'DD' || c.tagName === 'FIGCAPTION') {
      const text = inline(c).trim();
      if (text) out.push(text);
    } else if (c.tagName === 'UL' || c.tagName === 'OL') {
      const items = [...c.children].filter((li) => li.tagName === 'LI');
      const lines = items.map((li, i) => `${c.tagName === 'OL' ? `${i + 1}.` : '-'} ${inline(li).trim()}`);
      if (lines.length) out.push(lines.join('\n'));
    } else if (c.tagName === 'PRE') {
      const code = (c.textContent ?? '').replace(/\s+$/, '');
      if (code.trim()) out.push(`\`\`\`\n${code.replace(/```/g, '`​``')}\n\`\`\``);
    } else if (c.tagName === 'BLOCKQUOTE') {
      const inner: string[] = [];
      blocks(c, inner);
      if (inner.length) out.push(inner.join('\n\n').replace(/^/gm, '> '));
    } else if (c.tagName === 'TABLE') {
      const t = table(c);
      if (t) out.push(t);
    } else if (c.tagName === 'HR') out.push('---');
    else blocks(c, out);
  }
  flush();
}

/** A page's title and main text, as Markdown. */
export function pageToMarkdown(html: string): { title: string; markdown: string } {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  revealProtected(doc);
  const title = squash(
    doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.title ||
      doc.querySelector('h1')?.textContent ||
      '',
  ).trim();
  const root = doc.querySelector('article') ?? doc.querySelector('main, [role="main"]') ?? doc.body;
  if (!root) return { title, markdown: '' };
  for (const el of root.querySelectorAll(DROP)) el.remove();
  const out: string[] = [];
  blocks(root, out);
  return { title, markdown: out.join('\n\n').slice(0, MAX_SOURCE_CHARS) };
}

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

/** A fetched page as a source; throws when there is no text in it to keep. */
export function sourceFromPage(page: FetchedPage, now = Date.now()): Source {
  const type = page.type.toLowerCase();
  const html = type.includes('html') || (!type && /^\s*</.test(page.text));
  if (!html && !type.startsWith('text/') && type)
    throw new Error(`Clearpen keeps web pages and text, not ${type.split(';')[0]}.`);
  const { title, markdown } = html
    ? pageToMarkdown(page.text)
    : { title: '', markdown: page.text.slice(0, MAX_SOURCE_CHARS) };
  if (!markdown.trim()) throw new Error('There’s no text on that page to keep — paste it instead.');
  return {
    id: newId(),
    url: page.url,
    title: title || new URL(page.url).hostname,
    markdown: markdown.trim(),
    addedAt: now,
  };
}

/** Text the writer pasted, as a source. */
export function sourceFromText(title: string, text: string, now = Date.now()): Source {
  return {
    id: newId(),
    url: '',
    title: title.trim() || 'Pasted note',
    markdown: text.trim().slice(0, MAX_SOURCE_CHARS),
    addedAt: now,
  };
}
