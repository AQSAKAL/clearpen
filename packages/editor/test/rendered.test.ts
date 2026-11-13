// Rendered Markdown: the syntax that only describes formatting is hidden at
// rest, and returns where it has to be edited.

import { expect, test } from 'vitest';
import { mount } from './helpers.ts';

const DOC = `# Heading

This is **bold** and *italic* and \`code\` and [link](https://example.com).

> quote
`;

const text = (ed: ReturnType<typeof mount>) => ed.view.contentDOM.textContent ?? '';

test('markers recede at rest, while the words stay', () => {
  const ed = mount(DOC);
  expect(text(ed)).toContain('Heading');
  expect(text(ed)).not.toContain('# Heading');
  expect(text(ed)).toContain('bold');
  expect(text(ed)).not.toContain('**bold**');
  expect(text(ed)).toContain('italic');
  expect(text(ed)).not.toContain('*italic*');
  expect(text(ed)).toContain('code');
  expect(text(ed)).not.toContain('`code`');
  expect(text(ed)).toContain('link');
  expect(text(ed)).not.toContain('https://example.com');
  expect(text(ed)).toContain('quote');
  expect(text(ed)).not.toContain('> quote');
});

test('a heading marker comes back at the start of its line', () => {
  const ed = mount(DOC);
  ed.setSelection(DOC.indexOf('Heading'));
  expect(text(ed)).toContain('# Heading');
});

test('a link shows its brackets and URL while the caret is in it', () => {
  const ed = mount(DOC);
  ed.setSelection(DOC.indexOf('link') + 2);
  expect(text(ed)).toContain('[link](https://example.com)');
});
