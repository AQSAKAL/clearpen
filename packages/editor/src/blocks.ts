// Markdown that reads better drawn than spelled out: a table as a table, a
// task's [ ] as a checkbox, a bullet's - as a dot, --- as a rule. Each is
// drawn only while the cursor is away from it; with the cursor on it, the
// Markdown is there to edit as typed. A click on a drawn table puts the
// cursor in the row clicked. The table is drawn by the same renderer as
// Reader mode and the exports, which escapes everything first. A table with a
// note or a tracked change on it stays Markdown, so the wrong total is
// underlined where the note says it is.

import { toHTML } from '@clearpen/core';
import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import { notesField } from './notes.ts';
import type { Suggestion } from './types.ts';

class TableWidget extends WidgetType {
  readonly source: string;
  readonly from: number;

  constructor(source: string, from: number) {
    super();
    this.source = source;
    this.from = from;
  }

  override eq(other: TableWidget): boolean {
    return other.source === this.source && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-table';
    wrap.innerHTML = toHTML(this.source);
    // A click edits the row it lands on: the header is the table's first line,
    // the rule under it the second, then a line a row.
    wrap.onmousedown = (ev) => {
      ev.preventDefault();
      const row = (ev.target as Element | null)?.closest('tr');
      const index = row ? [...wrap.querySelectorAll('tr')].indexOf(row) : 0;
      const line = view.state.doc.lineAt(this.from).number + (index > 0 ? index + 1 : 0);
      view.dispatch({ selection: { anchor: view.state.doc.line(Math.min(line, view.state.doc.lines)).to } });
      view.focus();
    };
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
          if (touches(state, from, to) || markedIn(from, to)) return false;
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
