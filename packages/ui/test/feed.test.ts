import assert from 'node:assert/strict';
import { test } from 'vitest';
import { type FeedSource, parseFeed } from '../src/feed.ts';

const wsj: FeedSource = { id: 'wsj', name: 'WSJ', short: 'WSJ', url: 'https://example.com/wsj' };

test('RSS items keep the title, link, date and summary', () => {
  const xml = `<?xml version="1.0"?>
    <rss version="2.0"><channel>
      <item>
        <title>Fed holds rates &amp; warns on inflation</title>
        <link>https://example.com/a?x=1&amp;y=2</link>
        <pubDate>Wed, 11 Nov 2026 09:00:00 GMT</pubDate>
        <description>Borrowing costs stay put for now.</description>
        <guid>story-1</guid>
      </item>
      <item>
        <title>Second story</title>
        <link>https://example.com/b</link>
      </item>
    </channel></rss>`;
  const items = parseFeed(xml, wsj);
  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, 'Fed holds rates & warns on inflation');
  assert.equal(items[0]?.url, 'https://example.com/a?x=1&y=2');
  assert.equal(items[0]?.at, Date.parse('Wed, 11 Nov 2026 09:00:00 GMT'));
  assert.equal(items[0]?.summary, 'Borrowing costs stay put for now.');
  assert.equal(items[0]?.sourceName, 'WSJ');
  assert.equal(items[1]?.at, null);
});

test('Atom entries use the alternate link and updated time', () => {
  const xml = `<?xml version="1.0"?>
    <feed xmlns="http://www.w3.org/2005/Atom">
      <entry>
        <title>Europe's banks</title>
        <link rel="alternate" href="https://example.com/atom" />
        <updated>2026-11-11T08:30:00Z</updated>
        <id>urn:story:2</id>
      </entry>
    </feed>`;
  const items = parseFeed(xml, { ...wsj, id: 'ft', short: 'FT' });
  assert.equal(items.length, 1);
  assert.equal(items[0]?.url, 'https://example.com/atom');
  assert.equal(items[0]?.at, Date.parse('2026-11-11T08:30:00Z'));
  assert.equal(items[0]?.sourceName, 'FT');
});

test('invalid XML yields nothing rather than throwing', () => {
  assert.deepEqual(parseFeed('<rss><channel>', wsj), []);
  assert.deepEqual(parseFeed('', wsj), []);
});
