// Pasting from the web. Browsers put the page's markup on the clipboard as
// `text/html`, but the editor writes Markdown. This turns the HTML a page
// copies into the Markdown it stands for — headings, emphasis, links, lists,
// quotes, code, images and tables — so a paste keeps its shape instead of
// collapsing into a wall of plain text. Presentational CSS (fonts, colours,
// sizes) has no Markdown equivalent and is dropped; semantic emphasis, which
// pages usually express with <strong>/<em> or font-weight/font-style, comes
// through.

const SKIP = new Set(['script', 'style', 'noscript', 'head', 'meta', 'link', 'title', 'template']);

const BLOCK = new Set([
  'address',
  'article',
  'aside',
  'blockquote',
  'div',
  'dl',
  'fieldset',
  'figcaption',
  'figure',
  'footer',
  'form',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'header',
  'hr',
  'li',
  'main',
  'nav',
  'ol',
  'p',
  'pre',
  'section',
  'table',
  'ul',
]);

const tagOf = (n: Node): string => (n.nodeType === Node.ELEMENT_NODE ? (n as Element).tagName.toLowerCase() : '');

const collapse = (s: string) => s.replace(/\s+/g, ' ');

const isBlock = (n: Node) => BLOCK.has(tagOf(n));

const hasBlockChild = (el: Element) => [...el.children].some((c) => isBlock(c) || tagOf(c) === 'br');

/** How much of the clipboard's HTML is markup, as opposed to a plain-text wrapper. */
export function looksLikeMarkup(html: string): boolean {
  return /<(p|div|h[1-6]|ul|ol|li|table|blockquote|pre|section|article|span|strong|b|em|i|a|br|img)\b/i.test(html);
}

function detectLang(el: Element | null): string {
  if (!el) return '';
  for (const name of [el.getAttribute('class'), el.getAttribute('data-lang'), el.getAttribute('lang')]) {
    const m = name?.match(/^(?:language-|lang-)?([\w+#-]+)$/);
    if (name && m) return m[1] ?? '';
  }
  const cls = el.getAttribute('class') ?? '';
  const m = cls.match(/(?:language|lang)-([\w+#-]+)/);
  return m?.[1] ?? '';
}

function fence(text: string, lang: string): string {
  const run = (text.match(/`+/g) ?? []).reduce((m, r) => Math.max(m, r.length), 2);
  const f = '`'.repeat(Math.max(3, run + 1));
  const body = text.replace(/\n+$/, '');
  return `${f}${lang}\n${body}\n${f}`;
}

function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return collapse(node.textContent ?? '');
  if (node.nodeType !== Node.ELEMENT_NODE) return '';
  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();
  if (SKIP.has(tag)) return '';
  if (el.style?.display === 'none' || el.hidden) return '';
  const inner = () => [...el.childNodes].map(inline).join('');

  switch (tag) {
    case 'br':
      return '\n';
    case 'strong':
    case 'b': {
      const t = inner().trim();
      return t ? `**${t}**` : '';
    }
    case 'em':
    case 'i': {
      const t = inner().trim();
      return t ? `*${t}*` : '';
    }
    case 'del':
    case 's':
    case 'strike': {
      const t = inner().trim();
      return t ? `~~${t}~~` : '';
    }
    case 'code':
      return `\`${(el.textContent ?? '').replace(/`/g, '\\`')}\``;
    case 'a': {
      const href = (el.getAttribute('href') ?? '').trim();
      const t = inner().trim();
      return href && t ? `[${t}](${href})` : t;
    }
    case 'img': {
      const src = (el.getAttribute('src') ?? '').trim();
      const alt = (el.getAttribute('alt') ?? '').replace(/\s+/g, ' ').trim();
      return src ? `![${alt}](${src})` : '';
    }
    default: {
      let text = inner();
      const style = el.style;
      if (style) {
        const weight = style.fontWeight;
        const bold = weight === 'bold' || weight === 'bolder' || (/^\d+$/.test(weight) && Number(weight) >= 600);
        if (bold && text.trim()) text = `**${text.trim()}**`;
        if (style.fontStyle === 'italic' && text.trim()) text = `*${text.trim()}*`;
        if ((style.textDecorationLine || style.textDecoration || '').includes('line-through') && text.trim()) {
          text = `~~${text.trim()}~~`;
        }
      }
      return text;
    }
  }
}

function list(el: Element, ordered: boolean, indent: string): string {
  const items = [...el.children].filter((c) => tagOf(c) === 'li');
  return items
    .map((li, i) => {
      const marker = ordered ? `${i + 1}.` : '-';
      const clone = li.cloneNode(true) as Element;
      const nested: Element[] = [];
      for (const child of [...clone.children]) {
        if (tagOf(child) === 'ul' || tagOf(child) === 'ol') {
          nested.push(child);
          child.remove();
        }
      }
      const text = inline(clone).trim().replace(/\n+/g, ' ');
      let line = `${indent}${marker} ${text}`.trimEnd();
      for (const sub of nested) {
        const subMd = list(sub, tagOf(sub) === 'ol', `${indent}  `);
        if (subMd) line += `\n${subMd}`;
      }
      return line;
    })
    .join('\n');
}

function table(el: Element): string {
  const rows = [...el.querySelectorAll('tr')];
  if (!rows.length) return '';
  const cells = rows.map((r) => [...r.children].map((c) => inline(c).trim().replace(/\n+/g, ' ')));
  const width = Math.max(...cells.map((r) => r.length));
  const fmt = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  const [head, ...body] = cells;
  const sep = `| ${Array.from({ length: width }, () => '---').join(' | ')} |`;
  return [fmt(head ?? []), sep, ...body.map(fmt)].join('\n');
}

function serializeBlocks(nodes: Node[], indent = ''): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = collapse(node.textContent ?? '').trim();
      if (t) parts.push(t);
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as HTMLElement;
    const tag = el.tagName.toLowerCase();
    if (SKIP.has(tag) || el.style?.display === 'none' || el.hidden) continue;

    if (/^h[1-6]$/.test(tag)) {
      const t = inline(el).trim();
      if (t) parts.push(`${'#'.repeat(Number(tag[1]))} ${t}`);
      continue;
    }

    switch (tag) {
      case 'p': {
        const t = inline(el).trim();
        if (t) parts.push(t);
        break;
      }
      case 'ul':
      case 'ol':
        parts.push(list(el, tag === 'ol', indent));
        break;
      case 'blockquote': {
        const inner = serializeBlocks([...el.childNodes], indent).trim();
        if (inner)
          parts.push(
            inner
              .split('\n')
              .map((l) => (l ? `> ${l}` : '>'))
              .join('\n'),
          );
        break;
      }
      case 'pre': {
        const code = el.querySelector('code');
        const lang = detectLang(code) || detectLang(el);
        parts.push(fence((code ?? el).textContent ?? '', lang));
        break;
      }
      case 'hr':
        parts.push('---');
        break;
      case 'table':
        parts.push(table(el));
        break;
      case 'br':
        break;
      case 'img': {
        const t = inline(el).trim();
        if (t) parts.push(t);
        break;
      }
      default: {
        if (hasBlockChild(el)) parts.push(serializeBlocks([...el.childNodes], indent).trim());
        else {
          const t = inline(el).trim();
          if (t) parts.push(t);
        }
      }
    }
  }
  return parts.filter((p) => p.length > 0).join('\n\n');
}

/** The Markdown a clipboard's HTML stands for; '' when it can't be parsed here. */
export function htmlToMarkdown(html: string): string {
  if (typeof DOMParser === 'undefined') return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return serializeBlocks([...doc.body.childNodes])
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
