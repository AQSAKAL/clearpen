// The next logical sentence — the one place Clearpen writes, and only one
// sentence at a time. The rules that keep it from becoming a rabbit hole:
//
// - Ask only after a finished sentence at the end of a line of prose, after a
//   pause; never mid-sentence or word by word. Asked for with ⌘J, a lead-in
//   that ends in a colon ("Three reasons:") will do too — and a lead-in that
//   introduces a command ("run this command:") gets the command, as inline
//   code, since no sentence can supply what that colon promises.
// - A paragraph that so far only asks ("What can we see here?") is a lead-in
//   too: it gets its answer, read from the text before it.
// - First a verdict: has the paragraph made its point? A judge model only
//   names the sentences that state it, support it and draw its meaning;
//   code decides, and a part counts only if that sentence is really there.
// - A paragraph of six sentences has made its point without asking.
// - A suggestion that restates the last few sentences, opens like the
//   previous two, or copies a key or password out of the text, is dropped.
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
// read: "use this CLI command:", "run the following:", "in the terminal:". A
// query on its own is a search ("a query, for example to research earnings:"):
// only a database's is code.
const CODE_LEAD_IN =
  /\b(?:commands?|cli|shell|terminal|console|code|snippets?|scripts?|one-liners?|syntax|sql|graphql|regexp?|(?:database|db)\s+quer(?:y|ies))\b|\b(?:run|type|execute|enter|paste)\s+(?:this|these|the following)\b/i;

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

// A lead-in that introduces an example ("for example:", "Here are synthetic
// examples:") wants the example itself. Asked for "what the colon
// introduces" under the rule against inventing figures, a model can only
// describe one ("It constructs a plausible earnings report…").
const EXAMPLE_LEAD_IN =
  /\b(?:examples?|for instance|e\.g\.|such as|samples?|illustrations?|instances?)\b|\blike\s*:\s*$/i;
// The author wants it made up for the purpose — and says so, near the lead-in.
const MADE_UP =
  /\b(?:synthetic|hypothetical|fictional|fictitious|made[- ]up|imaginary|invented|mock|dummy|fake|fabricated|plausible|illustrative|imagine|suppose)\b/i;
// …and wants several: "examples:", "a variety of them like:", "a few:", "example queries:".
const MANY =
  /\b(?:examples|samples|instances|illustrations|variety|varieties|several|a few|some|many|lots?|list|kinds|types|variants|others|them|queries|questions|prompts|searches|documents|reports|responses|answers|statements|outputs)\b/i;
// What kind of thing it asks for, when it says: a query to type, or a document that was written.
const QUERY_KIND = /\b(?:quer(?:y|ies)|questions?|prompts?|searches|search terms?|keywords?)\b/i;
const DOCUMENT_KIND = /\b(?:documents?|reports?|responses?|answers?|statements?|passages?|outputs?|articles?)\b/i;

export interface ExampleLeadIn {
  /** The author asks for an example made up for the purpose, in the lead-in's paragraph or the two before it. */
  madeUp: boolean;
  /** The lead-in promises several, not one. */
  many: boolean;
  /** The kind it names — "example queries:", "…for generated responses:" — or '' when it names none. */
  kind: 'query' | 'document' | '';
  /** The examples the article already quotes near the lead-in ("financial results on earnings"): the subject to keep to. */
  anchors: string[];
}

/** Ends with a lead-in that introduces an example, or several; null for any other. */
export function endsExampleLeadIn(before: string): ExampleLeadIn | null {
  if (!endsLeadIn(before) || endsCodeLeadIn(before)) return null;
  const line = before.slice(before.lastIndexOf('\n') + 1);
  const start = line.search(/[^.!?…]*:\s*$/);
  const clause = start === -1 ? line : line.slice(start);
  if (!EXAMPLE_LEAD_IN.test(clause)) return null;
  const near = before
    .split(/\n\s*\n/)
    .slice(-4)
    .join('\n');
  const anchors = [...new Set([...near.matchAll(/["“]([^"”\n]{3,120})["”]/g)].map((m) => m[1]!.trim()))]
    .filter((q) => q.split(/\s+/).length <= 16)
    .slice(-3);
  // A query is what someone types; what HyDE "generates" from it is a document.
  // Unnamed, the kind is the article's own example's: a few words in quotes
  // ("financial results on earnings") are a query.
  const queryLike = anchors.length > 0 && anchors.every((a) => a.split(/\s+/).length <= 8 && !/[.!]$/.test(a));
  const kind = QUERY_KIND.test(clause) ? 'query' : DOCUMENT_KIND.test(clause) ? 'document' : queryLike ? 'query' : '';
  return { madeUp: MADE_UP.test(near), many: MANY.test(clause), kind, anchors };
}

/**
 * Whether an example talks about one instead of being one: "HyDE transforms
 * … into a report", "The model generates…", "It constructs…", "Generated
 * text depicting…". The writer asked for the query or the document itself —
 * and quotes around a description don't make it one.
 */
export function describesExample(text: string): boolean {
  const s = String(text)
    .trim()
    .replace(/^(?:[-*+•]|\d+[.)])\s+/, '')
    .replace(/^["“'‘]+/, '');
  const maker =
    /^(?:hyde|the (?:model|tool|system|llm|generator|method|approach|pipeline)|an? (?:model|llm|synthetic|hypothetical|fabricated|fake|generated)\b|(?:the )?generated\b|it|this|that|they|here)\b/i;
  const making =
    /\b(?:generat|construct|transform|convert|creat|fabricat|produc|simulat|hallucinat|synthesiz|rewrit|turn|draft|depict|invent)\w*/i;
  return maker.test(s) && making.test(s.split(/\s+/).slice(0, 10).join(' '));
}

/**
 * Whether an example asked for as a query isn't one: a sentence, not what
 * someone types into a search box ("Jane Doe seeks quarterly revenue for
 * Northwind Corp via HyDE").
 */
export function notAQuery(text: string): boolean {
  const q = String(text)
    .trim()
    .replace(/^(?:[-*+•]|\d+[.)])\s+/, '')
    .replace(/^["“'‘`]+|["”'’`.]+$/g, '');
  if (q.split(/\s+/).length > 14) return true;
  return /\b(?:hyde|the model|the tool|synthetic document|hypothetical document|via|seeks|searches for|is searching|looks up)\b/i.test(
    q,
  );
}

/**
 * Whether a suggestion says again what a sentence of the article already
 * says — the example given two paragraphs up, word for word or nearly. The
 * model is shown that text; told to write something new, a small model still
 * copies the nearest instance, so code checks. The same figures ($42.5M,
 * 18%) with a few of the same words are the same example, however reworded.
 */
export function echoes(before: string, text: string): boolean {
  const ideas = (x: string) => contentWords(x).filter((w) => !FILLER.has(w));
  const figures = (x: string) => new Set((x.match(/\d+(?:[.,]\d+)*/g) || []).filter((f) => f.length >= 2));
  const words = new Set(ideas(text));
  const mine = figures(text);
  if (words.size < 4 && mine.size < 2) return false;
  return before
    .slice(-4000)
    .split(/(?<=[.!?…]["”’)]*)\s+|\n+/)
    .some((s) => {
      const theirs = [...new Set(ideas(s))];
      if (theirs.length < 4) return false;
      const shared = theirs.filter((w) => words.has(w)).length;
      const sameFigures = [...figures(s)].filter((f) => mine.has(f)).length;
      // Short as a query may be, the same two figures and two of the same words are the same example.
      if (sameFigures >= 2 && shared >= 2) return true;
      return words.size >= 4 && shared / Math.min(words.size, theirs.length) >= 0.7;
    });
}

/** What an example lead-in is missing, in words for the writing prompt. */
export const EXAMPLE_LEAD_IN_MISSING = 'the example its colon introduces';
/** …when it promises several. */
export const EXAMPLES_LEAD_IN_MISSING = 'the examples its colon introduces';

// The names a model reaches for when it makes up a company's figures. Told
// not to, a small model still does now and then — and named in the prompt,
// more often — so code holds the line: made-up figures under a real name read
// as a claim about that company.
const WELL_KNOWN =
  /\b(?:Apple|Microsoft|Azure|Alphabet|Google|Amazon|AWS|Meta Platforms|Facebook|Tesla|Nvidia|NVIDIA|Netflix|IBM|Intel|AMD|Oracle|SAP|Cisco|Samsung|Sony|Toyota|Walmart|JPMorgan|Goldman Sachs|Morgan Stanley|Berkshire Hathaway|BlackRock|HSBC|Coca-Cola|PepsiCo|Pfizer|ExxonMobil|Exxon|Shell|Visa|Mastercard|PayPal|Adobe|Salesforce|Uber|Airbnb|Boeing|Disney|Nike|McDonald['’]s|Starbucks|OpenAI|Anthropic|Alibaba|Tencent)\b/g;

/** Whether a made-up example puts its figures under a well-known real company the author hasn't named. */
export function madeUpAboutReal(before: string, suggestion: string): boolean {
  return (String(suggestion).match(WELL_KNOWN) || []).some((name) => !before.includes(name));
}

/**
 * The paragraph so far only asks — "What can we see here?" — after prose of
 * the author's. It promises an answer from what came before, and has no point
 * of its own yet for the judge to find: asked for one, a model restates the
 * article's thesis. Headings and lines of dialogue are not lead-ins.
 */
export function endsQuestionLeadIn(before: string): boolean {
  const { paragraph, earlier } = splitParagraph(before);
  if (/^\s*#{1,6}\s/.test(paragraph) || /^["“]/.test(paragraph)) return false;
  if (!earlier.replace(/^\s*#{1,6}\s.*$/gm, '').trim()) return false;
  const sentences = paragraphSentences(before);
  return sentences.length > 0 && sentences.every((s) => /\?["”’)]*$/.test(s));
}

/** What a question lead-in is missing, in words for the writing prompt. */
export const QUESTION_LEAD_IN_MISSING = 'the answer to its question, read from the text before it';

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

/**
 * The article's first paragraph of prose, where it usually says what it is
 * about and what it argues — the context a suggestion deep in the article
 * would otherwise have scrolled past. Headings, code and tables are skipped.
 */
export function articleOpening(text: string): string {
  const first = String(text)
    .split(/\n\s*\n/)
    .map((b) => b.replace(/^\s*#{1,6}\s.*$/gm, '').trim())
    .find((b) => b && !/^(?:```|~~~|\||!\[)/.test(b));
  return first ? first.slice(0, 600) : '';
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

// A key, password or ID: twelve or more letters and digits, mixed.
const RUN = /[A-Za-z0-9]{12,}/g;
const isSecret = (run: string) => /\d/.test(run) && /[A-Za-z]/.test(run);

/** What stands in for a secret in a prompt. */
export const SECRET_MASK = '<redacted>';
/** What stands in for a whole connection string, password and all, in a source a prompt shows. */
export const CREDENTIAL_MASK = '<a connection string with its password>';

/** The text with its keys, passwords and IDs masked: a model can read around them, never copy one. */
export const maskSecrets = (text: string) => text.replace(RUN, (r) => (isSecret(r) ? SECRET_MASK : r));

/**
 * Whether a suggestion copies a key, password or ID out of the text, or the
 * mask that stood in for one. A reader doesn't need it twice, and a
 * suggestion is no place for a secret to spread to.
 */
export function copiesSecret(before: string, suggestion: string): boolean {
  const s = String(suggestion);
  if (s.includes(SECRET_MASK) || s.includes(CREDENTIAL_MASK)) return true;
  return (s.match(RUN) || []).some((r) => isSecret(r) && before.includes(r));
}

/**
 * Whether a suggested next sentence earns its place: not empty or bare
 * punctuation, not a restatement of the last few sentences, not the same
 * opening word yet again, not a copy of a secret.
 */
export function nextSentenceOk(before: string, suggestion: string): boolean {
  const s = String(suggestion).trim();
  if (!/[\p{L}\p{N}]/u.test(s) || /^\(?(?:nothing|none|n\/a|empty)\)?\.?$/i.test(s)) return false;
  if (copiesSecret(before, s)) return false;
  const recent = paragraphSentences(before).slice(-3);
  const first = firstWord(s);
  if (first && recent.length >= 2 && recent.slice(-2).every((x) => firstWord(x) === first)) return false;
  const ideas = (x: string) => contentWords(x).filter((w) => !FILLER.has(w));
  const known = new Set(ideas(recent.join(' ')));
  const words = ideas(s);
  return !words.length || words.filter((w) => !known.has(w)).length / words.length >= 0.35;
}
