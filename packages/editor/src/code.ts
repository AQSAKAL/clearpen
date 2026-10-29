// Code in the text, typeset: a fenced block is drawn as one box, its fences
// and language name receding, and the languages Clearpen knows are coloured —
// JavaScript and TypeScript (JSX too), CSS and HTML. A block in any other
// language is still code in a box, just not coloured. A language's parser
// loads the first time a block needs it.

import { HighlightStyle, LanguageDescription, syntaxTree } from '@codemirror/language';
import { type Range, RangeSetBuilder } from '@codemirror/state';
import { Decoration, type DecorationSet, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view';
import { tags as t } from '@lezer/highlight';

const js =
  (opts: { typescript?: boolean; jsx?: boolean } = {}) =>
  async () =>
    (await import('@codemirror/lang-javascript')).javascript(opts);

/** The languages a fence may name ("```ts"), by any of their usual names. */
export const codeLanguages: LanguageDescription[] = [
  LanguageDescription.of({ name: 'JavaScript', alias: ['js', 'javascript', 'node', 'mjs', 'cjs'], load: js() }),
  LanguageDescription.of({
    name: 'TypeScript',
    alias: ['ts', 'typescript', 'mts', 'cts'],
    load: js({ typescript: true }),
  }),
  LanguageDescription.of({ name: 'JSX', alias: ['jsx'], load: js({ jsx: true }) }),
  LanguageDescription.of({ name: 'TSX', alias: ['tsx'], load: js({ typescript: true, jsx: true }) }),
  LanguageDescription.of({
    name: 'CSS',
    alias: ['css'],
    load: async () => (await import('@codemirror/lang-css')).css(),
  }),
  LanguageDescription.of({
    name: 'HTML',
    alias: ['html', 'htm', 'svg'],
    load: async () => (await import('@codemirror/lang-html')).html(),
  }),
];

/** The classes code is coloured with; the stylesheet colours them only inside a code block. */
export const codeHighlight = HighlightStyle.define([
  {
    tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.operatorKeyword, t.definitionKeyword, t.modifier, t.self],
    class: 'tok-keyword',
  },
  { tag: [t.string, t.special(t.string), t.regexp, t.character, t.attributeValue], class: 'tok-string' },
  { tag: [t.number, t.bool, t.null, t.atom, t.unit], class: 'tok-number' },
  { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], class: 'tok-comment' },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName), t.function(t.definition(t.variableName))],
    class: 'tok-function',
  },
  { tag: [t.typeName, t.className, t.namespace, t.tagName], class: 'tok-type' },
  { tag: [t.propertyName, t.attributeName], class: 'tok-property' },
  // The language name after the opening fence.
  { tag: t.labelName, class: 'md-code-info' },
]);

// The first and last lines of each fenced block, so the box gets its corners.
function blockEnds(view: EditorView): DecorationSet {
  const marks: Range<Decoration>[] = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(view.state).iterate({
      from,
      to,
      enter: (node) => {
        if (node.name !== 'FencedCode') return;
        const first = view.state.doc.lineAt(node.from);
        const last = view.state.doc.lineAt(node.to);
        marks.push(Decoration.line({ class: 'ln-code-first' }).range(first.from));
        marks.push(Decoration.line({ class: 'ln-code-last' }).range(last.from));
        return false;
      },
    });
  }
  marks.sort((a, b) => a.from - b.from || (a.value.spec.class < b.value.spec.class ? -1 : 1));
  const builder = new RangeSetBuilder<Decoration>();
  for (const m of marks) builder.add(m.from, m.from, m.value);
  return builder.finish();
}

export const codeBlocks = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = blockEnds(view);
    }
    update(u: ViewUpdate) {
      // A language that loads reparses the block: the tree changes without the text.
      if (u.docChanged || u.viewportChanged || syntaxTree(u.state) !== syntaxTree(u.startState))
        this.decorations = blockEnds(u.view);
    }
  },
  { decorations: (v) => v.decorations },
);
