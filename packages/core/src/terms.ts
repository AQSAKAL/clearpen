// The terms registry — what a draft names, and the names it uses for each
// thing — and the margin notes that fall out of it. All code, no model.
//
// - Fenton, "Improving your technical writing skills" (2003), principle 18:
//   decide once what each key thing is called and use that name throughout.
//   His student's report called one thing "project", "group project" and
//   "group", and another "system", "software" and "code"; varied naming
//   "causes confusion and annoyance to readers".
// - Pak, "How to write a clear math paper" (2018), §5.3: once a term is
//   introduced, use only that form. Define "nice graph" and never write "the
//   niceness of graphs": each variant is a new word for a reader without
//   native English.
// - Halevi, "Writing Clear Conference Submissions" (2006), §3, with Pak §1.2:
//   define before use, and remind the reader of a term introduced "four pages
//   ago" — they do not remember it, and may have skipped the definition.
//
// `terms()` is the registry: each defined term with its names, their counts,
// its definition and its first use, plus the clusters of near-synonyms that
// both recur. `termFindings()` turns the registry into notes: a term used
// before it is defined, a derived form of a defined term, several names for
// one thing, a term back after a long gap. Each note is what a reader does at
// that passage, and each kind is capped so a long draft gets a sample.
//
// Spelling is never touched here: British and American forms are the
// spelling-variant check's business, and that only reports consistency. Nor
// is variety flagged as such — the names note asks whether two words name
// one thing; it never says a word was repeated too little.

import { blocks, countWords, type Sentence, sentences } from './analysis.ts';
import type { Span } from './anchor.ts';
import type { Finding } from './checks.ts';
import { stem } from './style.ts';

// ─────────────────────────────────────────────────────────── the registry

/** How a term came to be defined — or, for a cluster, that nothing defines it. */
export type TermSource = 'initials' | 'called' | 'that-is' | 'emphasis' | 'definition' | 'cluster';

export interface TermName {
  name: string;
  count: number;
  /** A derived form the author never defined: "niceness" for "nice graph". */
  variant?: boolean;
}

export interface TermUse extends Span {
  /** Which of the term's names this use is. */
  name: string;
}

export interface Term {
  /** The name as the author wrote it when defining it; for a cluster, its commonest name. */
  name: string;
  /** The head word: the last content word of the name, lower-cased. */
  head: string;
  source: TermSource;
  /** Where the term is defined. Null for a cluster, which nothing defines. */
  definition: Span | null;
  /** The first use anywhere in the draft — before the definition, when the reader meets it too early. */
  first: Span;
  /** Every name used for the thing, with how often. */
  names: TermName[];
  uses: TermUse[];
}

// ─────────────────────────────────────────────────────────── words

const WORD = /[\p{L}\p{N}’']+/gu;

interface Token {
  word: string;
  lower: string;
  from: number;
  to: number;
}

/** The words of a masked sentence at absolute positions; a possessive "’s" is not part of the word. */
function tokens(masked: string, offset = 0): Token[] {
  const out: Token[] = [];
  for (const m of masked.matchAll(WORD)) {
    const word = m[0].replace(/^[’']+|[’']+$/g, '').replace(/[’']s$/, '');
    if (!word) continue;
    const from = offset + m.index + m[0].indexOf(word);
    out.push({ word, lower: word.toLowerCase(), from, to: from + word.length });
  }
  return out;
}

// Function words and the like: never a term on their own, and where a bare
// phrase after "we call this" stops.
const STOP = new Set(
  `a an the and or but nor so yet for of to in on at by with from as into onto about over under between among through during before after above below up down out off again further once than then there here now
   is am are was were be been being has have had having do does did doing will would shall should can could may might must ought
   i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those who whom whose which what where when why how
   not no none nothing never only just also even still very too quite rather more most much many some any such own same other another each both few all several every either neither
   if unless until while although though because since whether like per via within without along across behind beyond upon toward towards despite except
   one ones thing things way ways kind kinds sort part lot lots bit well yes
   first second third next last new old twice thrice once again later earlier whenever wherever
   really truly actually exactly precisely definitely absolutely certainly obviously clearly simply literally totally completely entirely especially particularly mostly mainly largely almost nearly hardly rarely usually sometimes always often`
    .split(/\s+/)
    .filter(Boolean),
);

// Words that sit inside a name without contributing a letter to its initials.
const SMALL = new Set('a an the of and or for in on to at by with de du von van der la le el'.split(' '));

const DETERMINER = new Set(
  'a an the its our their this these that those your my his her each every any such one'.split(' '),
);

// Around an emphasised phrase: what may precede it, what may follow it, and
// what follows a phrase being defined ("**X** is", "**X**:").
const BEFORE_TERM = new Set('a an the this these its our their your my such called call as termed of one'.split(' '));
const AFTER_TERM = new Set(
  'is are was were means refers denotes has have can will does do may might must should of in for to that which and or as with on at by if when where whose from into than because'.split(
    ' ',
  ),
);
const DEFINER = new Set('is are was were means refers denotes'.split(' '));

const q = (s: string) => `“${s}”`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
const isInitials = (s: string) => /^[A-Z0-9][A-Za-z0-9]{1,7}$/.test(s) && (s.match(/[A-Z]/g)?.length ?? 0) >= 2;

const KEEP_PLURAL = new Set(['series', 'species', 'means', 'premises', 'news', 'physics', 'analysis', 'basis']);

/** "nice graphs" registers as "nice graph", so the singular is found too. */
function singular(word: string): string {
  const w = word.toLowerCase();
  if (w.length < 4 || KEEP_PLURAL.has(w) || /(?:ss|us|is|ous|ews|ics)$/.test(w)) return word;
  if (/ies$/.test(w) && w.length > 4) return `${word.slice(0, -3)}y`;
  if (/(?:s|x|z|ch|sh)es$/.test(w)) return word.slice(0, -2);
  if (/s$/.test(w)) return word.slice(0, -1);
  return word;
}

/** A pattern for one name: whole words, any spacing, the last word optionally plural; initials keep their case. */
function nameRe(name: string): RegExp {
  if (isInitials(name)) return new RegExp(`(?<![\\w&/-])${esc(name)}(?:s|’s|'s)?(?![\\w&/-])`, 'g');
  const words = name.split(/[\s-]+/).filter(Boolean);
  const last = words.pop() ?? '';
  const tail = /y$/i.test(last) && last.length > 2 ? `${esc(last.slice(0, -1))}(?:y|ies)` : `${esc(last)}(?:s|es)?`;
  return new RegExp(`(?<![\\p{L}\\p{N}’'-])${[...words.map(esc), tail].join('[\\s-]+')}(?![\\p{L}\\p{N}’'-])`, 'giu');
}

/** Whether `words`, skipping the small ones, begin with the letters of `initials`. */
function spells(words: string[], initials: string): boolean {
  const letters = initials.toLowerCase().replace(/[^a-z]/g, '');
  let i = 0;
  for (const w of words) {
    const c = w.toLowerCase();
    if (i < letters.length && c.startsWith(letters[i]!)) i++;
    else if (!SMALL.has(c)) return false;
  }
  return i === letters.length;
}

/** Whether a run of tokens is one phrase: only spaces and hyphens between them. */
function contiguous(run: Token[], masked: string, offset: number): boolean {
  for (let i = 1; i < run.length; i++) {
    if (!/^[\s-]+$/.test(masked.slice(run[i - 1]!.to - offset, run[i]!.from - offset))) return false;
  }
  return true;
}

/** The content words of a name — what a variant could be derived from. */
const contentWords = (name: string): string[] =>
  name
    .split(/[\s-]+/)
    .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w.length >= 4 && !STOP.has(w) && !SMALL.has(w));

const headOf = (name: string): string => {
  const words = name
    .split(/[\s-]+/)
    .map((w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((w) => w && !SMALL.has(w));
  return words.at(-1) ?? name.toLowerCase();
};

// ─────────────────────────────────────────────────────────── definitions

interface Candidate {
  name: string;
  /** The initials, when the definition pairs a long name with them. */
  alias?: string;
  source: Exclude<TermSource, 'cluster'>;
  definition: Span;
}

// "Long Name (LN)" and "LN (long name)".
const INITIALS_AFTER = /\(([A-Z][A-Za-z0-9]{1,7})s?\)/g;
const INITIALS_BEFORE = /(?<![\w&/-])([A-Z][A-Za-z0-9]{1,7})\s*\(((?:the |a |an )?[\p{L}][\p{L}\p{N}’' -]{2,70})\)/gu;

/** "data quality service (DQS)": the long name is the words whose initials these are. */
function initialsAfter(s: Sentence, out: Candidate[]): void {
  const toks = tokens(s.masked, s.from);
  for (const m of s.masked.matchAll(INITIALS_AFTER)) {
    const initials = m[1]!;
    if (!isInitials(initials)) continue;
    const at = s.from + m.index;
    if (!/[\p{L}\p{N}]\s*$/u.test(s.masked.slice(0, m.index))) continue;
    const before = toks.filter((t) => t.to <= at);
    const n = initials.replace(/[^A-Za-z]/g, '').length;
    for (let k = n; k <= Math.min(before.length, n + 3); k++) {
      const run = before.slice(-k);
      if (
        !contiguous(run, s.masked, s.from) ||
        !spells(
          run.map((t) => t.word),
          initials,
        )
      )
        continue;
      while (run.length && SMALL.has(run[0]!.lower)) run.shift();
      if (!run.length) break;
      out.push({
        name: s.text.slice(run[0]!.from - s.from, run.at(-1)!.to - s.from),
        alias: initials,
        source: 'initials',
        definition: { from: run[0]!.from, to: at + m[0].length },
      });
      break;
    }
  }
}

/** "DQS (data quality service)". */
function initialsBefore(s: Sentence, out: Candidate[]): void {
  for (const m of s.masked.matchAll(INITIALS_BEFORE)) {
    const initials = m[1]!;
    if (!isInitials(initials)) continue;
    const inner = m[2]!;
    const lead = inner.match(/^(?:the|a|an)\s+/)?.[0].length ?? 0;
    const long = inner.slice(lead).trim();
    if (!spells(long.split(/[\s-]+/), initials)) continue;
    const at = s.from + m.index + m[0].indexOf(inner) + lead;
    out.push({
      name: s.text.slice(at - s.from, at - s.from + long.length),
      alias: initials,
      source: 'initials',
      definition: { from: s.from + m.index, to: s.from + m.index + m[0].length },
    });
  }
}

// "we call this X", "which we call X": the object or a quoted phrase tells
// us a name is being given, not a function being called.
const CALL =
  /\b(?:(?:we|i|they|one|people|authors|researchers|economists|engineers|mathematicians|statisticians|linguists|programmers|writers|editors|biologists|physicists|chemists)\s+(?:will\s+|shall\s+|’ll\s+|'ll\s+|also\s+|often\s+|usually\s+|simply\s+|here\s+|sometimes\s+)?call(?:s|ed)?|which\s+(?:we|i)\s+(?:will\s+|shall\s+|’ll\s+|'ll\s+)?call)\s+/giu;
// "X is called Y", "known as Y", "a method called Y".
const CALLED =
  /\b(?:(?:is|are|was|were|be|been|being)\s+(?:also\s+|often\s+|sometimes\s+|usually\s+|commonly\s+|generally\s+|then\s+|here\s+|now\s+|widely\s+|traditionally\s+)?(?:called|known\s+as|referred\s+to\s+as|termed|dubbed|named)|(?:a|an|the|one|this|that)\s+(?:[\p{L}-]+\s+){1,2}called|known\s+as)\s+/giu;

/**
 * The name given right after a naming cue: a quoted or emphasised phrase, or
 * up to three bare words before the next function word or punctuation.
 */
function phraseAfter(s: Sentence, at: number, strict: boolean): Span | null {
  const toks = tokens(s.masked, s.from).filter((t) => t.from >= at);
  let i = 0;
  let pronoun = false;
  if (toks[i] && /^(?:this|that|these|those|it|them)$/.test(toks[i]!.lower)) {
    pronoun = true;
    i++;
  }
  if (toks[i] && /^(?:a|an|the|its|our|their|your|my|his|her|one)$/.test(toks[i]!.lower)) i++;
  const pos = i > 0 ? toks[i - 1]!.to : at;
  const rest = s.masked.slice(pos - s.from);
  const quoted = rest.match(/^\s*[“"‘'*_]+\s*([^”"’'*_\n]{1,60}?)\s*[”"’'*_]+/);
  if (quoted) {
    const from = pos + quoted[0].indexOf(quoted[1]!);
    return { from, to: from + quoted[1]!.length };
  }
  if (strict && !pronoun) return null;
  const picked: Token[] = [];
  let prevTo = pos;
  for (; i < toks.length && picked.length < 3; i++) {
    const t = toks[i]!;
    if (!/^\s*$/.test(s.masked.slice(prevTo - s.from, t.from - s.from)) || STOP.has(t.lower)) break;
    picked.push(t);
    prevTo = t.to;
    if (/^[^\s\p{L}\p{N}]/u.test(s.masked.slice(t.to - s.from))) break;
  }
  if (!picked.length) return null;
  return { from: picked[0]!.from, to: picked.at(-1)!.to };
}

function called(text: string, s: Sentence, out: Candidate[]): void {
  for (const [re, strict] of [
    [CALL, true],
    [CALLED, false],
  ] as const) {
    for (const m of s.masked.matchAll(re)) {
      const span = phraseAfter(s, s.from + m.index + m[0].length, strict);
      if (!span) continue;
      out.push({
        name: singular(text.slice(span.from, span.to)),
        source: 'called',
        definition: { from: s.from + m.index, to: span.to },
      });
    }
  }
}

// "the stress position, that is, the end of the sentence" — set off by commas
// on both sides, so "for a tool, that is an ordering rule" is left alone.
const THAT_IS = /,\s*(?:(?:that is|that is to say),|i\.e\.,?)\s/gi;

function thatIs(text: string, s: Sentence, out: Candidate[]): void {
  const toks = tokens(s.masked, s.from);
  for (const m of s.masked.matchAll(THAT_IS)) {
    const at = s.from + m.index;
    const before = toks.filter((t) => t.to <= at);
    const picked: Token[] = [];
    for (let j = before.length - 1; j >= 0 && picked.length < 3; j--) {
      const t = before[j]!;
      const next = picked[0];
      if (next && !/^\s*$/.test(s.masked.slice(t.to - s.from, next.from - s.from))) break;
      if (STOP.has(t.lower)) break;
      picked.unshift(t);
    }
    if (!picked.length) continue;
    const det = before[before.length - 1 - picked.length];
    if (!det || !DETERMINER.has(det.lower) || !contiguous([det, picked[0]!], s.masked, s.from)) continue;
    out.push({
      name: singular(text.slice(picked[0]!.from, picked.at(-1)!.to)),
      source: 'that-is',
      definition: { from: picked[0]!.from, to: s.to },
    });
  }
}

// **term**, *term*, _term_ — a phrase of one to four words, no punctuation.
const EMPHASIS = /(?<![\p{L}\p{N}])(\*\*|__|\*|_)(?!\s)([^*_\n]{1,60}?)(?<!\s)\1(?![\p{L}\p{N}])/gu;

/** A plausible term inside emphasis markers: short, wordy, not a label and not a function word. */
function emphasised(content: string): boolean {
  if (!/^[\p{L}\p{N}’' -]+$/u.test(content)) return false;
  const words = tokens(content);
  if (!words.length || words.length > 4 || words.every((w) => STOP.has(w.lower))) return false;
  return !(content === content.toUpperCase() && /[A-Z]{2}/.test(content));
}

/** A phrase in bold or italics at its first use, in a defining frame: "A **nice graph** is…", "**Chunking** means…". */
function emphasis(S: Sentence[], s: Sentence, out: Candidate[]): void {
  const toks = tokens(s.masked, s.from);
  for (const m of s.masked.matchAll(EMPHASIS)) {
    const content = m[2]!;
    if (!emphasised(content) || /^definition\b/i.test(content)) continue;
    const open = s.from + m.index;
    const close = open + m[0].length;
    const prev = toks.filter((t) => t.to <= open).at(-1);
    const next = toks.find((t) => t.from >= close);
    const after = s.masked.slice(close - s.from).trimStart();
    const nextOk = !next || AFTER_TERM.has(next.lower) || /^[,.;:!?)(—–]/.test(after);
    const defining =
      !prev || BEFORE_TERM.has(prev.lower) || (!!next && DEFINER.has(next.lower)) || /^[:—–(]/.test(after);
    if (!nextOk || !defining) continue;
    const name = s.text.slice(m.index + m[1]!.length, m.index + m[1]!.length + content.length);
    if (firstUse(S, name) < open + m[1]!.length) continue;
    out.push({ name, source: 'emphasis', definition: { from: open, to: close } });
  }
}

/** Where a name first appears in the prose, or Infinity. */
function firstUse(S: Sentence[], name: string): number {
  const re = nameRe(name);
  for (const s of S) {
    re.lastIndex = 0;
    const m = re.exec(s.masked);
    if (m) return s.from + m.index;
  }
  return Number.POSITIVE_INFINITY;
}

// A paragraph that opens "Definition", "**Definition 2.1.**", "> Definition:".
const DEFINITION_BLOCK = /^\s*(?:[-*+]|\d+[.)])?\s*(?:>\s*)?(?:\*\*|__|\*|_)?\s*Definition\b/i;
const strip = (s: string) => s.replace(/[*_]/g, '').trim();

function definitionBlocks(text: string, out: Candidate[]): void {
  for (const b of blocks(text)) {
    if (b.heading) continue;
    const chunk = text.slice(b.from, b.to);
    if (!DEFINITION_BLOCK.test(chunk)) continue;
    const definition = { from: b.from, to: b.to };
    // "Definition 3 (nice graph)."
    const named = chunk.match(/Definition\b\s*[\d.]*\s*\(([^()]{2,60})\)/i);
    if (named) {
      out.push({ name: strip(named[1]!), source: 'definition', definition });
      continue;
    }
    // The first phrase in bold or italics, after the label itself.
    let found = false;
    for (const m of chunk.matchAll(EMPHASIS)) {
      const content = m[2]!;
      if (/^definition\b/i.test(content) || !emphasised(content)) continue;
      out.push({ name: singular(content.trim()), source: 'definition', definition });
      found = true;
      break;
    }
    if (found) continue;
    // "A graph is nice if…", "is said to be bipartite when…"
    const property = chunk.match(
      /\b(?:is|are)\s+(?:said to be\s+|called\s+)?((?:[\p{L}][\p{L}-]*\s+){0,2}[\p{L}][\p{L}-]*)\s+(?:if|iff|when|whenever|provided|precisely when)\b/iu,
    );
    if (property) {
      const name = property[1]!.replace(/^(?:a|an|the)\s+/i, '');
      if (!STOP.has(name.toLowerCase())) {
        out.push({ name: singular(name), source: 'definition', definition });
        continue;
      }
    }
    // "Definition. The stress position is the end of a sentence."
    const subject = chunk.match(
      /Definition\b[^.:]*?[.:]?\s*(?:\*\*|__|\*|_)?\s*(?:A|An|The)\s+((?:[\p{L}-]+\s+){0,3}[\p{L}-]+?)\s+(?:is|are|was|were|has|have|means|refers|denotes|consists|holds|if|when|,)/iu,
    );
    if (subject && !STOP.has(subject[1]!.toLowerCase()))
      out.push({ name: singular(subject[1]!), source: 'definition', definition });
  }
}

const key = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();

/** Every definition in the draft, one candidate per thing: the earliest definition wins, aliases merge. */
function candidates(text: string, S: Sentence[]): Candidate[] {
  const raw: Candidate[] = [];
  for (const s of S) {
    initialsAfter(s, raw);
    initialsBefore(s, raw);
    called(text, s, raw);
    thatIs(text, s, raw);
    emphasis(S, s, raw);
  }
  definitionBlocks(text, raw);
  const byKey = new Map<string, Candidate>();
  for (const c of raw.sort((a, b) => a.definition.from - b.definition.from)) {
    const k = key(c.name);
    if (k.length < 2 || STOP.has(k) || SMALL.has(k)) continue;
    const existing = byKey.get(k) ?? (c.alias ? byKey.get(key(c.alias)) : undefined);
    if (existing) {
      if (c.alias && !existing.alias) {
        existing.alias = c.alias;
        byKey.set(key(c.alias), existing);
      }
      continue;
    }
    byKey.set(k, c);
    if (c.alias) byKey.set(key(c.alias), c);
  }
  return [...new Set(byKey.values())];
}

// ─────────────────────────────────────────────────────────── variants (Pak)

// "nice" → "niceness", "token" → "tokenisation", "graph" → "graphical". A
// plural is not a variant: "nice graphs" is still the defined term.
const SUFFIXES =
  'ness ity ities ly ise ize ised ized ises izes isation ization isations izations ation ations al ally ic ical ically ful less ive ment ments er ers ous ify ified ifies ification ance ence ancy ency ist ists ism'.split(
    ' ',
  );

/** The derived forms a word could take. */
function derivations(word: string): Set<string> {
  const out = new Set<string>();
  const w = word.toLowerCase();
  if (w.length < 4) return out;
  const roots = new Set([w]);
  if (w.endsWith('e')) roots.add(w.slice(0, -1));
  if (w.endsWith('y')) roots.add(`${w.slice(0, -1)}i`);
  for (const r of roots) for (const suffix of SUFFIXES) out.add(r + suffix);
  return out;
}

interface Variant {
  name: string;
  count: number;
  first: Span;
}

interface Defined extends Term {
  definition: Span;
  variants: Variant[];
}

/** Derived forms of a defined term's words, outside the term's own uses. */
function variantsOf(name: string, uses: TermUse[], S: Sentence[], taken: Set<string>): Variant[] {
  const words = contentWords(name);
  if (!words.length) return [];
  const forms = words.map((w) => ({ word: w, stem: stem(w), derived: derivations(w) }));
  const inUse = (t: Token) => uses.some((u) => u.from <= t.from && t.to <= u.to);
  const found = new Map<string, Variant>();
  for (const s of S) {
    const toks = tokens(s.masked, s.from);
    const stems = new Set(toks.map((t) => stem(t.lower)));
    for (const t of toks) {
      if (taken.has(t.lower) || inUse(t)) continue;
      const f = forms.find((x) => x.derived.has(t.lower));
      if (!f) continue;
      // For a multi-word term, the rest of the term must be nearby: "clearly" is not a variant of "clear writing".
      if (forms.length > 1 && !forms.some((x) => x !== f && stems.has(x.stem))) continue;
      const v = found.get(t.lower) ?? { name: t.word, count: 0, first: { from: t.from, to: t.to } };
      v.count++;
      found.set(t.lower, v);
    }
  }
  return [...found.values()].sort((a, b) => a.first.from - b.first.from);
}

/** The defined terms, with their uses and variants. */
function defined(text: string, S: Sentence[]): Defined[] {
  const list = candidates(text, S);
  const taken = new Set(list.flatMap((c) => [key(c.name), ...(c.alias ? [key(c.alias)] : [])]));
  const out: Defined[] = [];
  for (const c of list) {
    const names = [c.name, ...(c.alias ? [c.alias] : [])];
    const uses: TermUse[] = [];
    for (const n of names) {
      const re = nameRe(n);
      for (const s of S)
        for (const m of s.masked.matchAll(re))
          uses.push({ from: s.from + m.index, to: s.from + m.index + m[0].length, name: n });
    }
    uses.sort((a, b) => a.from - b.from || b.to - a.to);
    const kept = uses.filter((u, i) => !uses.slice(0, i).some((o) => o.from <= u.from && u.to <= o.to));
    if (!kept.length) continue;
    const variants = variantsOf(c.name, kept, S, taken);
    // A phrase in bold, or one followed by "that is", is a term only if the draft goes on to use it.
    if ((c.source === 'emphasis' || c.source === 'that-is') && kept.length < 2 && !variants.length) continue;
    out.push({
      name: c.name,
      head: headOf(c.name),
      source: c.source,
      definition: c.definition,
      first: { from: kept[0]!.from, to: kept[0]!.to },
      names: [
        ...names.map((n) => ({ name: n, count: kept.filter((u) => u.name === n).length })).filter((x) => x.count),
        ...variants.map((v) => ({ name: v.name, count: v.count, variant: true })),
      ],
      uses: kept,
      variants,
    });
  }
  return out.sort((a, b) => a.first.from - b.first.from);
}

// ─────────────────────────────────────────────────────────── several names for one thing (Fenton)

interface Synonym {
  name: string;
  /** A modifier that makes a different thing of it: "operating system". */
  before?: RegExp;
  /** A following word that makes a different thing of it: "user interface". */
  after?: RegExp;
}

// Small known clusters. A name counts only as a noun with a determiner in
// front ("the system", "our new plan"), never as a verb ("we plan to").
const CLUSTERS: Synonym[][] = [
  [
    {
      name: 'system',
      before:
        /^(?:operating|file|solar|immune|nervous|legal|coordinate|number|caste|class|belief|value|type|ecosystem)$/i,
      after:
        /^(?:prompt|prompts|call|calls|clock|time|load|administrator|admin|admins|level|font|fonts|message|messages)$/i,
    },
    {
      name: 'software',
      after:
        /^(?:engineer|engineers|engineering|developer|developers|development|company|companies|industry|vendor|vendors|update|updates|license|licence|licenses|licences|bug|bugs|team|teams|stack|architecture)$/i,
    },
    {
      name: 'tool',
      before: /^(?:power|hand|garden|cutting|machine)$/i,
      after: /^(?:bar|bars|tip|tips|chain|kit|kits|box|call|calls|use|belt)$/i,
    },
    {
      name: 'program',
      before:
        /^(?:tv|television|training|loyalty|research|degree|pilot|space|nuclear|exercise|fitness|rewards|radio|news|master’s|master's|mba|phd|graduate)$/i,
      after: /^(?:manager|managers|management|committee|office|director|counter|notes)$/i,
    },
  ],
  [
    {
      name: 'plan',
      before:
        /^(?:floor|lesson|meal|pension|payment|pricing|seating|flight|data|phone|health|retirement|savings|game)$/i,
      after: /^(?:b|c)$/i,
    },
    { name: 'spec', after: /^(?:sheet|sheets)$/i },
    { name: 'specification' },
  ],
  [
    {
      name: 'user',
      after:
        /^(?:interface|interfaces|experience|experiences|name|names|id|ids|agent|agents|story|stories|guide|guides|manual|manuals|base|group|groups|research|testing|input|inputs|session|sessions|error|errors|data|account|accounts)$/i,
    },
    {
      name: 'customer',
      after:
        /^(?:service|services|support|success|base|journey|journeys|satisfaction|experience|lifetime|acquisition|churn|data|feedback|retention)$/i,
    },
    {
      name: 'client',
      before:
        /^(?:http|https|api|rest|grpc|graphql|email|mail|desktop|mobile|web|thin|thick|fat|ssh|git|database|db|redis|sql|command-line|native|browser)$/i,
      after:
        /^(?:side|library|libraries|code|app|apps|application|applications|certificate|certificates|id|ids|secret|secrets|credentials|request|requests|version|versions)$/i,
    },
  ],
  [
    { name: 'article', before: /^(?:indefinite|definite)$/i, after: /^\d/ },
    { name: 'post', after: /^(?:office|offices|mortem|mortems|code|codes|hoc|box|processing|production|war|date)$/i },
    { name: 'piece', after: /^of$/i },
  ],
];

const DETERMINED =
  '(?:the|a|an|this|that|these|those|our|your|their|its|my|his|her|each|every|whole|entire|same|new|old|current|original|final|first|second|existing|proposed|resulting|such|any|one|another|both)';
const synonymRe = (name: string) =>
  new RegExp(
    `(?<![\\p{L}\\p{N}’'-])${DETERMINED}\\s+(?:([\\p{L}’'-]+)\\s+)?(${esc(name)}(?:s|es)?)(?![\\p{L}\\p{N}’'-])(?:\\s+([\\p{L}’'-]+))?`,
    'dgiu',
  );

interface Cluster extends Term {
  definition: null;
}

/** Two or more names from one known cluster, each used at least twice. */
function clusters(S: Sentence[]): Cluster[] {
  const out: Cluster[] = [];
  for (const group of CLUSTERS) {
    const siblings = new Set(group.map((g) => g.name));
    const hits = group.map((g) => {
      const re = synonymRe(g.name);
      const uses: TermUse[] = [];
      for (const s of S) {
        for (const m of s.masked.matchAll(re)) {
          const modifier = m[1]?.toLowerCase() ?? '';
          const following = m[3] ?? '';
          if (modifier && (siblings.has(singular(modifier)) || g.before?.test(modifier))) continue;
          if (following && g.after?.test(following)) continue;
          const [from, to] = m.indices![2]!;
          uses.push({ from: s.from + from, to: s.from + to, name: g.name });
        }
      }
      return { name: g.name, uses };
    });
    const recurring = hits.filter((h) => h.uses.length >= 2).sort((a, b) => b.uses.length - a.uses.length);
    if (recurring.length < 2) continue;
    const uses = recurring.flatMap((h) => h.uses).sort((a, b) => a.from - b.from);
    out.push({
      name: recurring[0]!.name,
      head: recurring[0]!.name,
      source: 'cluster',
      definition: null,
      first: { from: uses[0]!.from, to: uses[0]!.to },
      names: recurring.map((h) => ({ name: h.name, count: h.uses.length })),
      uses,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────── entry points

/**
 * The draft's terms: each thing it defines — "Long Name (LN)", "LN (long
 * name)", "we call this X", "X is called Y", "known as X", "X, that is, …",
 * a phrase in bold or italics at its first use, a "Definition" paragraph —
 * with every name used for it, their counts, the definition and the first
 * use; and, after them, each cluster of near-synonyms the draft keeps
 * switching between.
 */
export function terms(text: string, S: Sentence[] = sentences(text)): Term[] {
  const list: Term[] = [
    ...defined(text, S).map(({ name, head, source, definition, first, names, uses }) => ({
      name,
      head,
      source,
      definition,
      first,
      names,
      uses,
    })),
    ...clusters(S),
  ];
  return list.sort((a, b) => a.first.from - b.first.from);
}

// A sentence that recalls what a term is: no reminder note needed there.
const REMINDER =
  /\b(?:recall|remember|remind(?:er|s|ed)?|as (?:defined|introduced|described|explained|noted|discussed|above|earlier|before)|(?:defined|introduced) (?:above|earlier|before|in|on|at)|from (?:section|§|above)|see (?:section|§|above)|\(see\b|that is,|i\.e\.|in other words|namely)/i;
const GAP_WORDS = 1500;

/** Caps per kind for one draft, so a long piece gets a sample, not a flood. */
const CAPS: Record<string, number> = {
  'term-before-definition': 6,
  'term-variant': 6,
  'term-names': 4,
  'term-reminder': 4,
};

/**
 * Notes from the registry: a term used before it is defined, a derived form
 * of a defined term, several names for one thing, and a term that returns
 * after a long gap with nothing to recall it. `S` is the draft's sentences,
 * shared with the other checks.
 */
export function termFindings(text: string, S: Sentence[] = sentences(text)): Finding[] {
  const out: Finding[] = [];
  const sentenceAt = (pos: number) => S.find((s) => s.from <= pos && pos < s.to);
  for (const t of defined(text, S)) {
    const { definition } = t;
    // Met before it is explained: Pak's reader gives up on page 3.
    if (t.first.from < definition.from) {
      const defined = clip(text.slice(definition.from, definition.to).replace(/\s+/g, ' ').trim(), 70);
      out.push({
        ...t.first,
        kind: 'term-before-definition',
        category: 'clarity',
        title: 'Used before it is defined',
        message: `${q(t.name)} is defined only later (${q(defined)}). Readers meet it here first: define it here, or point forward to where you do.`,
        related: definition,
      });
    }
    // "niceness" for "nice graph": a new word for the reader.
    for (const v of t.variants) {
      out.push({
        ...v.first,
        kind: 'term-variant',
        category: 'consistency',
        title: 'A new form of a defined term',
        message: `You defined ${q(t.name)}; ${q(v.name)} is a new word, and a reader has to work out that it means the same thing. Use the defined form.`,
        related: definition,
      });
    }
    // Back after four pages: the reader has forgotten, or never saw, the definition.
    for (let i = 1; i < t.uses.length; i++) {
      const prev = t.uses[i - 1]!;
      const use = t.uses[i]!;
      const gap = countWords(text.slice(prev.to, use.from));
      if (gap <= GAP_WORDS) continue;
      const s = sentenceAt(use.from);
      const reminded =
        !s ||
        REMINDER.test(s.masked) ||
        /^\s*[(,—–:]/.test(s.masked.slice(use.to - s.from)) ||
        use.from === definition.from;
      if (reminded) continue;
      out.push({
        ...use,
        kind: 'term-reminder',
        category: 'clarity',
        title: 'Back after a long gap',
        message: `${q(t.name)} last appeared ${gap.toLocaleString('en-US')} words ago. A reader who skipped the definition, or forgot it, needs a few words here recalling what it is.`,
        related: definition,
      });
      break;
    }
  }
  // "system" here, "software" there: are they one thing?
  for (const c of clusters(S)) {
    const [main, second] = c.names;
    const list = c.names.map((n) => `${q(n.name)} (${n.count}×)`);
    const said = list.length > 2 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list.join(' and ');
    const at = c.uses.find((u) => u.name === second!.name)!;
    const anchor = c.uses.find((u) => u.name === main!.name)!;
    out.push({
      from: at.from,
      to: at.to,
      kind: 'term-names',
      category: 'consistency',
      title: 'Several names for one thing?',
      message: `This draft says ${said}. If these name one thing, give it one name and keep it: readers take different words to mean different things.`,
      related: { from: anchor.from, to: anchor.to },
    });
  }
  const counts = new Map<string, number>();
  return out
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .filter((f) => {
      const n = (counts.get(f.kind) ?? 0) + 1;
      counts.set(f.kind, n);
      return n <= (CAPS[f.kind] ?? Number.POSITIVE_INFINITY);
    });
}
