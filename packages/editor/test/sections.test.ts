// "◇ Shape this section" appears after the heading of each section that has
// only notes (or nothing) under it, and only when the app can act on it.

import { describe, expect, test, vi } from 'vitest';
import { all, mount, mousedown } from './helpers.ts';

const doc = [
  '# The title is not a section',
  '',
  '## Written',
  '',
  'Some prose here.',
  '',
  '## Planned',
  '',
  '- first point',
  '- second point',
  '',
  '## Empty',
  '',
].join('\n');

describe('Shape this section', () => {
  test('appears only for unwritten sections, and reports the heading it belongs to', () => {
    const onWriteSection = vi.fn();
    const ed = mount(doc, { onWriteSection });
    const buttons = all(ed, '.cm-write-section');
    expect(buttons.map((b) => b.textContent)).toEqual(['◇ Shape this section', '◇ Shape this section']);
    expect(buttons.map((b) => b.closest('.cm-line')?.textContent?.replace('◇ Shape this section', ''))).toEqual([
      '## Planned',
      '## Empty',
    ]);
    mousedown(buttons[0]!);
    mousedown(buttons[1]!);
    expect(onWriteSection.mock.calls).toEqual([[doc.indexOf('## Planned')], [doc.indexOf('## Empty')]]);
  });

  test('goes once the section has prose in it', () => {
    const ed = mount(doc, { onWriteSection: () => {} });
    ed.insertAt(ed.length(), 'Now there is a paragraph.');
    expect(all(ed, '.cm-write-section')).toHaveLength(1);
  });

  test('is hidden while a suggestion is pending in the section', () => {
    const ed = mount(doc, { onWriteSection: () => {} });
    const id = ed.addSuggestion({ from: ed.length(), to: ed.length(), insert: 'Draft.', status: 'ready' });
    expect(all(ed, '.cm-write-section')).toHaveLength(1);
    ed.rejectSuggestion(id);
    expect(all(ed, '.cm-write-section')).toHaveLength(2);
  });

  test('never appears without onWriteSection', () => {
    const ed = mount(doc);
    expect(all(ed, '.cm-write-section')).toHaveLength(0);
  });
});
