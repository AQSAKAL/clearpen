// Autocorrect: Clearpen fixes the writer's slips as they type — their own words,
// spelled right, never new ones. Two layers:
//
// - As each word ends, exact rules that need no model: a capital to start a
//   sentence, "i" → "I", and slips nobody means ("teh", "dont"). Instant and
//   offline.
// - As each sentence ends, the model proofreads it (mi → my, then → than).
//   Code keeps only the fixes that are small and safe: never a name, a number,
//   a link or Markdown, never British spelling made American or slang tidied
//   up, and nothing at all when the model rewrote the sentence instead.

import type { Span } from './anchor.ts';
import { diffTokens, type Hunk, tokens } from './diff.ts';
import { ABBREVIATIONS, tidyText } from './tidy.ts';

/** One correction: replace [from, to) with `insert`. */
export type Fix = Hunk;

/** The longest sentence worth sending to be proofread. */
export const MAX_PROOFREAD = 600;

// Slips with only one reading, in English, and what was meant. Words that are
// also real words ("cant", "wont", "its", "ill") are left to the model.
const SLIPS: Record<string, string> = {
  i: 'I',
  "i'm": "I'm",
  "i've": "I've",
  "i'll": "I'll",
  "i'd": "I'd",
  im: "I'm",
  ive: "I've",
  dont: "don't",
  doesnt: "doesn't",
  didnt: "didn't",
  isnt: "isn't",
  wasnt: "wasn't",
  werent: "weren't",
  arent: "aren't",
  havent: "haven't",
  hasnt: "hasn't",
  hadnt: "hadn't",
  couldnt: "couldn't",
  wouldnt: "wouldn't",
  shouldnt: "shouldn't",
  mustnt: "mustn't",
  youre: "you're",
  youve: "you've",
  theyre: "they're",
  theyve: "they've",
  weve: "we've",
  thats: "that's",
  whats: "what's",
  theres: "there's",
  hes: "he's",
  shes: "she's",
  couldve: "could've",
  wouldve: "would've",
  shouldve: "should've",
  teh: 'the',
  hte: 'the',
  adn: 'and',
  taht: 'that',
  thsi: 'this',
  waht: 'what',
  wiht: 'with',
  jsut: 'just',
  abotu: 'about',
  whcih: 'which',
  wich: 'which',
  becuase: 'because',
  becasue: 'because',
  peopel: 'people',
  poeple: 'people',
  shoudl: 'should',
  woudl: 'would',
  coudl: 'could',
  thier: 'their',
  recieve: 'receive',
  recieved: 'received',
  beleive: 'believe',
  acheive: 'achieve',
  definately: 'definitely',
  seperate: 'separate',
  untill: 'until',
  occured: 'occurred',
  occurence: 'occurrence',
  accross: 'across',
  alot: 'a lot',
  noone: 'no one',
  tommorow: 'tomorrow',
  tomorow: 'tomorrow',
  tommorrow: 'tomorrow',
  wierd: 'weird',
  freind: 'friend',
  goverment: 'government',
  enviroment: 'environment',
  begining: 'beginning',
  neccessary: 'necessary',
  necesary: 'necessary',
  occassion: 'occasion',
  publically: 'publicly',
  truely: 'truly',
  adress: 'address',
  arguement: 'argument',
  basicly: 'basically',
  buisness: 'business',
  commited: 'committed',
  concious: 'conscious',
  embarass: 'embarrass',
  finaly: 'finally',
  foriegn: 'foreign',
  happend: 'happened',
  independant: 'independent',
  knowlege: 'knowledge',
  maintainance: 'maintenance',
  noticable: 'noticeable',
  persistant: 'persistent',
  prefered: 'preferred',
  realy: 'really',
  relevent: 'relevant',
  remeber: 'remember',
  succesful: 'successful',
  suprise: 'surprise',
  tendancy: 'tendency',
  threshhold: 'threshold',
  writting: 'writing',
  yeild: 'yield',
  calender: 'calendar',
  existance: 'existence',
  experiance: 'experience',
  grammer: 'grammar',
  posible: 'possible',
  probaly: 'probably',
  similiar: 'similar',
  strenght: 'strength',
};

// The commonest English words: enough of them and the text is English.
const ENGLISH = new Set(
  'the a an and or but of to in on at for with is are was were be been it its this that these those i you he she we they my your his her our their not no do does did have has had will would can could should there what which who as by from so if then than'.split(
    ' ',
  ),
);

/** Is `text` English, as far as its words tell? Too little to tell counts as English, Clearpen's default. */
export function looksEnglish(text: string): boolean {
  const words = (text.toLowerCase().match(/\p{L}+/gu) ?? []).slice(-60);
  if (words.length < 8) return true;
  return words.filter((w) => ENGLISH.has(w)).length / words.length >= 0.12;
}

const OPENERS = /[(“"‘'*_[]+$/u;
const CLOSERS = `["”’)\\]*_]*`;

/** Does a full stop here end a sentence, rather than "e.g." or "Dr."? */
function realStop(text: string, at: number, mark: string): boolean {
  if (mark.startsWith('..')) return false; // an ellipsis: the thought goes on
  if (mark !== '.') return true;
  const word = (text.slice(0, at).match(/(\S*)$/)?.[1] ?? '').replace(/^[(“"‘'*_[]+/u, '').toLowerCase();
  return !ABBREVIATIONS.has(word) && !/^\p{L}$/u.test(word);
}

/** Does a new sentence start after `pre` (the line up to a word)? List items may be fragments: no. */
function startsSentence(pre: string): boolean {
  const p = pre.replace(OPENERS, '');
  if (/^\s*(?:#{1,6}\s+|>\s*)*$/.test(p)) return true;
  const m = p.match(new RegExp(`([.!?]+)${CLOSERS}\\s+$`, 'u'));
  if (!m) return false;
  // "1. " starts a list item, not a sentence.
  if (/^\s*\d+[.)]\s+$/.test(p)) return false;
  return realStop(p, m.index!, m[1]!);
}

const upperFirst = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);

/**
 * The fix for the word the writer has just finished, or null. `before` is the
 * line up to the cursor, ending with the space or mark that ended the word;
 * the fix's offsets are into it. `curly` writes apostrophes as ’.
 */
export function quickFix(before: string, { english = true, curly = false } = {}): Fix | null {
  const m = before.match(/(^|[\s(“"‘*_[])(\p{L}[\p{L}’']*)([.,;:!?)\]”"’*_]*)(\s|[.,;!?])$/u);
  if (!m) return null;
  const word = m[2]!.replace(/['’]+$/, '');
  const from = m.index! + m[1]!.length;
  // Shouting, or a word that's capitalised inside ("iPhone"), is meant.
  if (word.length > 1 && word === word.toUpperCase()) return null;
  let fixed = word;
  const slip = english ? SLIPS[word.toLowerCase().replace(/’/g, "'")] : undefined;
  if (slip) {
    fixed = /^\p{Lu}/u.test(word) ? upperFirst(slip) : slip;
    if (curly) fixed = fixed.replace(/'/g, '’');
    else if (word.includes('’')) fixed = fixed.replace(/'/g, '’');
  }
  if (/^\p{Ll}[\p{Ll}’']*(?: [\p{Ll}]+)?$/u.test(fixed) && startsSentence(before.slice(0, from))) {
    fixed = upperFirst(fixed);
  }
  return fixed === word ? null : { from, to: from + word.length, insert: fixed };
}

/**
 * The sentence the writer has just finished — a full stop, question or
 * exclamation mark and then a space, or Enter at the end of a line — as a span
 * of `before` (the text up to the cursor). Null when nothing has just ended.
 */
export function finishedSentence(before: string): Span | null {
  let to: number;
  // Enter, and the list marker or quote it carried on to the new line.
  const enter = before.match(/\n[ \t]*(?:[-*+] (?:\[[ xX]\] )?|\d+[.)] |> ?)?$/);
  if (enter) {
    // The line just left, punctuated or not (a heading, a list item).
    const body = before.slice(0, enter.index).replace(/[ \t]+$/, '');
    if (!body || body.endsWith('\n')) return null;
    to = body.length;
  } else {
    const m = before.match(new RegExp(`([.!?]+)${CLOSERS}[ \\t]$`, 'u'));
    if (!m || !realStop(before, m.index!, m[1]!)) return null;
    to = before.length - 1;
  }
  const lineStart = before.lastIndexOf('\n', to - 1) + 1;
  const line = before.slice(lineStart, to);
  // Code, tables and HTML aren't prose.
  if (/^(?: {4}|\t|\s*(?:```|~~~|\||<))/.test(line)) return null;
  const marker = line.match(/^\s*(?:#{1,6}\s+|>\s*|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)*/)![0].length;
  // Back to the end of the sentence before, if there is one on this line.
  const lineFrom = lineStart + marker;
  let from = lineFrom;
  for (const e of before.slice(lineFrom, to).matchAll(new RegExp(`([.!?]+)${CLOSERS}\\s+`, 'gu'))) {
    if (realStop(before, lineFrom + e.index, e[1]!)) from = lineFrom + e.index + e[0].length;
  }
  const text = before.slice(from, to);
  if (text.length > MAX_PROOFREAD || (text.match(/\p{L}+/gu) ?? []).length < 2) return null;
  return { from, to };
}

// —— What the model may change ——

// Informal words are a choice, not a slip.
const INFORMAL = new Set(
  "kinda gonna wanna gotta sorta dunno lemme gimme ain't y'all ya yeah yep nope nah ok okay cuz tho thru lol omg meh gotcha outta lotta".split(
    ' ',
  ),
);

// Words mixed up for each other — a fix between two of them is a fix, however far apart they're spelled.
const CONFUSED = [
  'then than',
  "their there they're",
  "your you're",
  "its it's",
  'to too two',
  'of have',
  "were where we're was",
  'is are',
  'has have',
  'do does',
  "don't doesn't",
  'a an',
  'affect effect',
  'lose loose',
  "whose who's",
  'weather whether',
  'accept except',
  'quite quiet',
  'advice advise',
  'principal principle',
  'lead led',
  'past passed',
  'breath breathe',
  'know no',
  'new knew',
  'right write',
  'hear here',
  'our are',
  'buy by',
].map((g) => new Set(g.split(' ')));

// Little words a sentence can be missing ("I going" → "I am going").
const LITTLE = new Set('a an the to of is are am was were be in on at it for and that'.split(' '));

/** British and American spellings, made the same. */
const spelling = (w: string) =>
  w
    .replace(/isation/g, 'ization')
    .replace(/is(e|ed|es|ing)$/, 'iz$1')
    .replace(/ys(e|ed|es|ing)$/, 'yz$1')
    .replace(/our(s|ed|ing|ite|ites|able)?$/, 'or$1')
    .replace(/tre(s)?$/, 'ter$1')
    .replace(/ll(ed|ing|er|ers)$/, 'l$1')
    .replace(/ogue(s)?$/, 'og$1')
    .replace(/ence$/, 'ense')
    .replace(/^grey/, 'gray')
    .replace(/programme/, 'program')
    .replace(/ae/g, 'e');

/** Edits between two words, a swapped pair counting as one. */
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** One word for another that is plainly what was meant. */
function meant(a: string, b: string): boolean {
  if (a === b) return true;
  if (CONFUSED.some((g) => g.has(a) && g.has(b))) return true;
  // Agreement: "go" → "goes", "need" → "needed".
  if (b.startsWith(a) && /^(?:s|es|d|ed|ing)$/.test(b.slice(a.length))) return true;
  const longest = Math.max(a.length, b.length);
  return distance(a, b) <= (longest <= 4 ? 1 : longest <= 8 ? 2 : 3);
}

const isWord = (t: string) => /\p{L}/u.test(t);
const digits = (s: string) => s.replace(/\D/g, '');
const markup = (s: string) => s.replace(/[^*_`#<>[\]()|~\\/@=:]/g, '');
const plain = (w: string) => w.toLowerCase().replace(/’/g, "'");

// Links, code, HTML, addresses: the writer's, letter for letter.
const PROTECTED = /`[^`]*`|!?\[[^\]]*\]\([^)]*\)|<[^>]+>|https?:\/\/\S+|www\.\S+|\S+@\S+\.\S+/g;

/** Is changing `was` to `now` (tokens) proofreading, not editing? */
function safe(
  was: string[],
  now: string[],
  ctx: { first: boolean; prev: string; next: string; before: string; after: string },
): boolean {
  const a = was.join('');
  const b = now.join('');
  if (digits(a) !== digits(b) || markup(a) !== markup(b)) return false;
  const wa = was.filter(isWord);
  const wb = now.filter(isWord);
  // Punctuation or spacing alone: only a doubled mark, or a space before one, taken out.
  if (!wa.length && !wb.length) {
    if (b) return false;
    return /^\s+$/.test(a) ? /^[,.;:!?]/.test(ctx.after) : was.length === 1 && (ctx.before === a || ctx.after === a);
  }
  if (wa.length > 3 || wb.length > 3) return false;
  // A capitalised word inside the sentence is a name — the writer's, case and all.
  if (wa.some((w, i) => /\p{Lu}/u.test(w) && !(ctx.first && i === 0) && !/^I(?:['’]\p{L}+)?$/u.test(w))) return false;
  const la = wa.map(plain);
  const lb = wb.map(plain);
  if (la.some((w) => INFORMAL.has(w))) return false;
  if (la.length === 1 && lb.length === 1 && la[0] !== lb[0] && spelling(la[0]!) === spelling(lb[0]!)) return false;
  // A word split or joined: "alot" → "a lot".
  if (la.join('') === lb.join('')) return true;
  // A missing little word put in, or a doubled word taken out.
  if (!la.length) return lb.length === 1 && LITTLE.has(lb[0]!);
  if (!lb.length) return la.length === 1 && (plain(ctx.prev) === la[0] || plain(ctx.next) === la[0]);
  return la.length === lb.length && la.every((w, i) => meant(w, lb[i]!));
}

/**
 * The fixes that turn the writer's `sentence` into the model's proofread
 * version, keeping only the small, safe ones; offsets are into `sentence`.
 * `curly` writes apostrophes as ’, the way the writer does.
 */
export function correctionFixes(
  sentence: string,
  proofread: string,
  { curly = sentence.includes('’') }: { curly?: boolean } = {},
): Fix[] {
  let out = tidyText(proofread).replace(/^["“](.*)["”]$/s, (all, inner: string) =>
    /^\s*["“]/.test(sentence) ? all : inner,
  );
  if (!out) return [];
  out = curly ? out.replace(/(\p{L})'(?=\p{L})/gu, '$1’') : out.replace(/(\p{L})’(?=\p{L})/gu, "$1'");
  const core = sentence.trim();
  // A heading or a list item keeps its lack of a full stop.
  if (!/[.!?…]["”’)*_]*$/.test(core)) out = out.replace(/[.!?]$/, '');
  if (out === core || out.length > core.length * 1.4 + 12 || out.length < core.length * 0.6 - 4) return [];
  const lead = sentence.length - sentence.trimStart().length;
  const a = tokens(core);
  const b = tokens(out);
  const runs = diffTokens(a, b, 80);
  if (!runs) return [];
  const offsets = [0];
  for (const t of a) offsets.push(offsets[offsets.length - 1]! + t.length);
  const shielded = [...core.matchAll(PROTECTED)].map((m) => [m.index, m.index + m[0].length] as const);
  const firstWord = a.findIndex(isWord);
  const words = a.filter(isWord).length;
  const word = (from: number, step: number) => {
    for (let i = from; i >= 0 && i < a.length; i += step) if (isWord(a[i]!)) return a[i]!;
    return '';
  };

  const fixes: Fix[] = [];
  let changed = 0;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i]!.op === '=') continue;
    // A change is one run of removals and insertions, and those only a space away:
    // "kinda" → "kind of" is one change, not "kind" and then "of".
    const first = runs[i]!;
    let last = first;
    for (;;) {
      const next = runs[i + 1];
      const gap = next?.op === '=' && a.slice(next.a[0], next.a[1]).every((t) => /^\s+$/.test(t));
      if (next && next.op !== '=') last = runs[++i]!;
      else if (gap && runs[i + 2]) {
        i += 2;
        last = runs[i]!;
      } else break;
    }
    const [a0, a1] = [first.a[0], last.a[1]];
    const [b0, b1] = [first.b[0], last.b[1]];
    const was = a.slice(a0, a1);
    const now = b.slice(b0, b1);
    changed += Math.max(was.filter(isWord).length, now.filter(isWord).length);
    const from = offsets[a0]!;
    const to = offsets[a1]!;
    if (shielded.some(([s0, s1]) => (from === to ? s0 < from && from < s1 : from < s1 && s0 < to))) continue;
    const ctx = {
      first: a0 <= firstWord,
      prev: word(a0 - 1, -1),
      next: word(a1, 1),
      before: a[a0 - 1] ?? '',
      after: a[a1] ?? '',
    };
    if (!safe(was, now, ctx)) continue;
    fixes.push({ from: lead + from, to: lead + to, insert: now.join('') });
  }
  // Many changes means the model rewrote the sentence rather than proofread it.
  return changed > Math.max(3, Math.ceil(words * 0.4)) ? [] : fixes;
}
