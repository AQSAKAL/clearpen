// The world's financial press, read as headlines. Nothing here is stored: each
// visit fetches the feeds again, parses the RSS in memory, and drops it when the
// rail closes. The four sources are deliberately the ones with simple, public
// RSS — no API key, no account.

import type { Backend } from './backend.ts';

export interface FeedSource {
  id: string;
  name: string;
  short: string;
  url: string;
}

export interface FeedItem {
  /** Stable per source, so a duplicate item can't appear twice. */
  id: string;
  source: string;
  sourceName: string;
  title: string;
  url: string;
  /** Milliseconds since the epoch, when the feed gives a date. */
  at: number | null;
  summary?: string;
}

export const FEEDS: readonly FeedSource[] = [
  {
    id: 'wsj',
    name: 'Wall Street Journal — Economy',
    short: 'WSJ',
    url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml',
  },
  {
    id: 'ft',
    name: 'Financial Times — Global Economy',
    short: 'FT',
    url: 'https://www.ft.com/global-economy?format=rss',
  },
  {
    id: 'marketwatch',
    name: 'MarketWatch — Top Stories',
    short: 'MarketWatch',
    // The mw_economy feed in Dow Jones's catalogue answers 404; top stories is
    // the working feed that carries its economy and markets reporting.
    url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories',
  },
  {
    id: 'cnbc',
    name: 'CNBC — Economy',
    short: 'CNBC',
    url: 'https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=20910258',
  },
];

const PER_FEED = 8;

function textOf(node: Element | null): string {
  return node?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
}

function linkOf(item: Element): string | null {
  const links = [...item.querySelectorAll('link')];
  const alternate = links.find((link) => {
    const rel = link.getAttribute('rel');
    return !rel || rel === 'alternate';
  });
  const href = alternate?.getAttribute('href')?.trim();
  if (href) return href;
  const raw = alternate?.textContent?.trim();
  return raw || null;
}

function dateOf(item: Element): number | null {
  const raw = textOf(item.querySelector('pubDate, published, updated, date'));
  if (!raw) return null;
  const time = Date.parse(raw);
  return Number.isFinite(time) ? time : null;
}

/** Reads RSS 2.0 and Atom into the same small shape. Invalid XML yields nothing. */
export function parseFeed(xml: string, source: FeedSource): FeedItem[] {
  if (typeof DOMParser === 'undefined' || !xml.trim()) return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const nodes = [...doc.querySelectorAll('item, entry')];
  // Happy DOM adds a parsererror for the XML declaration or CDATA even when
  // the items parsed; only an error with no items is fatal.
  if (nodes.length === 0 && doc.querySelector('parsererror')) return [];

  const items: FeedItem[] = [];
  for (const node of nodes) {
    const title = textOf(node.querySelector('title'));
    const url = linkOf(node);
    if (!title || !url) continue;
    const id = textOf(node.querySelector('guid, id')) || url;
    const summary = textOf(node.querySelector('description, summary'));
    const at = dateOf(node);
    items.push({
      id: `${source.id}:${id}`,
      source: source.id,
      sourceName: source.short,
      title,
      url,
      at,
      ...(summary ? { summary: summary.slice(0, 180) } : {}),
    });
  }
  return items.slice(0, PER_FEED);
}

/** Fetches all four feeds in parallel. A source that fails doesn't hide the others. */
export async function loadFeeds(
  backend: Backend,
  signal: AbortSignal,
): Promise<{ items: FeedItem[]; failed: string[] }> {
  if (!backend.fetchPage) return { items: [], failed: FEEDS.map((feed) => feed.id) };

  const results = await Promise.allSettled(
    FEEDS.map(async (feed) => {
      const page = await backend.fetchPage!(feed.url, { signal });
      return parseFeed(page.text, feed);
    }),
  );

  const items: FeedItem[] = [];
  const failed: string[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') items.push(...result.value);
    else failed.push(FEEDS[index]!.id);
  });

  // A story can be syndicated under two addresses; one copy is enough.
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });
  unique.sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  return { items: unique.slice(0, 48), failed };
}
