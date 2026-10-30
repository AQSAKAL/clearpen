import { describe, expect, test } from 'vitest';
import type { Backend } from '../src/backend.ts';
import { socialHtml, socialText } from '../src/lib/social.ts';

const backend = {
  media: {
    dataUrl: async (src: string) => (src === 'media/a.png' ? 'data:image/png;base64,AAAA' : null),
  },
} as unknown as Backend;

describe('social export', () => {
  test('plain text drops Markdown and keeps an address that differs from its label', () => {
    const text = socialText(
      'Why markets fall',
      'Markets **fall** when *buyers* outnumber sellers.\n\nSee [the note](https://example.com/n).',
    );
    expect(text).toBe(
      'Why markets fall\n\nMarkets fall when buyers outnumber sellers.\n\nSee the note (https://example.com/n).',
    );
  });

  test('Substack keeps headings and inlines a local image', async () => {
    const html = await socialHtml('Why markets fall', '## Markets\n\n![a chart](media/a.png)', backend, 'substack');
    expect(html).toContain('<h2');
    expect(html).not.toContain('<h1');
    expect(html).toContain('data:image/png;base64,AAAA');
    expect(html).toMatch(/font-weight:\s*700/);
  });

  test('LinkedIn turns headings into bold paragraphs', async () => {
    const html = await socialHtml('Why markets fall', 'Markets fall.', backend, 'linkedin');
    expect(html).not.toContain('<h1');
    expect(html).toMatch(/<strong[^>]*>Why markets fall<\/strong>/);
  });
});
