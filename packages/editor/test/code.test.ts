// Code in the text: a fenced block drawn as one box, the languages Clearpen
// knows coloured once their parser loads, and any other still code, uncoloured.
// And the dots that say a suggestion is on its way.

import { describe, expect, test, vi } from 'vitest';
import { all, mount } from './helpers.ts';

const lineClasses = (ed: ReturnType<typeof mount>) =>
  [...ed.view.contentDOM.querySelectorAll('.cm-line')].map((l) => l.className);

describe('code blocks', () => {
  test('a block in a language Clearpen knows is coloured, inside a box with corners', async () => {
    const ed = mount('Before.\n\n```ts\nconst total: number = 42; // the sum\n```\n\nAfter.');
    await vi.waitFor(() => expect(all(ed, '.tok-keyword').length).toBeGreaterThan(0), { timeout: 3000 });
    const text = (sel: string) => all(ed, sel).map((e) => e.textContent);
    expect(text('.tok-keyword')).toContain('const');
    expect(text('.tok-type')).toContain('number');
    expect(text('.tok-number')).toContain('42');
    expect(text('.tok-comment')).toContain('// the sum');
    expect(text('.md-code-info')).toEqual(['ts']);
    const lines = lineClasses(ed);
    expect(lines[2]).toMatch(/ln-code\b.*ln-code-first|ln-code-first.*ln-code\b/);
    expect(lines[4]).toMatch(/ln-code-last/);
    expect(lines[0]).not.toMatch(/ln-code/);
  });

  test('a block in any other language is still a box of code, just not coloured', async () => {
    const ed = mount('```rust\nfn main() { println!("hi"); }\n```');
    await new Promise((r) => setTimeout(r, 50));
    expect(lineClasses(ed).every((c) => /ln-code/.test(c))).toBe(true);
    expect(lineClasses(ed)[0]).toMatch(/ln-code-first/);
    expect(lineClasses(ed)[2]).toMatch(/ln-code-last/);
    expect(all(ed, '.tok-keyword')).toEqual([]);
  });

  test('inline code and prose are not coloured as code', async () => {
    const ed = mount('Run `const x = 1` and see.');
    await new Promise((r) => setTimeout(r, 50));
    expect(all(ed, '.tok-keyword')).toEqual([]);
    expect(all(ed, '.md-code').map((e) => e.textContent)).toEqual(['const x = 1']);
  });
});

describe('a suggestion on its way', () => {
  test('shows three dots, read out as what is happening, with nothing for Tab to take', () => {
    const ed = mount('Every goal hurts.');
    ed.showGhost(17, '', 'Working on a suggestion', 'pending');
    const [dots] = all(ed, '.cm-ghost-pending');
    expect(dots?.getAttribute('role')).toBe('status');
    expect(dots?.getAttribute('aria-label')).toBe('Working on a suggestion');
    expect(dots?.children.length).toBe(3);
    expect(ed.acceptGhost()).toBe(false);
    expect(ed.getText()).toBe('Every goal hurts.');
    // The answer takes its place.
    ed.showGhost(17, ' So choose.');
    expect(all(ed, '.cm-ghost-pending')).toEqual([]);
    expect(all(ed, '.cm-ghost').map((e) => e.textContent)).toEqual([' So choose.']);
  });
});
