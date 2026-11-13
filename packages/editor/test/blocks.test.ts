// Drawn Markdown: a table as a table, a task's [ ] as a checkbox, a bullet as
// a dot and --- as a rule — each only while the cursor is away from it.

import { describe, expect, test } from 'vitest';
import { all, mount, mousedown } from './helpers.ts';

const NOTES = `# Field Notes

- [x] Rake the leaves
- [ ] Plan the weekend hike

| Trail | Distance |
|-------|----------|
| Lakeside Loop | 4 km |
| Ridge Path | 9 km |

- Pack water
- Check the weather

1. Tell someone your route

---

The end.`;

const at = (text: string) => NOTES.indexOf(text);

describe('drawn Markdown', () => {
  test('a table stays drawn while the cursor is in it, with editable cells', () => {
    const ed = mount(NOTES);
    const cells = () => (all(ed, '.cm-table input[data-cell]') as HTMLInputElement[]).map((c) => c.value);
    expect(cells()).toEqual(['Trail', 'Distance', 'Lakeside Loop', '4 km', 'Ridge Path', '9 km']);
    expect(ed.view.contentDOM.textContent).not.toContain('|-------|');

    ed.setSelection(at('Ridge Path'));
    expect(all(ed, '.cm-table').length).toBe(1);
    expect(all(ed, '.cm-table input[data-cell]').length).toBe(6);
  });

  test('a table with a note or a tracked change on it stays Markdown, so the passage is underlined', () => {
    const ed = mount(NOTES);
    const km = at('9 km');
    ed.setNotes([{ id: 'n1', from: km, to: km + 4, category: 'numbers' }]);
    expect(all(ed, '.cm-table')).toEqual([]);
    expect(all(ed, '.cm-note').map((n) => n.textContent)).toEqual(['9 km']);
    ed.setNotes([]);
    expect(all(ed, '.cm-table').length).toBe(1);
    ed.addSuggestion({ from: km, to: km + 4, insert: '10 km', status: 'ready' });
    expect(all(ed, '.cm-table')).toEqual([]);
  });

  test('editing a cell writes the table back to Markdown when focus leaves', () => {
    const ed = mount(NOTES);
    const cell = (all(ed, '.cm-table input[data-cell]') as HTMLInputElement[]).find((c) => c.value === '9 km')!;
    cell.focus();
    cell.value = '11 km';
    cell.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: document.body }));
    expect(ed.getText()).toContain('| Ridge Path | 11 km |');
    expect((all(ed, '.cm-table input[data-cell]') as HTMLInputElement[]).map((c) => c.value)).toContain('11 km');
  });

  test('getText commits a cell that is still focused, so a save never writes the old table', () => {
    const ed = mount(NOTES);
    const cell = (all(ed, '.cm-table input[data-cell]') as HTMLInputElement[]).find((c) => c.value === '4 km')!;
    cell.focus();
    cell.value = '5 km';
    expect(ed.getText()).toContain('| Lakeside Loop | 5 km |');
    expect((all(ed, '.cm-table input[data-cell]') as HTMLInputElement[]).map((c) => c.value)).toContain('5 km');
  });

  test('a task’s [ ] is a checkbox that ticks, and a done task recedes', () => {
    const ed = mount(NOTES);
    const boxes = () => all(ed, 'input.cm-task') as HTMLInputElement[];
    expect(boxes().map((b) => b.checked)).toEqual([true, false]);
    expect(all(ed, '.ln-task-done').map((l) => l.textContent)).toEqual(['Rake the leaves']);
    // A task's checkbox is its bullet: no dot beside it.
    expect(all(ed, '.cm-task + .cm-bullet, .cm-bullet + .cm-task')).toEqual([]);

    mousedown(boxes()[1]!);
    expect(ed.getText()).toContain('- [x] Plan the weekend hike');
    expect(boxes().map((b) => b.checked)).toEqual([true, true]);
  });

  test('a bullet is a dot, a numbered item keeps its number, and --- is a rule', () => {
    const ed = mount(NOTES);
    expect(all(ed, '.cm-bullet').map((b) => b.textContent)).toEqual(['•', '•']);
    expect(ed.view.contentDOM.textContent).toContain('1. Tell someone your route');
    expect(all(ed, '.cm-hr').length).toBe(1);

    // With the cursor on them, the Markdown is there to edit.
    ed.setSelection(at('- Pack water'));
    expect(all(ed, '.cm-bullet').length).toBe(1);
    ed.setSelection(at('\n---\n') + 2);
    expect(all(ed, '.cm-hr')).toEqual([]);
  });
});
