// The example articles, one per goal: a short, real piece of that kind with
// blanks in [brackets] and a built-in tour — passages planted for Clearpen's
// checks to catch, each with a one-line instruction beside it. The Markdown
// files sit beside this one and are imported as text; a test in core runs the
// checks on every one, so the tour cannot rot.

import { type Brief, type Goal, parseExample } from '@clearpen/core';
import article from './article.md?raw';
import business from './business.md?raw';
import investment from './investment.md?raw';
import reflection from './reflection.md?raw';
import scientific from './scientific.md?raw';
import technical from './technical.md?raw';

const FILES: Record<string, string> = { article, technical, scientific, reflection, business, investment };

/** The article to create for a goal: its title, its text with `mod` for ⌘, and a brief already of its kind. */
export function exampleArticle(goal: Goal, mod: string): { title: string; content: string; brief: Brief } {
  const raw = FILES[goal.example];
  if (!raw) throw new Error(`There is no example for “${goal.label}”.`);
  const { title, content } = parseExample(raw);
  return { title, content: mod === '⌘' ? content : content.replaceAll('⌘', mod), brief: { genre: goal.genre } };
}
