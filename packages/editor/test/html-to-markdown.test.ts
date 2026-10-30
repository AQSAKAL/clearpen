import { describe, expect, test } from 'vitest';
import { htmlToMarkdown, looksLikeMarkup } from '../src/html-to-markdown.ts';

describe('htmlToMarkdown', () => {
  test('keeps headings, emphasis and links', () => {
    const html =
      '<h2>Title</h2><p>Hello <strong>bold</strong> and <em>quiet</em> <a href="https://x.test/a">link</a>.</p>';
    expect(htmlToMarkdown(html)).toBe('## Title\n\nHello **bold** and *quiet* [link](https://x.test/a).');
  });

  test('turns lists and quotes into Markdown', () => {
    const html = '<ul><li>one</li><li>two</li></ul><blockquote><p>a thought</p></blockquote>';
    expect(htmlToMarkdown(html)).toBe('- one\n- two\n\n> a thought');
  });

  test('keeps code blocks with their language', () => {
    const html = '<pre><code class="language-js">const a = 1;</code></pre>';
    expect(htmlToMarkdown(html)).toBe('```js\nconst a = 1;\n```');
  });

  test('keeps images and tables', () => {
    const html =
      '<p><img src="https://x.test/i.png" alt="pic"></p><table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>';
    expect(htmlToMarkdown(html)).toBe('![pic](https://x.test/i.png)\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
  });

  test('reads emphasis the page expresses only in style', () => {
    const html =
      '<p><span style="font-weight: 700">heavy</span> and <span style="font-style: italic">slanted</span></p>';
    expect(htmlToMarkdown(html)).toBe('**heavy** and *slanted*');
  });

  test('tells real markup from a plain-text wrapper', () => {
    expect(looksLikeMarkup('<meta charset="utf-8">just words')).toBe(false);
    expect(looksLikeMarkup('<p>just <b>words</b></p>')).toBe(true);
  });
});
