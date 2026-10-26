// A small, safe Markdown → HTML renderer for export and rich-text copy.
// Covers what articles use: headings, paragraphs, emphasis, links, images,
// lists, quotes, callouts, tables, code and rules. Everything is escaped first.

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (s: string) => s.replace(/[&<>"']/g, (c) => ENTITIES[c]!);
const esc = escapeHTML;

function safeUrl(url: string): string {
  const u = url.trim();
  return /^(https?:\/\/|mailto:|#|\/(?!\/))/i.test(u) ? u : '#';
}

// Where an image's pixels come from. Articles store images as relative paths
// (`media/<hash>.png`); the app maps them to something it can show, or inlines
// them as data URLs for export. Set only for the length of one `toHTML` call.
let imageSrc: ((src: string) => string | null) | undefined;
const SAFE_IMAGE = /^(https?:\/\/|data:image\/(png|jpeg|gif|webp);base64,|blob:|asset:|\/(?!\/))/i;

function image(alt: string, url: string): string {
  const src = imageSrc ? imageSrc(url.trim()) : safeUrl(url);
  if (src === null) return esc(alt);
  return `<img src="${esc(SAFE_IMAGE.test(src) ? src : '#')}" alt="${esc(alt)}">`;
}

function emphasis(s: string): string {
  return s
    .replace(
      /\*\*([^*]+)\*\*|__([^_]+)__/g,
      (_, a: string | undefined, b: string | undefined) => `<strong>${a ?? b}</strong>`,
    )
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/(^|[^_\w])_([^_\s][^_]*?)_(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>');
}

/**
 * Inline Markdown. Code, images and links are lifted out into sealed slots
 * first, so no later pattern can ever run over the tags they produce; only
 * then is the remaining text escaped and emphasised.
 */
function inline(src: string): string {
  const slots: string[] = [];
  const hold = (html: string) => `\u0000${slots.push(html) - 1}\u0000`;
  let s = String(src).replace(/\u0000/g, '');
  s = s.replace(/`([^`]+)`/g, (_, c: string) => hold(`<code>${esc(c)}</code>`));
  s = s.replace(/!\[([^[\]]*)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g, (_, alt: string, url: string) => hold(image(alt, url)));
  s = s.replace(/\[([^[\]]+)\]\(([^()\s]+)\)/g, (_, label: string, url: string) =>
    hold(`<a href="${esc(safeUrl(url))}">${emphasis(esc(label))}</a>`),
  );
  s = emphasis(esc(s));
  return s.replace(/\u0000(\d+)\u0000/g, (_, i: string) => slots[Number(i)]!);
}

const LIST_ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const FENCE = /^(\s*)(```|~~~)\s*([\w+-]*)\s*$/;
const isTableStart = (lines: string[], i: number) => lines[i]!.includes('|') && TABLE_SEP.test(lines[i + 1] || '');
const cells = (row: string) =>
  row
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
const indentOf = (line: string) => line.match(/^\s*/)![0].length;

/** Does line `i` begin a block other than a paragraph? */
function startsBlock(lines: string[], i: number): boolean {
  const line = lines[i]!;
  return (
    FENCE.test(line) ||
    /^#{1,6}\s/.test(line) ||
    /^\s*([-*_]\s*){3,}$/.test(line) ||
    /^\s*>/.test(line) ||
    LIST_ITEM.test(line) ||
    isTableStart(lines, i)
  );
}

function dedent(lines: string[], n: number): string[] {
  return lines.map((l) => l.replace(new RegExp(`^ {0,${n}}`), ''));
}

function table(lines: string[]): string {
  const head = cells(lines[0]!);
  const align = cells(lines[1]!).map((c) =>
    c.startsWith(':') && c.endsWith(':') ? 'center' : c.endsWith(':') ? 'right' : c.startsWith(':') ? 'left' : '',
  );
  const cell = (tag: string, text: string, i: number) =>
    `<${tag}${align[i] ? ` style="text-align:${align[i]}"` : ''}>${inline(text)}</${tag}>`;
  const body = lines
    .slice(2)
    .map((r) => `<tr>${head.map((_, i) => cell('td', cells(r)[i] ?? '', i)).join('')}</tr>`)
    .join('');
  return `<table><thead><tr>${head.map((h, i) => cell('th', h, i)).join('')}</tr></thead>${body ? `<tbody>${body}</tbody>` : ''}</table>`;
}

const CALLOUTS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

function renderBlocks(lines: string[]): string {
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const code: string[] = [];
      const close = new RegExp(`^\\s*${fence[2]}\\s*$`);
      for (i++; i < lines.length && !close.test(lines[i]!); i++) code.push(lines[i]!);
      i++;
      const lang = fence[3] ? ` class="language-${esc(fence[3])}"` : '';
      out.push(`<pre><code${lang}>${esc(dedent(code, fence[1]!.length).join('\n'))}</code></pre>`);
      continue;
    }
    const h = line.match(/^(#{1,6})\s+(.*?)\s*#*\s*$/);
    if (h) {
      out.push(`<h${h[1]!.length}>${inline(h[2]!)}</h${h[1]!.length}>`);
      i++;
      continue;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      out.push('<hr>');
      i++;
      continue;
    }

    if (isTableStart(lines, i)) {
      const rows: string[] = [];
      while (i < lines.length && lines[i]!.includes('|') && lines[i]!.trim()) rows.push(lines[i++]!);
      out.push(table(rows));
      continue;
    }

    if (/^\s*>/.test(line)) {
      const inner: string[] = [];
      while (i < lines.length && /^\s*>/.test(lines[i]!)) inner.push(lines[i++]!.replace(/^\s*>\s?/, ''));
      const kind = inner[0]?.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*$/i)?.[1]?.toUpperCase();
      if (kind)
        out.push(
          `<blockquote class="callout ${kind.toLowerCase()}"><p><strong>${CALLOUTS[kind]}</strong></p>${renderBlocks(inner.slice(1))}</blockquote>`,
        );
      else out.push(`<blockquote>${renderBlocks(inner)}</blockquote>`);
      continue;
    }

    const item = line.match(LIST_ITEM);
    if (item) {
      const ordered = /\d/.test(item[2]!);
      const indent = item[1]!.length;
      const items: { first: string; rest: string[] }[] = [];
      while (i < lines.length) {
        const m = lines[i]!.match(LIST_ITEM);
        if (!m || m[1]!.length !== indent || /\d/.test(m[2]!) !== ordered) break;
        const contentIndent = m[1]!.length + m[2]!.length + 1;
        const body = [m[3]!];
        i++;
        // The item continues over indented lines — including blank lines
        // between them — so nested code blocks and sub-lists stay inside it.
        while (i < lines.length) {
          const l = lines[i]!;
          if (!l.trim()) {
            const next = lines.slice(i + 1).find((x) => x.trim());
            if (next !== undefined && /^\s+/.test(next) && indentOf(next) > indent) {
              body.push('');
              i++;
              continue;
            }
            break;
          }
          if (indentOf(l) > indent) {
            body.push(l);
            i++;
            continue;
          }
          if (!startsBlock(lines, i) && body[body.length - 1] !== '') {
            body.push(l); // lazy continuation
            i++;
            continue;
          }
          break;
        }
        items.push({ first: body[0]!, rest: dedent(body.slice(1), contentIndent) });
        // A blank line between items keeps the list going.
        let j = i;
        while (j < lines.length && !lines[j]!.trim()) j++;
        const nextItem = lines[j]?.match(LIST_ITEM);
        if (j > i && nextItem && nextItem[1]!.length === indent && /\d/.test(nextItem[2]!) === ordered) i = j;
      }
      const startNum = ordered ? Number.parseInt(item[2]!, 10) : 1;
      const tag = ordered ? 'ol' : 'ul';
      const lis = items
        .map((it) => {
          const firstPara = [it.first];
          let k = 0;
          while (k < it.rest.length && it.rest[k]!.trim() && !startsBlock(it.rest, k))
            firstPara.push(it.rest[k++]!.trim());
          return `<li>${inline(firstPara.join(' '))}${renderBlocks(it.rest.slice(k))}</li>`;
        })
        .join('');
      out.push(`<${tag}${ordered && startNum !== 1 ? ` start="${startNum}"` : ''}>${lis}</${tag}>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i]!.trim() && !(para.length && startsBlock(lines, i)))
      para.push(lines[i++]!.trim());
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

export interface MarkdownOptions {
  /** Maps an image's Markdown source to the URL to show; null leaves just its alt text. */
  imageSrc?: (src: string) => string | null;
}

export function toHTML(md: string, opts: MarkdownOptions = {}): string {
  imageSrc = opts.imageSrc;
  try {
    return renderBlocks(String(md).replace(/\r\n?/g, '\n').split('\n'));
  } finally {
    imageSrc = undefined;
  }
}

/** A complete, self-contained HTML page for an article. */
export function toDocument(title: string, md: string, opts: MarkdownOptions = {}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title || 'Untitled')}</title>
<style>
  body { max-width: 680px; margin: 48px auto; padding: 0 20px; font: 19px/1.7 Charter, 'Iowan Old Style', Georgia, serif; color: #1d1c1a; background: #fff; }
  h1 { font-size: 2.1em; line-height: 1.15; margin: 0 0 .6em; }
  h2 { font-size: 1.4em; margin: 1.6em 0 .4em; } h3 { font-size: 1.15em; margin: 1.4em 0 .3em; }
  blockquote { margin: 1.2em 0; padding-left: 1em; border-left: 3px solid #ddd; color: #555; font-style: italic; }
  code { font: .85em ui-monospace, Menlo, monospace; background: #f4f2ec; padding: 1px 4px; border-radius: 4px; }
  pre { background: #f4f2ec; padding: 14px; border-radius: 6px; overflow: auto; } pre code { background: none; padding: 0; }
  img { max-width: 100%; } a { color: #2f5bd3; } hr { border: 0; border-top: 1px solid #ddd; margin: 2em 0; }
  table { border-collapse: collapse; width: 100%; margin: 1.4em 0; font: 15px/1.5 -apple-system, 'Segoe UI', sans-serif; font-variant-numeric: tabular-nums; }
  th, td { border-bottom: 1px solid #e3e0d8; padding: 6px 10px; text-align: left; } th { border-bottom: 2px solid #ccc; }
  .callout { font-style: normal; border-left-color: #2f6fde; background: #f3f6fc; padding: 10px 14px; border-radius: 4px; }
  .callout.warning, .callout.caution { border-left-color: #d6452b; background: #fdf1ee; }
  .callout p:first-child { margin-top: 0; }
</style>
</head>
<body>
${title ? `<h1>${esc(title)}</h1>\n` : ''}${toHTML(md, opts)}
</body>
</html>
`;
}
