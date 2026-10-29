// Instant writing analysis — no model involved. Pure functions over the
// Markdown text, so they run on every keystroke and in tests alike.

const WEAK = [
  'very',
  'really',
  'just',
  'quite',
  'actually',
  'basically',
  'simply',
  'literally',
  'totally',
  'completely',
  'extremely',
  'rather',
  'somewhat',
  'perhaps',
  'kind of',
  'sort of',
  'a bit',
  'a little bit',
  'in order to',
  'it is important to note',
  'it should be noted',
  'needless to say',
  'due to the fact that',
  'the fact that',
  'things',
  'stuff',
];

// Tired phrases, and the tells that make prose read as machine-written.
const CLICHES = [
  "in today's fast-paced world",
  'in today’s fast-paced world',
  'fast-paced world',
  'at the end of the day',
  'think outside the box',
  'game changer',
  'game-changer',
  'move the needle',
  'low-hanging fruit',
  'paradigm shift',
  'synergy',
  'cutting-edge',
  'cutting edge',
  'state-of-the-art',
  'best practices',
  'it goes without saying',
  'in this day and age',
  'perfect storm',
  'the new normal',
  'delve into',
  'delves into',
  'delving into',
  'navigate the complexities',
  'unlock the potential',
  'unlock the power',
  'harness the power',
  'in conclusion',
  'last but not least',
  'at this point in time',
  'each and every',
  'first and foremost',
  'rich tapestry',
  'a testament to',
  'plays a crucial role',
  'plays a pivotal role',
  "it's worth noting",
  'it’s worth noting',
  'in the realm of',
  'ever-evolving',
  'ever-changing landscape',
  'seamlessly',
  'elevate your',
  'take it to the next level',
  'a deep dive',
  'deep dive into',
  'embark on a journey',
  'look no further',
  'in a world where',
];

const ADVERB_OK = new Set(
  'only early family reply apply supply daily likely holy belly jelly ally rally italy july fly ugly silly lonely lovely friendly costly elderly weekly monthly yearly hourly imply comply multiply assembly anomaly bully butterfly curly chilly firefly folly holly homily jolly lily melancholy monopoly oily rely sly tally wily scholarly orderly kindly timely deadly lively manly sickly smelly hilly woolly bubbly'.split(
    ' ',
  ),
);

const IRREGULAR =
  'known shown given taken made written done seen built found held kept left lost paid put said sent set told thought understood won chosen driven eaten fallen forgotten hidden ridden spoken stolen thrown worn broken frozen begun drunk sung brought bought caught fought sought taught felt meant read led fed met shot spent stood sold grown drawn flown blown sworn torn borne born beaten bitten bound bred cast cut dealt dug forbidden forgiven frozen hung hit hurt laid lent lit mistaken overcome proven shaken shut slain sold sunk spun spread struck sworn swept withdrawn'.split(
    ' ',
  );
const PASSIVE_RE = new RegExp(
  `\\b(am|is|are|was|were|be|been|being)\\s+(?:\\w+ly\\s+)?(\\w+ed|${IRREGULAR.join('|')})\\b`,
  'gi',
);

const TABLE_SEPARATOR = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

export interface Block {
  from: number;
  to: number;
  heading?: boolean;
  level?: number;
  list?: boolean;
}

/** Splits the document into prose blocks, skipping code, tables and rules. */
export function blocks(text: string): Block[] {
  const lines = text.split('\n');
  const out: Block[] = [];
  let inFence = false;
  let inTable = false;
  let pos = 0;
  let cur: { from: number; heading: boolean } | null = null;
  const flush = (end: number) => {
    if (cur) {
      out.push({ ...cur, to: end });
      cur = null;
    }
  };
  lines.forEach((line, i) => {
    const from = pos;
    pos += line.length + 1;
    if (/^\s*(```|~~~)/.test(line)) {
      flush(from - 1);
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    // A table starts at a row followed by a |---|---| separator and runs while rows have pipes.
    if (!inTable && line.includes('|') && TABLE_SEPARATOR.test(lines[i + 1] || '')) inTable = true;
    if (inTable) {
      if (line.includes('|')) {
        flush(from - 1);
        return;
      }
      inTable = false;
    }
    if (!line.trim()) {
      flush(from - 1);
      return;
    }
    if (/^#{1,6}\s/.test(line)) {
      flush(from - 1);
      out.push({ from, to: from + line.length, heading: true, level: line.match(/^#+/)![0].length });
      return;
    }
    if (/^\s*([-*_]\s*){3,}$/.test(line)) {
      flush(from - 1);
      return;
    }
    // List items are separate sentences-worth of prose.
    if (/^\s*([-*+]|\d+[.)])\s/.test(line)) {
      flush(from - 1);
      out.push({ from, to: from + line.length, list: true });
      return;
    }
    if (!cur) cur = { from, heading: false };
  });
  flush(text.length);
  return out;
}

// A full stop after these is not the end of a sentence.
const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'mt',
  'vs',
  'e.g',
  'i.e',
  'eg',
  'ie',
  'cf',
  'al',
  'no',
  'nos',
  'fig',
  'figs',
  'approx',
  'est',
  'ca',
  'vol',
  'pp',
  'p',
]);

/**
 * Blanks out what isn't prose — inline code, URLs, link targets — keeping
 * every position where it was, so sentence breaks and highlights can be found
 * on the masked copy and reported against the original.
 */
function mask(s: string): string {
  const blank = (m: string) => ' '.repeat(m.length);
  return s
    .replace(/`[^`\n]*`/g, blank)
    .replace(/\]\([^)\s]*\)/g, (m) => `]${' '.repeat(m.length - 1)}`)
    .replace(/\b(?:https?:\/\/|www\.)\S+/g, blank)
    .replace(/\b[\w-]+@[\w-]+\.[\w.]+\b/g, blank);
}

/** End offsets of the sentences in a masked chunk of prose. */
function sentenceEnds(m: string): number[] {
  const ends: number[] = [];
  const re = /[.!?…]+["”’')\]*_]*(?=\s|$)/g;
  for (let x = re.exec(m); x; x = re.exec(m)) {
    const end = x.index + x[0].length;
    if (x[0][0] === '.') {
      // The whole token before the stop: "Mr", "e.g", "J" — but "P/E" is not an initial.
      const token = m.slice(0, x.index).match(/(\S+)$/)?.[1] || '';
      const word = token.replace(/^[("“‘'[]+/, '').toLowerCase();
      if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word)) continue; // "Mr.", "e.g.", "J."
      const next = m.slice(end).match(/^\s*(\S)/)?.[1];
      if (next && /[a-z]/.test(next)) continue; // "… vs. last year", "etc. and"
    }
    ends.push(end);
  }
  return ends;
}

export interface Sentence {
  from: number;
  to: number;
  text: string;
  /** The same sentence with code, URLs and link targets blanked out (same length). */
  masked: string;
}

/** Sentences with their absolute positions. */
export function sentences(text: string): Sentence[] {
  const out: Sentence[] = [];
  for (const b of blocks(text)) {
    if (b.heading) continue;
    const chunk = text.slice(b.from, b.to);
    const masked = mask(chunk);
    const lead = chunk.match(/^\s*(>\s*|[-*+]\s+|\d+[.)]\s+)?/)![0].length;
    let start = lead;
    for (const end of [...sentenceEnds(masked), chunk.length]) {
      if (end <= start) continue;
      const raw = chunk.slice(start, end);
      const from = b.from + start + (raw.length - raw.trimStart().length);
      const to = b.from + start + raw.trimEnd().length;
      const piece = text.slice(from, to);
      if (to > from && /\w/.test(piece))
        out.push({ from, to, text: piece, masked: masked.slice(from - b.from, to - b.from) });
      start = end;
    }
  }
  return out;
}

const plain = (s: string) =>
  s
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/<\/?u>/gi, '')
    .replace(/[*_`#>]/g, ' ');
const wordsOf = (s: string): string[] => plain(s).match(/[\p{L}\p{N}’']+/gu) || [];

/** Words in a Markdown text, counted the way `stats` counts them, so every count in the app agrees. */
export const countWords = (text: string): number => wordsOf(text).length;

export function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const groups = w
    .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
    .replace(/^y/, '')
    .match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function gradeLabel(grade: number): string {
  if (grade <= 6) return 'Very easy to read';
  if (grade <= 8) return 'Easy to read — plain English';
  if (grade <= 10) return 'Fairly easy to read';
  if (grade <= 12) return 'Standard — fine for most readers';
  if (grade <= 14) return 'Fairly hard to read';
  return 'Hard to read';
}

export interface Stats {
  words: number;
  characters: number;
  sentences: number;
  paragraphs: number;
  readingMinutes: number;
  avgSentence: number;
  grade: number;
  ease: number;
  label: string;
}

export function stats(text: string): Stats {
  const sents = sentences(text);
  const allWords = wordsOf(text);
  const proseWords = sents.flatMap((s) => wordsOf(s.masked));
  const syl = proseWords.reduce((n, w) => n + syllables(w), 0);
  const w = Math.max(1, proseWords.length);
  const s = Math.max(1, sents.length);
  const enough = proseWords.length > 20;
  const grade = enough ? Math.max(0, 0.39 * (w / s) + 11.8 * (syl / w) - 15.59) : 0;
  const ease = enough ? Math.max(0, Math.min(100, 206.835 - 1.015 * (w / s) - 84.6 * (syl / w))) : 0;
  return {
    words: allWords.length,
    characters: text.length,
    sentences: sents.length,
    paragraphs: blocks(text).filter((b) => !b.heading).length,
    readingMinutes: Math.max(allWords.length ? 1 : 0, Math.round(allWords.length / 238)),
    avgSentence: sents.length ? Math.round(proseWords.length / sents.length) : 0,
    grade: Math.round(grade * 10) / 10,
    ease: Math.round(ease),
    label: enough ? gradeLabel(grade) : 'Write a little more for a reading level',
  };
}

export type HighlightKind = 'vlong' | 'long' | 'passive' | 'adverb' | 'weak' | 'cliche';

export interface Highlight {
  from: number;
  to: number;
  kind: HighlightKind;
  title: string;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// One compiled pattern per list, matched case-insensitively against the
// original text — never a lower-cased copy, whose length can differ ("İ")
// and would shift every position after it.
const phraseRe = (phrases: string[]) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}_])(?:${[...phrases]
      .sort((a, b) => b.length - a.length)
      .map(escapeRe)
      .join('|')})(?![\\p{L}\\p{N}_])`,
    'giu',
  );
const WEAK_RE = phraseRe(WEAK);
const CLICHE_RE = phraseRe(CLICHES);

/** Ranges worth a second look, for the editor's highlights. */
export function highlights(text: string): Highlight[] {
  const ranges: Highlight[] = [];
  const sents = sentences(text);
  // Binary search: is this position inside a prose sentence?
  const inProse = (pos: number) => {
    let lo = 0;
    let hi = sents.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pos < sents[mid]!.from) hi = mid - 1;
      else if (pos >= sents[mid]!.to) lo = mid + 1;
      else return true;
    }
    return false;
  };

  for (const s of sents) {
    const n = wordsOf(s.masked).length;
    if (n > 35) ranges.push({ from: s.from, to: s.to, kind: 'vlong', title: `Very long sentence (${n} words)` });
    else if (n > 24) ranges.push({ from: s.from, to: s.to, kind: 'long', title: `Long sentence (${n} words)` });

    for (const m of s.masked.matchAll(PASSIVE_RE)) {
      ranges.push({
        from: s.from + m.index,
        to: s.from + m.index + m[0].length,
        kind: 'passive',
        title: 'Passive voice',
      });
    }
    for (const m of s.masked.matchAll(/\b[A-Za-z]{3,}ly\b/g)) {
      const word = m[0].toLowerCase();
      if (!ADVERB_OK.has(word) && !WEAK.includes(word))
        ranges.push({
          from: s.from + m.index,
          to: s.from + m.index + m[0].length,
          kind: 'adverb',
          title: 'Adverb — is there a stronger verb?',
        });
    }
  }
  for (const [re, kind, title] of [
    [WEAK_RE, 'weak', 'Weak or filler word'],
    [CLICHE_RE, 'cliche', 'Cliché or AI-sounding phrase'],
  ] as const) {
    for (const m of text.matchAll(re))
      if (inProse(m.index)) ranges.push({ from: m.index, to: m.index + m[0].length, kind, title });
  }

  // Keep the outermost of any nested ranges of the same kind.
  ranges.sort((a, b) => a.from - b.from || b.to - a.to);
  return ranges.filter(
    (r, i) => !ranges.slice(0, i).some((o) => o.kind === r.kind && o.from <= r.from && o.to >= r.to),
  );
}

export function countByKind(ranges: Highlight[]): Record<HighlightKind, number> {
  const out: Record<HighlightKind, number> = { vlong: 0, long: 0, passive: 0, adverb: 0, weak: 0, cliche: 0 };
  for (const r of ranges) out[r.kind]++;
  return out;
}

export interface Heading {
  level: number;
  text: string;
  pos: number;
}

export function headings(text: string): Heading[] {
  return blocks(text)
    .filter((b) => b.heading)
    .map((b) => ({ level: b.level!, text: text.slice(b.from, b.to).replace(/^#+\s*/, ''), pos: b.from }));
}
