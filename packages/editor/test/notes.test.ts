// Review notes and analysis highlights: placed, mapped through edits, removed.

import { describe, expect, test, vi } from 'vitest';
import { all, mount } from './helpers.ts';

const doc = 'The data was analysed by the team in a very careful way.';
const at = (quote: string) => ({ from: doc.indexOf(quote), to: doc.indexOf(quote) + quote.length });

describe('review notes', () => {
  test('are underlined in their category, and ones that do not fit are dropped', () => {
    const ed = mount(doc);
    ed.setNotes([
      { id: 'n1', ...at('was analysed'), category: 'clarity' },
      { id: 'n2', from: 50, to: 900, category: 'tone' },
      { id: 'n3', from: 5, to: 5, category: 'tone' },
    ]);
    expect(ed.notes().map((n) => n.id)).toEqual(['n1']);
    const marks = all(ed, '.cm-note');
    expect(marks.map((el) => [el.className, el.getAttribute('data-note'), el.textContent])).toEqual([
      ['cm-note cm-note-clarity', 'n1', 'was analysed'],
    ]);
  });

  test('follow their passage through edits', () => {
    const ed = mount(doc);
    ed.setNotes([{ id: 'n1', ...at('a very careful way'), category: 'concision' }]);
    ed.insertAt(0, 'Honestly, ');
    ed.replace(ed.getText().indexOf('very '), ed.getText().indexOf('very ') + 5, '');
    const n = ed.notes()[0]!;
    expect(ed.slice(n.from, n.to)).toBe('a careful way');
  });

  test('text typed at either edge stays outside the note', () => {
    const ed = mount(doc);
    ed.setNotes([{ id: 'n1', ...at('team'), category: 'style' }]);
    ed.insertAt(at('team').to, 's');
    ed.insertAt(at('team').from, 'whole ');
    const n = ed.notes()[0]!;
    expect(ed.slice(n.from, n.to)).toBe('team');
  });

  test('go when their passage is deleted, or when removed', () => {
    const ed = mount(doc);
    ed.setNotes([
      { id: 'n1', ...at('was analysed'), category: 'clarity' },
      { id: 'n2', ...at('very careful'), category: 'concision' },
    ]);
    ed.replace(at('was analysed').from, at('was analysed').to, '');
    expect(ed.notes().map((n) => n.id)).toEqual(['n2']);
    ed.removeNote('n2');
    expect(ed.notes()).toEqual([]);
    expect(all(ed, '.cm-note')).toHaveLength(0);
  });

  test('one can be active, and clicks report the note under them', () => {
    const onNoteClick = vi.fn();
    const ed = mount(doc, { onNoteClick });
    ed.setNotes([{ id: 'n1', ...at('was analysed'), category: 'clarity' }]);
    ed.activateNote('n1', true);
    const mark = all(ed, '.cm-note')[0]!;
    expect(mark.classList.contains('cm-note-active')).toBe(true);
    mark.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onNoteClick).toHaveBeenLastCalledWith('n1');
    ed.view.contentDOM.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onNoteClick).toHaveBeenLastCalledWith(null);
    ed.activateNote(null);
    expect(all(ed, '.cm-note-active')).toHaveLength(0);
  });
});

describe('analysis highlights', () => {
  test('are marked with their kind and title, follow edits, and clear', () => {
    const ed = mount(doc);
    ed.setAnalysis([
      { ...at('was analysed'), kind: 'passive', title: 'Passive voice' },
      { ...at('very'), kind: 'adverb' },
      { from: 40, to: 999, kind: 'long' },
    ]);
    expect(all(ed, '.cm-an').map((el) => [el.className, el.getAttribute('title')])).toEqual([
      ['cm-an cm-an-passive', 'Passive voice'],
      ['cm-an cm-an-adverb', null],
    ]);
    ed.insertAt(0, 'So. ');
    expect(all(ed, '.cm-an-adverb')[0]?.textContent).toBe('very');
    ed.setAnalysis(null);
    expect(all(ed, '.cm-an')).toHaveLength(0);
  });
});
