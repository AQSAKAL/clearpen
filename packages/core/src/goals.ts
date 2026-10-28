// What the writer will write. Asked once, on the first run, after the model
// is set up: the answer picks the example article that opens and the genre
// new articles start with. One small table, so that a writing mode (a preset
// of rules and a fill-in template) can be attached to each goal with one
// edit, and the examples can be tested for the errors planted in them.

import type { Genre } from './checks.ts';

export interface Goal {
  id: string;
  /** What the writer sees: "A technical guide". */
  label: string;
  /** One line under the label. */
  hint: string;
  /** The genre new articles start with: which checks run, who the review reads for. */
  genre: Genre;
  /** The example article that opens: the name of its Markdown file, without the extension. */
  example: string;
}

export const GOALS = [
  {
    id: 'article',
    label: 'An article',
    hint: 'An essay, a blog post, a piece for a magazine.',
    genre: 'article',
    example: 'article',
  },
  {
    id: 'technical',
    label: 'A technical guide',
    hint: 'Steps a practitioner will follow exactly as written.',
    genre: 'technical',
    example: 'technical',
  },
  {
    id: 'scientific',
    label: 'A scientific paper',
    hint: 'Claims, evidence, defined terms, the result stated early.',
    genre: 'scientific',
    example: 'scientific',
  },
  {
    id: 'reflection',
    label: 'A reflection or journal',
    hint: 'Thinking on the page: a decision, a day, how you feel.',
    genre: 'article',
    example: 'reflection',
  },
  {
    id: 'business',
    label: 'A business case',
    hint: 'A recommendation, what it costs and what could go wrong.',
    genre: 'business',
    example: 'business',
  },
  {
    id: 'investment',
    label: 'An investment note',
    hint: 'A thesis and a valuation, every figure held against the tables.',
    genre: 'investment',
    example: 'investment',
  },
] as const satisfies readonly Goal[];

export type GoalId = (typeof GOALS)[number]['id'];

export const isGoal = (id: unknown): id is GoalId => GOALS.some((g) => g.id === id);

/** The goal with this id, or null for a stored value that no longer names one. */
export const goalOf = (id: unknown): Goal | null => GOALS.find((g) => g.id === id) ?? null;

// ─────────────────────────────────────────────────────────── the examples

/** A passage planted in an example for a check to catch: the finding's kind, and words inside its passage. */
export interface Planted {
  kind: string;
  quote: string;
}

export interface Example {
  title: string;
  planted: Planted[];
  /** The article's text, without the front matter. */
  content: string;
}

/** The mark that opens a line of the tour: a one-line instruction beside a passage. */
export const TOUR_MARK = '> ✎';

/**
 * Splits an example file into its front matter and its text. The front
 * matter is three lines of YAML at most — a title and the list of planted
 * passages — so a few string operations read it:
 *
 *     ---
 *     title: Why we moved support to a shared inbox
 *     planted:
 *       - generalisation: every customer
 *     ---
 */
export function parseExample(raw: string): Example {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { title: '', planted: [], content: raw };
  const planted: Planted[] = [];
  let title = '';
  for (const line of m[1]!.split('\n')) {
    const t = line.match(/^title:\s*(.+?)\s*$/);
    if (t) title = t[1]!;
    const p = line.match(/^\s+-\s+([\w-]+):\s*(.+?)\s*$/);
    if (p) planted.push({ kind: p[1]!, quote: p[2]! });
  }
  return { title, planted, content: raw.slice(m[0].length).replace(/^\n+/, '') };
}

/** The spans of the tour's lines in an example's text, so a test can see that no check lands on them. */
export function tourLines(content: string): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let pos = 0;
  for (const line of content.split('\n')) {
    if (line.startsWith(TOUR_MARK)) out.push({ from: pos, to: pos + line.length });
    pos += line.length + 1;
  }
  return out;
}
