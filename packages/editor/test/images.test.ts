// Images: shown under their Markdown line, from wherever resolveImage says —
// but never from a scheme that isn't https, whatever it says.

import { describe, expect, test, vi } from 'vitest';
import { allowedSource, loadableUrl } from '../src/images.ts';
import type { MarginEditor } from '../src/index.ts';
import { all, mount } from './helpers.ts';

const srcs = (ed: MarginEditor) => all(ed, '.cm-image img').map((img) => img.getAttribute('src'));

describe('inline images', () => {
  test('a relative media/ path is shown through resolveImage, under its line', () => {
    const resolveImage = vi.fn((src: string) => (src.startsWith('media/') ? `asset://localhost/library/${src}` : null));
    const ed = mount('Intro.\n\n![A chart](media/0a1b2c3d.png "Sales")\n\nMore.', { resolveImage });
    expect(resolveImage).toHaveBeenCalledWith('media/0a1b2c3d.png');
    expect(srcs(ed)).toEqual(['asset://localhost/library/media/0a1b2c3d.png']);
    const img = all(ed, '.cm-image img')[0]!;
    expect(img.getAttribute('alt')).toBe('A chart');
    // The Markdown stays in the text; the picture is a block below it.
    expect(ed.getText()).toContain('![A chart](media/0a1b2c3d.png "Sales")');
  });

  test('the picture follows edits to its source', () => {
    const ed = mount('![x](media/aa.png)', { resolveImage: (src) => `/files/${src}` });
    expect(srcs(ed)).toEqual(['/files/media/aa.png']);
    ed.replace(11, 13, 'bb');
    expect(srcs(ed)).toEqual(['/files/media/bb.png']);
    ed.setText('No pictures.');
    expect(srcs(ed)).toEqual([]);
  });

  test('without resolveImage, only https:// images show', () => {
    const ed = mount('![a](https://example.com/a.png)\n\n![b](media/bb.png)\n\n![c](/media/x/y.png)');
    expect(srcs(ed)).toEqual(['https://example.com/a.png']);
  });

  test('resolveImage may hide an image by returning null', () => {
    const ed = mount('![a](https://example.com/a.png)', { resolveImage: () => null });
    expect(srcs(ed)).toEqual([]);
  });

  test('an unsafe source never renders, and resolveImage is never asked about it', () => {
    const resolveImage = vi.fn((src: string) => src);
    const unsafe = [
      'javascript:alert`1`',
      'JavaScript:alert`1`',
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/svg+xml,%3Csvg%3E',
      'vbscript:msgbox',
      'file:///etc/passwd.png',
      'http://example.com/a.png',
      'blob:https://example.com/0f1e',
      'asset://localhost/etc/a.png',
      '//example.com/a.png',
      '\\\\example.com\\a.png',
      '\x01javascript:alert`1`',
    ];
    const ed = mount(unsafe.map((src, i) => `![${i}](${src})`).join('\n\n'), { resolveImage });
    expect(resolveImage).not.toHaveBeenCalled();
    expect(srcs(ed)).toEqual([]);
  });

  test('nor does an unsafe URL from resolveImage', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:image/png;base64,iVBORw0KGgo=',
      ' javascript:alert(1)',
      'file:///a.png',
    ]) {
      const ed = mount('![a](media/aa.png)\n\n![b](https://example.com/b.png)', { resolveImage: () => url });
      expect(srcs(ed)).toEqual([]);
    }
  });

  test('which sources and URLs pass', () => {
    expect(['media/0a1b.png', '/media/x.png', 'https://example.com/a.png'].map(allowedSource)).toEqual([
      true,
      true,
      true,
    ]);
    expect(
      [
        'asset://localhost/a.png',
        'http://asset.localhost/a.png',
        'blob:http://localhost:1420/0f1e',
        'https://example.com/a.png',
        '/api/media/a.png',
      ].map(loadableUrl),
    ).toEqual([true, true, true, true, true]);
    expect(['javascript:x', 'data:x', 'mailto:x', 'tauri://x', 'java\tscript:x', '//x/a.png'].map(loadableUrl)).toEqual(
      [false, false, false, false, false, false],
    );
  });
});
