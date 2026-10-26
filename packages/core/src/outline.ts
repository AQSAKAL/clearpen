// The article's own outline: its ## sections, the notes under each, and which
// still need writing. The outline lives in the article, not beside it — so a
// heading you type yourself is as plannable as one the AI suggested.

import type { Outline } from './prompts.ts';

const HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const BULLET = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const FENCE = /^\s*(```|~~~)/;
const IMAGE = /^\s*!\[[^\]]*\]\([^)]*\)\s*$/;

export interface ArticleSection {
  heading: string;
  level: number;
  headingFrom: number;
  headingTo: number;
  /** Where the section's body ends (the next heading, or the end). */
  bodyTo: number;
  /** The bullet notes under the heading. */
  points: string[];
  /** The notes block a draft replaces: first bullet line to the end of the last; null without notes. */
  pointsFrom: number | null;
  pointsTo: number | null;
  /** Has prose (or a quote, or code) — not just notes. */
  written: boolean;
}

interface Line {
  line: string;
  from: number;
  code: boolean;
}

interface Open {
  heading: string;
  level: number;
  headingFrom: number;
  headingTo: number;
  bodyTo: number;
  lines: Line[];
}

function finish(c: Open): ArticleSection {
  const bullets = c.lines.filter((l) => !l.code && BULLET.test(l.line));
  // Anything else with words in it — prose, a quote, code — means it's written.
  const written = c.lines.some((l) => l.line.trim() && (l.code || (!BULLET.test(l.line) && !IMAGE.test(l.line))));
  const last = bullets[bullets.length - 1];
  return {
    heading: c.heading,
    level: c.level,
    headingFrom: c.headingFrom,
    headingTo: c.headingTo,
    bodyTo: c.bodyTo,
    points: bullets.map((l) => l.line.match(BULLET)![1]!.trim()).filter(Boolean),
    pointsFrom: bullets.length ? bullets[0]!.from : null,
    pointsTo: last ? last.from + last.line.length : null,
    written,
  };
}

/**
 * Sections of a Markdown article, one per ## (or deeper) heading. A section
 * runs to the next heading of any level; a single # is a title, not a section.
 */
export function sectionsOf(text: string): ArticleSection[] {
  const lines = String(text).split('\n');
  const out: ArticleSection[] = [];
  let pos = 0;
  let fence = false;
  let cur: Open | null = null;
  const close = (end: number) => {
    if (!cur) return;
    cur.bodyTo = Math.max(cur.headingTo, end);
    out.push(finish(cur));
    cur = null;
  };
  for (const line of lines) {
    const from = pos;
    pos += line.length + 1;
    if (FENCE.test(line)) {
      fence = !fence;
      (cur as Open | null)?.lines.push({ line, from, code: true });
      continue;
    }
    const h = fence ? null : line.match(HEADING);
    if (h) {
      close(from - 1);
      if (h[1]!.length >= 2)
        cur = {
          heading: h[2]!,
          level: h[1]!.length,
          headingFrom: from,
          headingTo: from + line.length,
          bodyTo: 0,
          lines: [],
        };
      continue;
    }
    (cur as Open | null)?.lines.push({ line, from, code: fence });
  }
  close(String(text).length);
  return out;
}

/** An AI outline as Markdown for the article: ## headings with their notes as bullets. */
export function outlineToMarkdown(outline: Partial<Outline> | null | undefined): string {
  return (outline?.sections || [])
    .filter((s) => s.heading)
    .map(
      (s) =>
        `## ${s.heading.trim()}${s.points?.length ? `\n\n${s.points.map((p) => `- ${p.trim()}`).join('\n')}` : ''}`,
    )
    .join('\n\n');
}
