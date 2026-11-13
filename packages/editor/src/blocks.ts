// Markdown that reads better drawn than spelled out: a table as a table, a
// task's [ ] as a checkbox, a bullet's - as a dot, --- as a rule. Tasks,
// bullets and rules are drawn while the cursor is away from them; tables stay
// drawn and their cells are edited in place, committing back to Markdown when
// focus leaves the table. A table with a note or a tracked change stays
// Markdown, so the wrong total is underlined where the note says it is.

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { notesField } from './notes.ts';
import type { Suggestion } from './types.ts';

function splitRow(line: string): string[] {
  let text = line.trim();
  if (text.startsWith('|')) text = text.slice(1);
  if (text.endsWith('|')) text = text.slice(0, -1);
  return text.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function joinRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.replace(/\|/g, '\\|')).join(' | ')} |`;
}

function alignment(separator: string): 'left' | 'center' | 'right' {
  const text = separator.trim();
  if (text.startsWith(':') && text.endsWith(':')) return 'center';
  if (text.endsWith(':')) return 'right';
  return 'left';
}

/** Reads the edited cells and puts them back into the table's Markdown. */
function tableSource(wrap: HTMLElement, separator: string[]): string {
  const read = (row: Element) =>
    [...row.querySelectorAll<HTMLInputElement>('input[data-cell]')].map((cell) => cell.value.trim());
  const headRow = wrap.querySelector('thead tr');
  const header = headRow ? read(headRow) : [];
  const body = [...wrap.querySelectorAll('tbody tr')].map(read);
  const columns = header.length;
  if (!columns) return '';
  const separators = Array.from({ length: columns }, (_, index) => separator[index] ?? '---');
  return [joinRow(header), joinRow(separators), ...body.map(joinRow)].join('\n');
}

class TableWidget extends WidgetType {
  readonly source: string;
  readonly from: number;
  private readonly header: string[];
  private readonly separator: string[];
  private readonly body: string[][];

  constructor(source: string, from: number) {
    super();
    this.source = source;
    this.from = from;
    const lines = source.split('\n');
    this.header = splitRow(lines[0] ?? '');
    this.separator = splitRow(lines[1] ?? '');
    this.body = lines.slice(2).map(splitRow);
  }

  override eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from;
  }

  private cell(
    tag: 'th' | 'td',
    row: number,
    column: number,
    value: string,
    align: string,
    commit: () => void,
  ): HTMLElement {
    const cell = document.createElement(tag);
    cell.style.textAlign = align;

    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.dataset.cell = `${row}:${column}`;
    input.spellcheck = true;
    input.style.textAlign = align;
    input.setAttribute('aria-label', `Table cell, row ${row + 1}, column ${column + 1}`);

    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        commit();
        input.blur();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        input.value = value;
        commit();
        input.blur();
      }
    });

    cell.append(input);
    return cell;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table';
    const columns = Math.max(this.header.length, this.separator.length, ...this.body.map((row) => row.length));
    if (!columns) {
      wrap.textContent = this.source;
      return wrap;
    }

    const commit = () => {
      const nextSource = tableSource(wrap, this.separator);
      if (!nextSource || nextSource === this.source) return;
      // The table may have moved or changed while a cell was focused; never
      // write a stale range over newer text.
      if (view.state.doc.sliceString(this.from, this.from + this.source.length) !== this.source) return;
      view.dispatch({
        changes: { from: this.from, to: this.from + this.source.length, insert: nextSource },
        userEvent: 'input.table',
      });
    };
    // getText() can be called while a cell is focused (a save, an export);
    // it reaches in and commits before reading the document.
    (wrap as HTMLElement & { __clearpenCommit?: () => void }).__clearpenCommit = commit;
    const header = Array.from({ length: columns }, (_, index) => this.header[index] ?? '');
    const separators = Array.from({ length: columns }, (_, index) => this.separator[index] ?? '---');
    const body = this.body.map((row) => Array.from({ length: columns }, (_, index) => row[index] ?? ''));

    const table = document.createElement('table');
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    header.forEach((value, column) => {
      headRow.append(this.cell('th', 0, column, value, alignment(separators[column]!), commit));
    });
    thead.append(headRow);
    table.append(thead);

    const tbody = document.createElement('tbody');
    body.forEach((row, index) => {
      const tr = document.createElement('tr');
      row.forEach((value, column) => {
        tr.append(this.cell('td', index + 1, column, value, alignment(separators[column]!), commit));
      });
      tbody.append(tr);
    });
    table.append(tbody);
    wrap.append(table);

    wrap.addEventListener('focusout', (event) => {
      const next = event.relatedTarget as Node | null;
      if (next && wrap.contains(next)) return;
      if (next) {
        commit();
        return;
      }
      // WebKit doesn't always supply relatedTarget; wait until the next
      // focus lands before deciding the table was left.
      setTimeout(() => {
        if (!wrap.contains(document.activeElement)) commit();
      }, 0);
    });

    return wrap;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

class TaskWidget extends WidgetType {
  readonly checked: boolean;
  /** Where the task's "[ ]" starts. */
  readonly from: number;

  constructor(checked: boolean, from: number) {
    super();
    this.checked = checked;
    this.from = from;
  }

  override eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'cm-task';
    box.checked = this.checked;
    box.setAttribute('aria-label', this.checked ? 'Done — mark as to do' : 'To do — mark as done');
    // On mousedown, so the click neither moves the cursor nor blurs the editor.
    box.onmousedown = (ev) => {
      ev.preventDefault();
      view.dispatch({
        changes: { from: this.from + 1, to: this.from + 2, insert: this.checked ? ' ' : 'x' },
        userEvent: 'input.toggle',
      });
    };
    return box;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

class GlyphWidget extends WidgetType {
  readonly glyph: string;
  readonly className: string;

  constructor(glyph: string, className: string) {
    super();
    this.glyph = glyph;
    this.className = className;
  }

  override eq(other: GlyphWidget): boolean {
    return other.glyph === this.glyph && other.className === this.className;
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = this.className;
    span.textContent = this.glyph;
    span.setAttribute('aria-hidden', 'true');
    return span;
  }
}

const bullet = Decoration.replace({ widget: new GlyphWidget('•', 'cm-bullet') });
const rule = Decoration.replace({ widget: new GlyphWidget('', 'cm-hr') });
const hidden = Decoration.replace({});
const doneLine = Decoration.line({ class: 'ln-task-done' });

/** Is any cursor or selection within from–to, its ends included? */
const touches = (state: EditorState, from: number, to: number) =>
  state.selection.ranges.some((r) => r.from <= to && r.to >= from);

function drawn(state: EditorState, suggestions: StateField<readonly Suggestion[]>): DecorationSet {
  const marks: Range<Decoration>[] = [];
  const doc = state.doc;
  // What the writer must see in the text itself: notes' passages, and tracked changes.
  const marked = [...(state.field(notesField, false)?.notes ?? []), ...(state.field(suggestions, false) ?? [])];
  const markedIn = (from: number, to: number) => marked.some((m) => m.from <= to && m.to >= from);
  syntaxTree(state).iterate({
    enter: (node) => {
      switch (node.name) {
        case 'Table': {
          const from = doc.lineAt(node.from).from;
          const to = doc.lineAt(node.to).to;
          // A noted or suggested table stays Markdown so its underline lands
          // on the words; otherwise it stays a table while its cells are edited.
          if (markedIn(from, to)) return false;
          marks.push(
            Decoration.replace({ widget: new TableWidget(doc.sliceString(from, to), from), block: true }).range(
              from,
              to,
            ),
          );
          return false;
        }
        case 'TaskMarker': {
          if (touches(state, node.from, node.to)) return;
          const checked = /x/i.test(doc.sliceString(node.from, node.to));
          // The space after "[ ]" goes too: the checkbox keeps its own.
          const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
          marks.push(Decoration.replace({ widget: new TaskWidget(checked, node.from) }).range(node.from, end));
          if (checked) marks.push(doneLine.range(doc.lineAt(node.from).from));
          return;
        }
        case 'ListMark': {
          const list = node.node.parent?.parent;
          if (list?.name !== 'BulletList') return;
          if (touches(state, node.from, node.to)) return;
          // A task's checkbox is its bullet.
          const task = node.node.nextSibling?.name === 'Task';
          if (task) marks.push(hidden.range(node.from, Math.min(node.to + 1, doc.lineAt(node.from).to)));
          else marks.push(bullet.range(node.from, node.to));
          return;
        }
        case 'HorizontalRule': {
          const line = doc.lineAt(node.from);
          if (touches(state, line.from, line.to)) return;
          marks.push(rule.range(node.from, node.to));
          return;
        }
      }
    },
  });
  return Decoration.set(marks, true);
}

/** The drawn Markdown, kept as the text, the cursor, the parse, the notes and the tracked changes change. */
export const markdownBlocks = (suggestions: StateField<readonly Suggestion[]>) =>
  StateField.define<DecorationSet>({
    create: (state) => drawn(state, suggestions),
    update(value, tr) {
      const changed =
        tr.docChanged || tr.selection || tr.effects.length > 0 || syntaxTree(tr.state) !== syntaxTree(tr.startState);
      return changed ? drawn(tr.state, suggestions) : value;
    },
    provide: (f) => EditorView.decorations.from(f),
  });
