// The next logical sentence — the one place Clearpen writes, and only one
// sentence at a time. The rules that keep it from becoming a rabbit hole:
//
// - Ask only after a finished sentence at the end of a line of prose, after a
//   pause; never mid-sentence or word by word. Asked for with ⌘J, a lead-in
//   that ends in a colon ("Three reasons:") will do too — and a lead-in that
//   introduces a command ("run this command:") gets the command, as inline
//   code, since no sentence can supply what that colon promises.
// - First a verdict: has the paragraph made its point? A judge model only
//   names the sentences that state it, support it and draw its meaning;
//   code decides, and a part counts only if that sentence is really there.
// - A paragraph of six sentences has made its point without asking.
// - A suggestion that restates the last few sentences, or opens like the
//   previous two, is dropped.
// - After a suggestion is taken, wait for words of the writer's own, so Tab
//   can never write a paragraph.

import { findQuote } from './anchor.ts';

/** How long the writer pauses before a suggestion is worth asking for. */
export const NEXT_SENTENCE_PAUSE_MS = 650;
/** Characters the writer must type themselves after taking a suggestion, before the next. */
export const OWN_WORDS_BETWEEN = 25;
/** Paragraphs this long have made their point; nobody needs to ask the model. */
export const MAX_PARAGRAPH_SENTENCES = 6;

/** Is the cursor at `pos` in `text` a good spot to suggest the next sentence? */
export function nextSentenceSpot(text: string, pos: number): boolean {
  const from = text.lastIndexOf('\n', pos - 1) + 1;
  const end = text.indexOf('\n', pos);
  const lineEnd = end === -1 ? text.length : end;
  if (pos !== lineEnd) return false; // editing inside a line, not writing on
  const line = text.slice(from, lineEnd);
  const before = line.slice(0, pos - from);
  if (before.replace(/^\s*(?:#{1,6}|[-*+]|\d+[.)]|>)\s*/, '').trim().length < 12) return false;
  if (/^\s*#{1,6}\s/.test(line)) return false; // headings are the writer's
  // A paragraph this long has made its point; leave it to the writer.
  if ((before.match(/[.!?…]["”’)]*(?=\s|$)/g) || []).length >= MAX_PARAGRAPH_SENTENCES) return false;
  if (!/[.!?…]["”’)]*\s?$/.test(before)) return false; // not a word: whole sentences only
  if (/^\s*(?:```|~~~|\|)/.test(line)) return false;
  // Inside a fenced code block?
  const fences = (text.slice(0, from).match(/^\s*(?:```|~~~)/gm) || []).length;
  return fences % 2 === 0;
}

/** Ends with a finished sentence. */
export const endsSentence = (before: string) => /[.!?…]["”’)]*\s*$/.test(before);

/** Ends with a lead-in — "Three reasons:" — that promises what comes next. Headings are the writer's. */
export function endsLeadIn(before: string): boolean {
  const line = before.slice(before.lastIndexOf('\n') + 1);
  return /\p{L}["”’)]*:\s*$/u.test(line) && !/^\s*#{1,6}\s/.test(line);
}

/** What a lead-in is missing, in words for the writing prompt. */
export const LEAD_IN_MISSING = 'what the colon at its end introduces (the first one, if it promises several)';

// Words that say the colon introduces something to type, not something to
// read: "use this CLI command:", "run the following:", "in the terminal:".
const CODE_LEAD_IN =
  /\b(?:commands?|cli|shell|terminal|console|code|snippets?|scripts?|one-liners?|syntax|quer(?:y|ies))\b|\b(?:run|type|execute|enter|paste)\s+(?:this|these|the following)\b/i;

/**
 * Ends with a lead-in that introduces a command or a line of code. Only the
 * clause the colon ends is read: an earlier sentence on the line may mention
 * code for its own reasons.
 */
export function endsCodeLeadIn(before: string): boolean {
  if (!endsLeadIn(before)) return false;
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const start = line.search(/[^.!?…]*:\s*$/);
  return CODE_LEAD_IN.test(start === -1 ? line : line.slice(start));
}

/** What a command lead-in is missing, in words for the writing prompt. */
export const CODE_LEAD_IN_MISSING = 'the command its last line introduces';

/**
 * Whether a suggested command is one: not empty, not a refusal, and not a
 * sentence of prose that a model wrote instead of the command.
 */
export function commandOk(suggestion: string): boolean {
  const s = String(suggestion).trim();
  if (!s || /^\(?(?:nothing|none|n\/a|empty)\)?\.?$/i.test(s)) return false;
  // Plain words ending like a sentence are prose, not a command.
  if (/^[\p{L}\s,;'’]+[.!?]$/u.test(s)) return false;
  // So is a capitalised sentence of a few words, however it is punctuated inside.
  if (/^\p{Lu}/u.test(s) && /[.!?]$/.test(s) && s.split(/\s+/).length >= 3) return false;
  // An apology or an explanation is not a command either.
  return !/^(?:i(?:'m| am|'d| would)? |sorry|unfortunately|there is no|here(?:'s| is))/i.test(s);
}

/** The first word of a sentence, lower-cased, past any opening quote or emphasis. */
export const firstWord = (s: string) =>
  (
    String(s)
      .trim()
      .replace(/^[*_"“'‘(]+/, '')
      .match(/^[\p{L}’']+/u)?.[0] || ''
  ).toLowerCase();

/** Content words, roughly stemmed: what a sentence is about. */
export const contentWords = (s: string): string[] =>
  (
    String(s)
      .toLowerCase()
      .match(/[\p{L}\p{N}']{4,}/gu) || []
  ).map((w) => w.replace(/(?:ing|ed|es|s)$/, ''));

// Glue, not ideas: "really", "rather", "about" don't make a sentence new.
const FILLER = new Set(
  contentWords(
    'about rather than that this these those with from have been were they their them what when which would could should only even much many such some each over then there your will while because really just also more very into being does doing make made also still',
  ),
);

/** The paragraph being written, and the article before it. */
export function splitParagraph(before: string): { paragraph: string; earlier: string } {
  const cut = before.lastIndexOf('\n\n');
  return { paragraph: before.slice(cut + 1).trim(), earlier: cut === -1 ? '' : before.slice(0, cut) };
}

/** The paragraph being written, as sentences. */
export function paragraphSentences(before: string): string[] {
  const para = before.slice(before.lastIndexOf('\n\n') + 1);
  return (para.match(/[^.!?…]+[.!?…]+["”’)]*/g) || []).map((x) => x.trim()).filter(Boolean);
}

export const paragraphLength = (before: string) => paragraphSentences(before).length;

/**
 * Which of the author's notes the text before the cursor already covers, and
 * the first one it doesn't — the point the next sentence should lead toward.
 */
export function notesProgress(notes: string[], before: string): { covered: boolean[]; next: string } {
  const written = new Set(contentWords(before.slice(-3000)));
  const covered = notes.map((n) => {
    const words = contentWords(n);
    return words.length > 0 && words.filter((w) => written.has(w)).length / words.length >= 0.5;
  });
  return { covered, next: notes.find((_, i) => !covered[i]) || '' };
}

export interface ParagraphVerdict {
  complete: boolean;
  /** The first part the paragraph is missing, in words for the writing prompt; '' when complete. */
  missing: string;
  parts: { point: boolean; support: boolean; meaning: boolean };
}

/**
 * Has the paragraph made its point? Decided in code from the judge's answer:
 * a part counts as done only when the sentence the judge names — by number,
 * or by quoting it — is really in the paragraph.
 */
export function paragraphVerdict(before: string, judged: unknown): ParagraphVerdict {
  const { paragraph } = splitParagraph(before);
  const count = paragraphSentences(before).length;
  const answer = (key: string) =>
    judged && typeof judged === 'object' ? (judged as Record<string, unknown>)[key] : undefined;
  const has = (key: string) => {
    const a = answer(key);
    const n = typeof a === 'number' ? a : typeof a === 'string' && /^\s*\d+\s*$/.test(a) ? Number(a) : null;
    if (n !== null) return Number.isInteger(n) && n >= 1 && n <= count;
    return typeof a === 'string' && a.trim().length > 3 && !!findQuote(paragraph, a);
  };
  const parts = { point: has('point'), support: has('support'), meaning: has('meaning') };
  const missing = !parts.point
    ? 'its point, stated plainly'
    : !parts.support
      ? 'support for its point — a reason, evidence, an example or an experience'
      : !parts.meaning
        ? 'what it means — why it matters or what follows'
        : '';
  return { complete: !missing, missing, parts };
}

/**
 * Whether a suggested next sentence earns its place: not empty, not a
 * restatement of the last few sentences, not the same opening word yet again.
 */
export function nextSentenceOk(before: string, suggestion: string): boolean {
  const s = String(suggestion).trim();
  if (!s || /^\(?(?:nothing|none|n\/a|empty)\)?\.?$/i.test(s)) return false;
  const recent = paragraphSentences(before).slice(-3);
  const first = firstWord(s);
  if (first && recent.length >= 2 && recent.slice(-2).every((x) => firstWord(x) === first)) return false;
  const ideas = (x: string) => contentWords(x).filter((w) => !FILLER.has(w));
  const known = new Set(ideas(recent.join(' ')));
  const words = ideas(s);
  return !words.length || words.filter((w) => !known.has(w)).length / words.length >= 0.35;
}
