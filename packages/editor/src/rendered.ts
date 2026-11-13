// Rendered Markdown, without giving up the Markdown document. The syntax
// characters that only describe formatting recede: `#` before a heading,
// `**` around bold, backticks around code, the brackets and URL of a link.
//
// The text underneath is untouched, so every offset, suggestion, note and
// AI edit still works. Markers become atomic, so the caret steps over them
// instead of landing inside a hidden `**`.
//
// A few markers come back while they are being edited: a heading or quote
// marker at the start of its line, a link while the caret is inside it, and
// inline code or underline while the caret is inside. Emphasis stays hidden;
// ⌘B and ⌘I are how it is toggled.

import { syntaxTree } from '@codemirror/language';
import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView } from '@codemirror/view';

interface Rendered {
  decorations: DecorationSet;
  atomic: DecorationSet;
}

/** Does the main caret touch a node? */
function touched(state: EditorState, from: number, to: number): boolean {
  const head = state.selection.main.head;
  return head >= from && head <= to;
}

/** At the very start of a heading or quote line, the marker is editable;
 *  sitting at the preceding line boundary on load is not. */
function editingLineMark(state: EditorState, lineFrom: number, markerTo: number, lineTo: number): boolean {
  const head = state.selection.main.head;
  return head > lineFrom && head <= Math.min(markerTo + 1, lineTo);
}

function inside(state: EditorState, node: { from: number; to: number }): boolean {
  return touched(state, node.from, node.to);
}

function build(state: EditorState): Rendered {
  const decorations: Range<Decoration>[] = [];
  const atomic: Range<Decoration>[] = [];

  const hide = (from: number, to: number) => {
    if (to <= from) return;
    const mark = Decoration.replace({});
    decorations.push(mark.range(from, to));
    atomic.push(mark.range(from, to));
  };

  syntaxTree(state).iterate({
    enter: (node) => {
      // These are drawn as whole blocks by blocks.ts; decorating their
      // contents too would overlap the replaced range.
      if (node.name === 'Table' || node.name === 'Image' || node.name === 'FencedCode' || node.name === 'CodeBlock') {
        return false;
      }

      switch (node.name) {
        case 'HeaderMark': {
          const line = state.doc.lineAt(node.from);
          const leading = node.from === line.from;
          // At the start of the heading the caret gets the marker back, so
          // the heading level can be edited. Away from it, the heading reads.
          if (leading && editingLineMark(state, line.from, node.to, line.to)) return;
          const end = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
          hide(node.from, Math.min(end, line.to));
          return;
        }
        case 'QuoteMark': {
          const line = state.doc.lineAt(node.from);
          if (editingLineMark(state, line.from, node.to, line.to)) return;
          const end = state.sliceDoc(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
          hide(node.from, Math.min(end, line.to));
          return;
        }
        case 'EmphasisMark':
        case 'StrikethroughMark':
          hide(node.from, node.to);
          return;
        case 'CodeMark': {
          // Only inline code; a fenced block is skipped above.
          const parent = node.node.parent;
          if (parent?.name !== 'InlineCode') return;
          if (inside(state, parent)) return;
          hide(node.from, node.to);
          return;
        }
        case 'LinkMark':
        case 'URL': {
          const parent = node.node.parent;
          if (parent?.name !== 'Link') return;
          if (inside(state, parent)) return;
          hide(node.from, node.to);
          return;
        }
        case 'UnderlineMark': {
          const parent = node.node.parent;
          if (parent?.name !== 'Underline') return;
          if (inside(state, parent)) return;
          hide(node.from, node.to);
          return;
        }
      }
    },
  });

  return {
    decorations: Decoration.set(decorations, true),
    atomic: Decoration.set(atomic, true),
  };
}

export const renderedMarkdown = StateField.define<Rendered>({
  create: (state) => build(state),
  update(value, tr) {
    if (tr.docChanged || tr.selection || tr.effects.length > 0 || syntaxTree(tr.state) !== syntaxTree(tr.startState)) {
      return build(tr.state);
    }
    return value;
  },
  provide: (field) => [
    EditorView.decorations.compute([field], (state) => state.field(field).decorations),
    EditorView.atomicRanges.of((view) => view.state.field(field).atomic),
  ],
});
