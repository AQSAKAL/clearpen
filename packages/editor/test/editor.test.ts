// The rest of the API: text and selection, AI edits, updates, focus mode and pasted images.

import { describe, expect, test, vi } from 'vitest';
import type { MarginEditor } from '../src/index.ts';
import { all, mount } from './helpers.ts';

describe('text and selection', () => {
  test('reads and selects', () => {
    const ed = mount('First line\nSecond line');
    ed.setSelection(6, 10);
    expect(ed.getSelection()).toEqual({ from: 6, to: 10, text: 'line', empty: false });
    expect(ed.cursor()).toBe(10);
    expect(ed.lineAt(14)).toEqual({ from: 11, to: 22, text: 'Second line', number: 2 });
    expect(ed.slice(0, 5)).toBe('First');
    expect(ed.length()).toBe(22);
  });

  test('replace and insertAt are AI edits, each one undo step', () => {
    const ed = mount('Hello world');
    ed.replace(6, 11, 'there', { select: true });
    expect(ed.getText()).toBe('Hello there');
    expect(ed.getSelection()).toMatchObject({ from: 6, to: 11 });
    ed.insertAt(11, '!');
    expect(ed.cursor()).toBe(12);
    ed.undo();
    expect(ed.getText()).toBe('Hello there');
    ed.redo();
    expect(ed.getText()).toBe('Hello there!');
  });

  test('setText starts afresh: no history, suggestions, notes or focus mode', () => {
    const ed = mount('Old text');
    ed.insertAt(0, 'Very ');
    ed.addSuggestion({ from: 0, to: 4, insert: 'Quite', status: 'ready' });
    ed.setNotes([{ id: 'n', from: 0, to: 4, category: 'tone' }]);
    ed.setFocus(true);
    ed.setText('New text');
    expect(ed.getText()).toBe('New text');
    expect(ed.suggestions()).toEqual([]);
    expect(ed.notes()).toEqual([]);
    expect(ed.undo()).toBe(false);
    expect(all(ed, '.cm-dim')).toHaveLength(0);
  });

  test('ids keep counting across documents', () => {
    const ed = mount('Text');
    const a = ed.addSuggestion({ from: 0, to: 4 });
    ed.setText('More text');
    const b = ed.addSuggestion({ from: 0, to: 4 });
    expect([a, b]).toEqual(['s1', 's2']);
  });
});

describe('onUpdate', () => {
  test('tells typing apart from other edits', () => {
    const onUpdate = vi.fn();
    const ed = mount('Text', { onUpdate });
    ed.view.dispatch({ changes: { from: 4, insert: 's' }, userEvent: 'input.type' });
    expect(onUpdate).toHaveBeenLastCalledWith({
      docChanged: true,
      selectionSet: false,
      focusChanged: false,
      userEdit: true,
      ghostAccepted: false,
      typed: [{ from: 4, to: 5 }],
      corrected: false,
      mapPos: expect.any(Function),
    });
    ed.insertAt(0, 'The ');
    expect(onUpdate).toHaveBeenLastCalledWith(expect.objectContaining({ docChanged: true, userEdit: false }));
  });
});

describe('focus mode', () => {
  test('dims every line outside the paragraph being written', () => {
    const ed = mount('One.\n\nTwo,\nstill two.\n\nThree.');
    ed.setSelection(8);
    ed.setFocus(true);
    const dim = () => all(ed, '.cm-line.cm-dim').map((l) => l.textContent);
    expect(dim()).toEqual(['One.', '', '', 'Three.']);
    ed.setSelection(ed.length());
    expect(dim()).toEqual(['One.', '', 'Two,', 'still two.', '']);
    ed.setFocus(false);
    expect(dim()).toEqual([]);
  });
});

describe('pasted images', () => {
  const paste = (ed: MarginEditor, { image = false, text = '' }) => {
    const data = new DataTransfer();
    if (image) data.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'chart.png', { type: 'image/png' }));
    if (text) data.setData('text/plain', text);
    ed.view.contentDOM.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    );
  };

  test('go to the app with the selection they replace', () => {
    const onImages = vi.fn();
    const ed = mount('Here: X.', { onImages });
    ed.setSelection(6, 7);
    paste(ed, { image: true, text: 'chart.png' });
    expect(onImages).toHaveBeenCalledTimes(1);
    const [files, from, to] = onImages.mock.calls[0]!;
    expect((files as File[]).map((f) => f.name)).toEqual(['chart.png']);
    expect([from, to]).toEqual([6, 7]);
    expect(ed.getText()).toBe('Here: X.');
  });

  test('text pastes as usual, and so does everything when the app takes no images', () => {
    const onImages = vi.fn();
    const ed = mount('Here: X.', { onImages });
    ed.setSelection(6, 7);
    paste(ed, { text: 'words' });
    expect(ed.getText()).toBe('Here: words.');
    expect(onImages).not.toHaveBeenCalled();
    const plain = mount('Here: X.');
    plain.setSelection(6, 7);
    paste(plain, { image: true, text: 'chart.png' });
    expect(plain.getText()).toBe('Here: chart.png.');
  });
});
