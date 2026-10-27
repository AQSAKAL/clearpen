// How the prose reads — checks drawn from the literature on clear writing,
// run by code with no model involved:
//
// - Gopen & Swan, "The Science of Scientific Writing" (1990): readers take
//   meaning from where things sit. The subject wants its verb soon; the end
//   of a sentence gets the stress; a sentence should open on what the reader
//   already knows and close on what is new; the action belongs in the verb;
//   a paragraph tells one story about whoever keeps showing up first.
// - Fenton, "Improving your technical writing skills" (2003): plain words
//   over pompous ones, verbs over nouns made from verbs, lists shown as
//   lists, initials spelled out once, an opening that says what was found.
// - Graham, "How to Write Usefully" and "Write Simply"; Chapin's reply:
//   claims as strong as truth allows (a sentence that says nothing is as bad
//   as one that says too much); hedges that carry information stay; one
//   intensifier or one vivid phrase is voice, a run of them is habit.
//
// None of these are rules. A finding here is a reader's likely reaction,
// phrased so the author can disagree; each is dismissed with a click. The
// structural notes (whose story, old before new, no link back) are capped at
// one per paragraph — "attending to any one structural problem eventually
// leads us to all the others".

import { type Block, blocks, type Sentence, sentences } from './analysis.ts';
import type { Finding, Genre } from './checks.ts';

// ─────────────────────────────────────────────────────────── words

const WORD = /[\p{L}\p{N}’']+/gu;

interface Token {
  word: string;
  lower: string;
  from: number;
  to: number;
}

function tokens(masked: string): Token[] {
  const out: Token[] = [];
  for (const m of masked.matchAll(WORD)) {
    const word = m[0].replace(/^[’']+|[’']+$/g, '');
    if (!word) continue;
    const from = m.index + m[0].indexOf(word);
    out.push({ word, lower: word.toLowerCase(), from, to: from + word.length });
  }
  return out;
}

// Function words: they carry no topic of their own, so they never count as
// "old information" shared between two sentences.
const STOP = new Set(
  `a an the and or but nor so yet for of to in on at by with from as into onto about over under between among through during before after above below up down out off again further once than then there here now
   is am are was were be been being has have had having do does did doing will would shall should can could may might must ought
   i me my mine we us our ours you your yours he him his she her hers it its they them their theirs this that these those who whom whose which what where when why how
   not no nor none nothing never only just also even still very too quite rather more most much many some any such own same other another each both few all several every either neither
   if unless until while although though because since whether as like per via within without along across behind beyond upon toward towards despite except
   one ones thing things way ways kind kinds sort part lot lots bit well yes get got gets make makes made take takes took
   first second third next last new old`
    .split(/\s+/)
    .filter(Boolean),
);

// Words that stand for something already named: as good as repeating it.
// (Relative "which" and "who" point within their own sentence, so they're not here.)
const ANAPHOR = new Set(
  'this that these those it its they them their he him his she her such here there former latter both each same one ones'.split(
    ' ',
  ),
);

const FINITE = new Set(
  'am is are was were be been being has have had do does did can could will would shall should may might must ought'.split(
    ' ',
  ),
);
// "it's", "they're", "we've": a verb inside a contraction. A possessive "'s"
// ("today's", "the team's") is not, so "'s" counts only on a pronoun.
const CONTRACTED = /^(?:it|he|she|that|there|what|who|here|where|how|let)(?:’|')s$|^[\p{L}]+(?:’|')(?:re|ve|ll|d|m)$/iu;
const finiteVerb = (t: Token) => FINITE.has(t.lower) || CONTRACTED.test(t.word);

/** A rough stem: enough to see that "decisions" and "decision" are one idea. */
export function stem(word: string): string {
  let w = word.toLowerCase().replace(/(?:’|')s$/, '');
  if (w.length > 4 && w.endsWith('ies')) w = `${w.slice(0, -3)}y`;
  else if (w.length > 4 && /(?:s|x|z|ch|sh)es$/.test(w)) w = w.slice(0, -2);
  else if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) w = w.slice(0, -1);
  if (w.length > 5 && w.endsWith('ing')) w = w.slice(0, -3);
  else if (w.length > 4 && w.endsWith('ed')) w = w.slice(0, -2);
  return w;
}

/** What a stretch of text is about: the stems of its content words. */
export const contentStems = (list: Token[]): Set<string> =>
  new Set(list.filter((t) => t.lower.length > 2 && !STOP.has(t.lower)).map((t) => stem(t.lower)));

// "However," "For example," "In addition," — a connective before the topic is
// not the topic.
const CONNECTIVE =
  /^\s*(?:however|therefore|thus|hence|moreover|furthermore|meanwhile|instead|indeed|still|yet|so|but|and|also|then|finally|first(?:ly)?|second(?:ly)?|third(?:ly)?|next|lastly|consequently|nevertheless|nonetheless|otherwise|similarly|likewise|today|now|here|unfortunately|fortunately|interestingly|importantly|crucially|notably|clearly|obviously|arguably|admittedly|ultimately|overall|historically|typically|usually|often|sometimes|recently|lately|earlier|later|again|in (?:addition|contrast|short|other words|fact|particular|practice|theory|general|turn|sum|summary|response|the end|the meantime)|for (?:example|instance|one thing)|of course|as a result|on the other hand|at the same time|by contrast|even so|that said|to be (?:sure|fair|clear)|more importantly|above all|after all|in any case|as (?:such|noted|expected)|put (?:simply|differently)|to (?:begin|start) with),?\s+/iu;

/** The sentence's tokens, with its leading connective dropped. */
function body(s: Sentence): { toks: Token[]; lead: number } {
  const m = s.masked.match(CONNECTIVE);
  const lead = m ? m[0].length : 0;
  return { toks: tokens(s.masked).filter((t) => t.from >= lead), lead };
}

/** The topic position: the words up to the first finite verb (at most 8), or the first 4. */
export function topicPosition(s: Sentence): Token[] {
  const { toks } = body(s);
  const verb = toks.findIndex(finiteVerb);
  if (verb > 0 && verb <= 8) return toks.slice(0, verb);
  if (verb === 0) return toks.slice(0, 1);
  return toks.slice(0, Math.min(4, toks.length));
}

// A citation closing a sentence is convention, not an anticlimax.
const CITATION =
  /\s*(?:\((?:(?:see |cf\. )?[A-Z][\w-]*(?: et al\.)?,? (?:19|20)\d\d[a-z]?(?:[;,] ?)?)+\)|\[\d+(?:[,–-]\s?\d+)*\])\s*$/;

/** The stress position: the last clause after a colon or semicolon, else the last six words. */
export function stressPosition(s: Sentence): Token[] {
  const trimmed = s.masked.replace(/[.!?…]+["”’')\]]*\s*$/, '').replace(CITATION, '');
  const toks = tokens(trimmed);
  const cut = Math.max(trimmed.lastIndexOf(';'), trimmed.lastIndexOf(':'));
  if (cut !== -1) {
    const after = toks.filter((t) => t.from > cut);
    if (after.length >= 1 && after.length <= 12) return after;
  }
  return toks.slice(-6);
}

// ─────────────────────────────────────────────────────────── paragraphs

interface Paragraph extends Block {
  S: Sentence[];
}

/** Prose paragraphs with their sentences; list items are paragraphs of their own. */
function paragraphs(text: string, S: Sentence[]): Paragraph[] {
  const out: Paragraph[] = [];
  let i = 0;
  for (const b of blocks(text)) {
    if (b.heading) continue;
    const list: Sentence[] = [];
    while (i < S.length && S[i]!.from < b.to) {
      if (S[i]!.from >= b.from) list.push(S[i]!);
      i++;
    }
    if (list.length) out.push({ ...b, S: list });
  }
  return out;
}

const q = (s: string) => `“${s}”`;
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const spoken = (toks: Token[]) => toks.map((t) => t.word).join(' ');

// ─────────────────────────────────────────────────────────── plain words (Fenton)

interface Plain {
  re: RegExp;
  /** The replacement for the match, or '' to delete it; null when only the author can rewrite it. */
  fix: ((m: RegExpMatchArray) => string) | null;
  category: Finding['category'];
  title: string;
  note: string;
}

const same = (to: string) => () => to;
const alt = (...a: string[]) => a.join('|');

// Fenton's Table 1 (words), Table 2 (stock phrases), his legalisms, abstract
// wrappers and redundancy pairs; Graham's written-only words; the apostrophe
// and "should of" slips. Each is a one-click edit the author accepts or not.
const PLAIN: Plain[] = [
  {
    re: /\butili[sz](e|es|ed|ing|ation)\b/gi,
    fix: (m) => ({ e: 'use', es: 'uses', ed: 'used', ing: 'using', ation: 'use' })[m[1]!.toLowerCase()] ?? 'use',
    category: 'concision',
    title: 'Plain word',
    note: '“utilise” is “use” in a longer coat.',
  },
  {
    re: /\bfacilitat(e|es|ed|ing)\b/gi,
    fix: (m) => ({ e: 'help', es: 'helps', ed: 'helped', ing: 'helping' })[m[1]!.toLowerCase()] ?? 'help',
    category: 'concision',
    title: 'Plain word',
    note: '“facilitate” is “help” — or “make possible”, if that is what you mean.',
  },
  {
    re: /\bcommenc(e|es|ed|ing)\b/gi,
    fix: (m) => ({ e: 'start', es: 'starts', ed: 'started', ing: 'starting' })[m[1]!.toLowerCase()] ?? 'start',
    category: 'concision',
    title: 'Plain word',
    note: '“commence” is “start”.',
  },
  {
    re: /\bascertain(s|ed|ing)?\b/gi,
    fix: (m) =>
      ({ '': 'find out', s: 'finds out', ed: 'found out', ing: 'finding out' })[(m[1] ?? '').toLowerCase()] ??
      'find out',
    category: 'concision',
    title: 'Plain word',
    note: '“ascertain” is “find out”.',
  },
  {
    re: /\bendeavou?r(s|ed|ing)? to\b/gi,
    fix: (m) => `${{ '': 'try', s: 'tries', ed: 'tried', ing: 'trying' }[(m[1] ?? '').toLowerCase()] ?? 'try'} to`,
    category: 'concision',
    title: 'Plain word',
    note: '“endeavour to” is “try to”.',
  },
  {
    re: /\bnecessitat(e|es|ed|ing)\b/gi,
    fix: (m) => ({ e: 'need', es: 'needs', ed: 'needed', ing: 'needing' })[m[1]!.toLowerCase()] ?? 'need',
    category: 'concision',
    title: 'Plain word',
    note: '“necessitate” is “need” or “call for”.',
  },
  {
    re: /\bin excess of\b/gi,
    fix: same('more than'),
    category: 'concision',
    title: 'Plain words',
    note: '“in excess of” is “more than”.',
  },
  {
    re: /\b(?:with (?:regards?|respect) to|in (?:regards?|respect) (?:of|to))\b/gi,
    fix: same('about'),
    category: 'concision',
    title: 'Plain words',
    note: 'Four words for “about”.',
  },
  {
    re: /\bat (?:this|the present) (?:point in time|precise moment in time|moment in time|time)\b/gi,
    fix: same('now'),
    category: 'concision',
    title: 'Plain words',
    note: 'A stock phrase for “now”.',
  },
  {
    re: /\bprior to\b/gi,
    fix: same('before'),
    category: 'concision',
    title: 'Plain words',
    note: '“prior to” is “before”.',
  },
  {
    re: /\bsubsequent to\b/gi,
    fix: same('after'),
    category: 'concision',
    title: 'Plain words',
    note: '“subsequent to” is “after”.',
  },
  {
    re: /\bin order to\b/gi,
    fix: same('to'),
    category: 'concision',
    title: 'Plain words',
    note: '“in order to” is “to”.',
  },
  {
    re: /\b(?:due|owing) to the fact that\b|\bin view of the fact that\b|\bon account of the fact that\b/gi,
    fix: same('because'),
    category: 'concision',
    title: 'Plain words',
    note: 'Six words for “because”.',
  },
  {
    re: /\bin the event that\b/gi,
    fix: same('if'),
    category: 'concision',
    title: 'Plain words',
    note: '“in the event that” is “if”.',
  },
  {
    re: /\bthe majority of\b/gi,
    fix: same('most of'),
    category: 'concision',
    title: 'Plain words',
    note: '“the majority of” is “most of”.',
  },
  {
    re: /\bin the near future\b/gi,
    fix: same('soon'),
    category: 'concision',
    title: 'Plain words',
    note: '“in the near future” is “soon”.',
  },
  {
    re: /\bin (?:close proximity|the immediate vicinity) (?:to|of)\b/gi,
    fix: same('near'),
    category: 'concision',
    title: 'Plain words',
    note: 'Five words for “near”.',
  },
  {
    re: /\b(is|are|was|were) located (in|at|on|near|next to|adjacent to|beside|behind|under|above|below)\b/gi,
    fix: (m) => `${m[1]} ${m[2]}`,
    category: 'concision',
    title: 'Redundant word',
    note: '“is located in” is “is in”.',
  },
  {
    re: /\bby means of\b/gi,
    fix: same('by'),
    category: 'concision',
    title: 'Plain words',
    note: '“by means of” is “by”.',
  },
  {
    re: /\b(?:has|have) the ability to\b|\b(?:is|are) able to\b/gi,
    fix: same('can'),
    category: 'concision',
    title: 'Plain words',
    note: 'Four words for “can”.',
  },
  {
    re: /\b(am|is|are) in a position to\b/gi,
    fix: same('can'),
    category: 'concision',
    title: 'Abstract wrapper',
    note: '“in a position to” wraps “can”.',
  },
  {
    re: /\b(was|were) in a position to\b/gi,
    fix: same('could'),
    category: 'concision',
    title: 'Abstract wrapper',
    note: '“in a position to” wraps “could”.',
  },
  {
    re: /\bof an? (\w+) (?:nature|character)\b/gi,
    fix: (m) => m[1]!,
    category: 'concision',
    title: 'Abstract wrapper',
    note: '“of a satisfactory nature” is “satisfactory”: the wrapper adds nothing.',
  },
  {
    re: /\bvisibly see\b/gi,
    fix: same('see'),
    category: 'concision',
    title: 'Redundant word',
    note: 'Seeing is visible.',
  },
  {
    re: /\b(red|blue|green|yellow|white|black|grey|gray|brown|orange|purple|pink) in colou?r\b/gi,
    fix: (m) => m[1]!,
    category: 'concision',
    title: 'Redundant words',
    note: '“blue in colour” is “blue”.',
  },
  {
    re: /\bdo not hesitate to\b/gi,
    fix: same('please'),
    category: 'concision',
    title: 'Stock phrase',
    note: '“do not hesitate to” is “please”.',
  },
  {
    re: /\b(I am|we are) in receipt of\b/gi,
    fix: (m) => (m[1]!.toLowerCase().startsWith('i') ? 'I have' : 'we have'),
    category: 'concision',
    title: 'Stock phrase',
    note: '“in receipt of” is “have”.',
  },
  {
    re: /\bthere is a reasonable expectation that\b/gi,
    fix: same('probably'),
    category: 'concision',
    title: 'Stock phrase',
    note: 'Six words for “probably”.',
  },
  {
    re: /\btak(e|es|ing|en) into (?:consideration|account)\b|\btook into (?:consideration|account)\b/gi,
    fix: (m) =>
      m[0].toLowerCase().startsWith('took')
        ? 'considered'
        : ({ e: 'consider', es: 'considers', ing: 'considering', en: 'considered' }[m[1]!.toLowerCase()] ?? 'consider'),
    category: 'concision',
    title: 'Stock phrase',
    note: '“take into consideration” is “consider”.',
  },
  {
    re: /\bthe said (\w+)\b/gi,
    fix: (m) => `the ${m[1]}`,
    category: 'clarity',
    title: 'Legal word',
    note: '“the said” is a lawyer’s word; “the” does the job.',
  },
  {
    re: /\baforementioned\b/gi,
    fix: null,
    category: 'clarity',
    title: 'Legal word',
    note: '“aforementioned” sends the reader back to look; name the thing instead.',
  },
  {
    re: new RegExp(
      `\\b(?:${alt('forthwith', 'henceforth', 'hereof', 'hereto', 'herewith', 'thereof', 'therein', 'thereat', 'whereat', 'whereon', 'hereinafter')})\\b`,
      'gi',
    ),
    fix: null,
    category: 'clarity',
    title: 'Legal word',
    note: 'A word from contracts, not conversation. Say it as you would aloud.',
  },
  {
    re: /\bwhilst\b/gi,
    fix: same('while'),
    category: 'style',
    title: 'Written-only word',
    note: 'Nobody says “whilst”; “while” is the spoken word.',
  },
  {
    re: /\bamongst\b/gi,
    fix: same('among'),
    category: 'style',
    title: 'Written-only word',
    note: '“amongst” is “among”.',
  },
  {
    re: /\bapprox\.(?=\s*\d)/gi,
    fix: same('about'),
    category: 'concision',
    title: 'Abbreviation',
    note: '“approx.” saves the writer four letters and costs the reader a word.',
  },
  {
    re: /\b(such as|for example|including|e\.g\.,?)([^.;:\n]{3,80}?),? etc\.?(?=[\s.,;)]|$)/gi,
    fix: (m) => `${m[1]}${m[2]}`,
    category: 'concision',
    title: 'Redundant “etc.”',
    note: '“such as” already says the list is incomplete; “etc.” says it twice.',
  },
  {
    re: /\b(should|could|would|must|might) of\b(?!\s+course\b)/gi,
    fix: (m) => `${m[1]} have`,
    category: 'grammar',
    title: 'Grammar',
    note: '“should of” is how “should’ve” sounds; it is written “should have”.',
  },
  {
    re: /\b((?:19|20)\d0)(?:’|')s\b/g,
    fix: (m) => `${m[1]}s`,
    category: 'grammar',
    title: 'Apostrophe',
    note: 'A decade is a plural, not a possessive: “1990s”.',
  },
  {
    re: /\b(?:he\/she|she\/he|s\/he|he or she|she or he)\b/gi,
    fix: same('they'),
    category: 'style',
    title: 'Pronoun',
    note: 'For a person who could be anyone, “they” reads more easily than “he/she”.',
  },
  {
    re: /\b(?:him\/her|her\/him|him or her)\b/gi,
    fix: same('them'),
    category: 'style',
    title: 'Pronoun',
    note: '“them” reads more easily than “him/her”.',
  },
  {
    re: /\b(?:his\/her|her\/his|his or her)\b/gi,
    fix: same('their'),
    category: 'style',
    title: 'Pronoun',
    note: '“their” reads more easily than “his/her”.',
  },
  {
    re: /\babsolutely (critical|essential|vital|necessary|certain|impossible)\b/gi,
    fix: (m) => m[1]!,
    category: 'concision',
    title: 'Empty modifier',
    note: '“absolutely critical” means “critical”; the modifier adds emphasis, not information.',
  },
];

/** Keeps the capital when a replacement starts a sentence. */
const matchCase = (original: string, replacement: string) =>
  /^[A-Z]/.test(original) && /^[a-z]/.test(replacement) ? cap(replacement) : replacement;

function checkPlain(S: Sentence[], out: Finding[]): void {
  for (const s of S) {
    for (const p of PLAIN) {
      p.re.lastIndex = 0;
      for (const m of s.masked.matchAll(p.re)) {
        const from = s.from + m.index;
        const to = from + m[0].length;
        const original = s.text.slice(m.index, m.index + m[0].length);
        const f: Finding = { from, to, kind: 'plain', category: p.category, title: p.title, message: p.note };
        if (p.fix) {
          const replacement = p.fix(m);
          if (replacement.trim() !== original.trim()) f.suggestion = matchCase(original, replacement);
        }
        out.push(f);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────── the action in the verb (Gopen & Swan, Fenton)

// A noun made from a verb, and the verb it hides.
const NOMINALS: Record<string, string> = {
  decision: 'decide',
  analysis: 'analyse',
  assessment: 'assess',
  evaluation: 'evaluate',
  investigation: 'investigate',
  comparison: 'compare',
  description: 'describe',
  explanation: 'explain',
  recommendation: 'recommend',
  improvement: 'improve',
  contribution: 'contribute',
  consideration: 'consider',
  conclusion: 'conclude',
  agreement: 'agree',
  assistance: 'help',
  reference: 'refer',
  emphasis: 'emphasise',
  measurement: 'measure',
  development: 'develop',
  implementation: 'implement',
  reduction: 'reduce',
  examination: 'examine',
  discussion: 'discuss',
  determination: 'determine',
  calculation: 'calculate',
  specification: 'specify',
  identification: 'identify',
  modification: 'modify',
  verification: 'verify',
  validation: 'validate',
  observation: 'observe',
  selection: 'select',
  application: 'apply',
  adjustment: 'adjust',
  correction: 'correct',
  estimation: 'estimate',
  prediction: 'predict',
  detection: 'detect',
  inspection: 'inspect',
  revision: 'revise',
  completion: 'complete',
  submission: 'submit',
  distribution: 'distribute',
  collection: 'collect',
  presentation: 'present',
  demonstration: 'show',
  indication: 'indicate',
  tendency: 'tend',
  failure: 'fail',
  suggestion: 'suggest',
  assumption: 'assume',
  requirement: 'require',
  approval: 'approve',
  acquisition: 'acquire',
  utilisation: 'use',
  utilization: 'use',
  optimisation: 'optimise',
  optimization: 'optimize',
  documentation: 'document',
  notification: 'notify',
  confirmation: 'confirm',
  installation: 'install',
  configuration: 'configure',
  execution: 'run',
  creation: 'create',
  destruction: 'destroy',
  inhibition: 'inhibit',
  formation: 'form',
  production: 'produce',
  generation: 'generate',
  interpretation: 'interpret',
  classification: 'classify',
  authorisation: 'authorise',
  authorization: 'authorize',
  provision: 'provide',
  occurrence: 'occur',
  resolution: 'resolve',
  expansion: 'expand',
  replacement: 'replace',
  removal: 'remove',
  introduction: 'introduce',
  achievement: 'achieve',
  preference: 'prefer',
  dependence: 'depend',
  reliance: 'rely',
  resistance: 'resist',
  existence: 'exist',
  persistence: 'persist',
  emergence: 'emerge',
  correlation: 'correlate',
  variation: 'vary',
  alteration: 'alter',
  transformation: 'transform',
  migration: 'migrate',
  integration: 'integrate',
  separation: 'separate',
  combination: 'combine',
  negotiation: 'negotiate',
  payment: 'pay',
  investment: 'invest',
  commitment: 'commit',
  encouragement: 'encourage',
  establishment: 'establish',
  enforcement: 'enforce',
  management: 'manage',
  adoption: 'adopt',
  elimination: 'eliminate',
  prevention: 'prevent',
  protection: 'protect',
  promotion: 'promote',
  publication: 'publish',
  registration: 'register',
  termination: 'end',
  participation: 'take part',
  transcription: 'transcribe',
  translation: 'translate',
};

type Forms = [base: string, s: string, ed: string, ing: string];

const LIGHT: Record<string, Forms> = {
  make: ['make', 'makes', 'made', 'making'],
  take: ['take', 'takes', 'took', 'taking'],
  give: ['give', 'gives', 'gave', 'giving'],
  have: ['have', 'has', 'had', 'having'],
  reach: ['reach', 'reaches', 'reached', 'reaching'],
  come: ['come to', 'comes to', 'came to', 'coming to'],
  perform: ['perform', 'performs', 'performed', 'performing'],
  conduct: ['conduct', 'conducts', 'conducted', 'conducting'],
  carry: ['carry out', 'carries out', 'carried out', 'carrying out'],
  undertake: ['undertake', 'undertakes', 'undertook', 'undertaking'],
  provide: ['provide', 'provides', 'provided', 'providing'],
  place: ['place', 'places', 'placed', 'placing'],
  put: ['put', 'puts', 'put', 'putting'],
};

/** Which form of its light verb an idiom was used in: 0 base, 1 -s, 2 past, 3 -ing. */
function formOf(light: string, verb: Forms): number {
  const l = light.toLowerCase();
  const i = verb.indexOf(l);
  return i === -1 ? 0 : i;
}

interface Idiom {
  light: keyof typeof LIGHT;
  /** The object, as a pattern: "(?:a |the )?decisions?". */
  object: string;
  verb: Forms;
  /** What follows and is kept: " to" in "contribute to". */
  tail?: string;
}

const IDIOMS: Idiom[] = [
  { light: 'make', object: '(?:a |the )?decisions?', verb: ['decide', 'decides', 'decided', 'deciding'] },
  { light: 'take', object: '(?:a |the )?decisions?', verb: ['decide', 'decides', 'decided', 'deciding'] },
  { light: 'reach', object: '(?:a |the )?decisions?', verb: ['decide', 'decides', 'decided', 'deciding'] },
  {
    light: 'make',
    object: '(?:a |the )?comparisons? (?:of|between)',
    verb: ['compare', 'compares', 'compared', 'comparing'],
  },
  { light: 'make', object: 'use of', verb: ['use', 'uses', 'used', 'using'] },
  {
    light: 'make',
    object: '(?:a |an )?(?:assessments?|evaluations?) of',
    verb: ['assess', 'assesses', 'assessed', 'assessing'],
  },
  {
    light: 'make',
    object: '(?:a |the )?recommendations?',
    verb: ['recommend', 'recommends', 'recommended', 'recommending'],
  },
  {
    light: 'make',
    object: '(?:a |an )?improvements? (?:to|in)',
    verb: ['improve', 'improves', 'improved', 'improving'],
  },
  {
    light: 'make',
    object: '(?:a |the )?contributions? to',
    verb: ['contribute to', 'contributes to', 'contributed to', 'contributing to'],
  },
  { light: 'make', object: 'reference to', verb: ['refer to', 'refers to', 'referred to', 'referring to'] },
  { light: 'make', object: '(?:a |the )?payments?(?= (?:to|for|of))', verb: ['pay', 'pays', 'paid', 'paying'] },
  {
    light: 'make',
    object: '(?:a |the )?(?:choices?|selections?) (?:of|between|among)',
    verb: ['choose', 'chooses', 'chose', 'choosing'],
  },
  { light: 'reach', object: '(?:a |the )?conclusions?', verb: ['conclude', 'concludes', 'concluded', 'concluding'] },
  { light: 'come', object: '(?:a |the )?conclusions?', verb: ['conclude', 'concludes', 'concluded', 'concluding'] },
  { light: 'reach', object: '(?:an |the )?agreements?', verb: ['agree', 'agrees', 'agreed', 'agreeing'] },
  { light: 'come', object: '(?:an |the )?agreements?', verb: ['agree', 'agrees', 'agreed', 'agreeing'] },
  {
    light: 'perform',
    object: '(?:a |an |the )?(?:analysis|analyses) of',
    verb: ['analyse', 'analyses', 'analysed', 'analysing'],
  },
  {
    light: 'carry',
    object: '(?:a |an |the )?(?:analysis|analyses) of',
    verb: ['analyse', 'analyses', 'analysed', 'analysing'],
  },
  {
    light: 'conduct',
    object: '(?:a |an |the )?(?:analysis|analyses) of',
    verb: ['analyse', 'analyses', 'analysed', 'analysing'],
  },
  {
    light: 'conduct',
    object: '(?:an |the )?investigations? (?:of|into)',
    verb: ['investigate', 'investigates', 'investigated', 'investigating'],
  },
  {
    light: 'carry',
    object: '(?:an |the )?investigations? (?:of|into)',
    verb: ['investigate', 'investigates', 'investigated', 'investigating'],
  },
  {
    light: 'perform',
    object: '(?:an |the )?evaluations? of',
    verb: ['evaluate', 'evaluates', 'evaluated', 'evaluating'],
  },
  {
    light: 'carry',
    object: '(?:an |the )?evaluations? of',
    verb: ['evaluate', 'evaluates', 'evaluated', 'evaluating'],
  },
  { light: 'conduct', object: '(?:a |the )?reviews? of', verb: ['review', 'reviews', 'reviewed', 'reviewing'] },
  {
    light: 'perform',
    object: '(?:a |the )?(?:measurements?) of',
    verb: ['measure', 'measures', 'measured', 'measuring'],
  },
  {
    light: 'provide',
    object: '(?:a |the )?descriptions? of',
    verb: ['describe', 'describes', 'described', 'describing'],
  },
  { light: 'give', object: '(?:a |the )?descriptions? of', verb: ['describe', 'describes', 'described', 'describing'] },
  {
    light: 'give',
    object: '(?:an |the )?explanations? (?:of|for)',
    verb: ['explain', 'explains', 'explained', 'explaining'],
  },
  {
    light: 'provide',
    object: '(?:an |the )?explanations? (?:of|for)',
    verb: ['explain', 'explains', 'explained', 'explaining'],
  },
  { light: 'give', object: 'consideration to', verb: ['consider', 'considers', 'considered', 'considering'] },
  { light: 'provide', object: 'assistance to', verb: ['help', 'helps', 'helped', 'helping'] },
  {
    light: 'provide',
    object: '(?:a |the )?summary of',
    verb: ['summarise', 'summarises', 'summarised', 'summarising'],
  },
  {
    light: 'have',
    object: '(?:a |an )?(?:effect|impact|influence) (?:on|upon)',
    verb: ['affect', 'affects', 'affected', 'affecting'],
  },
  { light: 'have', object: '(?:a |the )?tendency to', verb: ['tend to', 'tends to', 'tended to', 'tending to'] },
  { light: 'have', object: '(?:a |the )?(?:need|requirement) for', verb: ['need', 'needs', 'needed', 'needing'] },
  {
    light: 'place',
    object: '(?:an |the )?emphasis on',
    verb: ['emphasise', 'emphasises', 'emphasised', 'emphasising'],
  },
  { light: 'put', object: '(?:an |the )?emphasis on', verb: ['emphasise', 'emphasises', 'emphasised', 'emphasising'] },
  { light: 'give', object: '(?:a |the )?demonstrations? of', verb: ['show', 'shows', 'showed', 'showing'] },
  {
    light: 'give',
    object: '(?:an |the )?indications? (?:of|that)',
    verb: ['indicate', 'indicates', 'indicated', 'indicating'],
  },
  {
    light: 'undertake',
    object: '(?:a |an |the )?(?:review|study|analysis|assessment) of',
    verb: ['study', 'studies', 'studied', 'studying'],
  },
];

const IDIOM_RES = IDIOMS.map((idiom) => ({
  idiom,
  re: new RegExp(`\\b(${LIGHT[idiom.light].join('|')}) ${idiom.object}\\b`, 'gi'),
}));

// "The analysis of the data was performed by the team" — the doer at the end,
// the action in a noun, a verb that does nothing.
const PASSIVE_NOMINAL =
  /\b(?:the )?(\w+) of ([^,;:()]{2,60}?) (was|were) (?:then |also |first |finally )?(?:performed|carried out|conducted|undertaken|done|made|completed) by ([^,;:().]{2,40}?)(?=[.,;:]|$)/gi;

function past(verb: string): string {
  const [head, ...rest] = verb.split(' ');
  const h = head!;
  const p = /e$/.test(h) ? `${h}d` : /[^aeiou]y$/.test(h) ? `${h.slice(0, -1)}ied` : `${h}ed`;
  return [p, ...rest].join(' ');
}

/** Nouns made from verbs in a sentence, with the verbs they hide. */
function nominalsIn(toks: Token[]): [noun: string, verb: string][] {
  const out: [string, string][] = [];
  for (const t of toks) {
    const singular = t.lower.replace(/(?<=[a-z])s$/, '').replace(/ses$/, 'sis');
    const verb = NOMINALS[singular] ?? NOMINALS[t.lower];
    if (verb) out.push([t.word, verb]);
  }
  return out;
}

const SUFFIX_NOMINAL = /^\p{L}{5,}(?:tion|sion|ment|ance|ence|ity|ness|ysis|isation|ization)s?$/u;

function checkActions(P: Paragraph[], out: Finding[], structural: Map<Paragraph, Finding[]>): void {
  for (const p of P) {
    for (const s of p.S) {
      // Fixed idioms: the light verb and its noun become the verb.
      for (const { idiom, re } of IDIOM_RES) {
        re.lastIndex = 0;
        for (const m of s.masked.matchAll(re)) {
          const form = formOf(m[1]!, LIGHT[idiom.light]);
          const original = s.text.slice(m.index, m.index + m[0].length);
          out.push({
            from: s.from + m.index,
            to: s.from + m.index + m[0].length,
            kind: 'hidden-action',
            category: 'clarity',
            title: 'Action hidden in a noun',
            message: `${q(original)} carries its action in a noun; the verb is ${q(idiom.verb[form]!)}.`,
            suggestion: matchCase(original, idiom.verb[form]!),
          });
        }
      }
      // "The X of Y was performed by Z" → "Z X-ed Y".
      PASSIVE_NOMINAL.lastIndex = 0;
      for (const m of s.masked.matchAll(PASSIVE_NOMINAL)) {
        const verb = NOMINALS[m[1]!.toLowerCase()];
        if (!verb) continue;
        const original = s.text.slice(m.index, m.index + m[0].length);
        const doer = s.text.slice(m.index + m[0].lastIndexOf(m[4]!), m.index + m[0].length);
        const object = s.text.slice(m.index + m[0].indexOf(m[2]!), m.index + m[0].indexOf(m[2]!) + m[2]!.length);
        out.push({
          from: s.from + m.index,
          to: s.from + m.index + m[0].length,
          kind: 'hidden-action',
          category: 'clarity',
          title: 'Action hidden in a noun',
          message: `The doer arrives last and the verb (${q(m[3]!)}) does nothing. The action is ${q(verb)}: who did what, in that order.`,
          suggestion: matchCase(original, `${doer} ${past(verb)} ${object}`),
        });
      }
    }
    // A paragraph told in "is", "has" and "there is": the actions sit in its nouns.
    const weak: { s: Sentence; nouns: [string, string][] }[] = [];
    for (const s of p.S) {
      const toks = tokens(s.masked);
      const verb = toks.find(finiteVerb);
      if (!verb || !/^(?:am|is|are|was|were|be|been|being|has|have|had)$/.test(verb.lower)) continue;
      // Verbs after the first: "is" as an auxiliary of a real verb ("is growing") doesn't count.
      const i = toks.indexOf(verb);
      const next = toks[i + 1];
      if (next && /(?:ing|ed|en)$/.test(next.lower) && !SUFFIX_NOMINAL.test(next.lower)) continue;
      const nouns = nominalsIn(toks);
      if (nouns.length >= 2 || (nouns.length === 1 && toks.filter((t) => SUFFIX_NOMINAL.test(t.lower)).length >= 2))
        weak.push({ s, nouns });
    }
    if (weak.length) {
      const w = weak[0]!;
      const shown = w.nouns.slice(0, 3);
      const list = structural.get(p) ?? [];
      list.push({
        from: w.s.from,
        to: w.s.to,
        kind: 'weak-verb',
        category: 'clarity',
        title: 'The action is in the nouns',
        message: `The verb here is ${q(tokens(w.s.masked).find(finiteVerb)!.word)}, so a reader looks for the action in the nouns: ${shown
          .map(([n, v]) => `${q(n)} (${v})`)
          .join(', ')}. Readers expect the action in the verb — who does what.`,
      });
      structural.set(p, list);
    }
  }
}

// ─────────────────────────────────────────────────────────── subject–verb separation (Gopen & Swan)

/** Words inside a bracketed or comma-set aside before the first finite verb. */
function checkInterruptions(S: Sentence[], out: Finding[]): void {
  for (const s of S) {
    const { toks, lead } = body(s);
    const verbAt = toks.findIndex(finiteVerb);
    if (verbAt < 3) continue;
    const verb = toks[verbAt]!;
    const head = s.masked.slice(lead, verb.from);
    // The asides: (…), […], — … —, and ", … ," with the sentence still readable without it.
    const asides: { from: number; to: number; words: number }[] = [];
    const add = (from: number, to: number) => {
      const words = tokens(head.slice(from, to)).length;
      asides.push({ from: lead + from, to: lead + to, words });
    };
    for (const m of head.matchAll(/\(([^()]*)\)|\[([^\]]*)\]/g)) add(m.index, m.index + m[0].length);
    for (const m of head.matchAll(/[—–]\s*([^—–]+?)\s*[—–]/g)) add(m.index, m.index + m[0].length);
    // ", which …, " / ", a 207-nucleotide reading frame, " between a first comma and a later one.
    const commas = [...head.matchAll(/,/g)].map((m) => m.index);
    for (let i = 0; i + 1 < commas.length; i++) {
      const a = commas[i]!;
      const b = commas[i + 1]!;
      if (a > 0 && tokens(head.slice(0, a)).length >= 1) add(a, b + 1);
    }
    const longest = asides.sort((x, y) => y.words - x.words)[0];
    const total = asides.reduce((n, a) => n + a.words, 0);
    if (!longest || (longest.words < 10 && total < 14)) continue;
    const span = longest.words >= 10 ? longest : { from: asides.at(-1)!.from, to: asides[0]!.to };
    out.push({
      from: s.from + span.from,
      to: s.from + span.to,
      kind: 'interruption',
      category: 'clarity',
      title: 'Subject and verb far apart',
      message: `${total} words come between the subject and its verb ${q(verb.word)}. A reader holds the sentence open until the verb arrives and reads the aside as unimportant, whatever it says. If it matters, give it its own sentence; if not, cut it.`,
    });
  }
}

// ─────────────────────────────────────────────────────────── the stress position (Gopen & Swan)

// Endings a reader can't stress: afterthoughts, hedges, pointers elsewhere.
const WEAK_ENDING =
  /\b(?:as well|too|etc\.?|and so on|and so forth|respectively|among others|in general|to some extent|in some cases|for the most part|or so|if any|if at all|in this (?:article|paper|post|piece|section|chapter|report|essay)|as (?:discussed|described|mentioned|noted|shown|seen|explained|outlined) (?:above|below|earlier|previously|before|later)|as mentioned|as noted|as described|however|though|anyway|of course|at least|at all|in a sense|in a way|in some ways|more or less|and the like|or whatever|or something)(?=[.!?…]+["”’')\]]*\s*$)/i;

function checkEndings(P: Paragraph[], out: Finding[]): void {
  for (const p of P) {
    let n = 0;
    for (const s of p.S) {
      if (n >= 2) break;
      const text = s.masked.replace(CITATION, (m) => ' '.repeat(m.length));
      const m = text.match(WEAK_ENDING);
      if (!m || tokens(text).length < 8) continue;
      // "however" as a connective within the sentence, not at its end: the regex insists on the end.
      n++;
      out.push({
        from: s.from + m.index!,
        to: s.from + m.index! + m[0].length,
        kind: 'weak-ending',
        category: 'style',
        title: 'Ends on an afterthought',
        message: `A reader stresses whatever a sentence ends on, and this one ends on ${q(m[0])}. Move the point to the end, or drop the tail.`,
      });
    }
  }
}

// ─────────────────────────────────────────────────────────── old before new; whose story (Gopen & Swan)

const hasAnaphor = (toks: Token[]) => toks.some((t) => ANAPHOR.has(t.lower));
const intersect = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x));

/** The structural notes for a paragraph: old before new, a missing link back, a story that keeps changing. */
function checkFlow(P: Paragraph[], structural: Map<Paragraph, Finding[]>): void {
  for (const p of P) {
    if (p.S.length < 2) continue;
    const list = structural.get(p) ?? [];
    const all = p.S.map((s) => contentStems(tokens(s.masked)));
    const topics = p.S.map(topicPosition);
    const topicStems = topics.map(contentStems);

    for (let i = 1; i < p.S.length; i++) {
      const s = p.S[i]!;
      const toks = tokens(s.masked);
      if (toks.length < 8) continue;
      const old = new Set([...all[i - 1]!, ...(i >= 2 ? all[i - 2]! : []), ...all[0]!]);
      const topic = topics[i]!;
      const tStems = topicStems[i]!;
      const stress = contentStems(stressPosition(s));
      const linksBack = hasAnaphor(topic) || intersect(tStems, old).length > 0;
      // New in front, old at the back: the sentence is probably reversible with its own words.
      if (!linksBack && tStems.size >= 1 && stress.size >= 1) {
        const shared = intersect(stress, old);
        if (shared.length >= 2 || (stress.size <= 3 && shared.length >= 1)) {
          list.push({
            from: s.from + topic[0]!.from,
            to: s.from + topic.at(-1)!.to,
            kind: 'new-before-old',
            category: 'clarity',
            title: 'New before old',
            message: `This sentence opens on ${q(spoken(topic))}, which the reader hasn’t met, and ends on what they already know. Readers link backward from a sentence’s start and stress its end — try it the other way round.`,
          });
          continue;
        }
      }
      // Nothing in the sentence picks up the one before: the reader has to guess the step.
      // (A short lead-in sentence — "Finish a sentence and pause." — sets up what follows; skip those.)
      const stems = all[i]!;
      if (
        stems.size >= 5 &&
        all[i - 1]!.size >= 4 &&
        !hasAnaphor(toks.slice(0, 4)) &&
        !CONNECTIVE.test(s.masked) &&
        intersect(stems, new Set([...all[i - 1]!, ...(i >= 2 ? all[i - 2]! : [])])).length === 0
      ) {
        list.push({
          from: s.from,
          to: s.to,
          kind: 'no-link',
          category: 'structure',
          title: 'No link back',
          message:
            'Nothing in this sentence picks up the one before it. If the step between them is obvious to you, it is yours to state; a reader can only guess it.',
        });
      }
    }

    // Each sentence opens on something new: whose story is this?
    if (p.S.length >= 4) {
      const seen = new Set<string>();
      let fresh = 0;
      const openers: string[] = [];
      for (let i = 0; i < p.S.length; i++) {
        const t = topics[i]!;
        const st = topicStems[i]!;
        const repeats = i > 0 && (hasAnaphor(t) || intersect(st, seen).length > 0);
        if (!repeats && st.size) {
          fresh++;
          openers.push(spoken(t.slice(0, 3)));
        }
        for (const x of st) seen.add(x);
        for (const x of all[i]!) seen.add(x);
      }
      if (fresh >= 4 && fresh === p.S.length) {
        list.push({
          from: p.S[0]!.from,
          to: p.S[0]!.to,
          kind: 'topic-shift',
          category: 'structure',
          title: 'Whose story is this?',
          message: `Every sentence here opens on something new: ${openers
            .slice(0, 4)
            .map(q)
            .join(
              ', ',
            )}. Readers take a paragraph to be about whoever keeps showing up first. Pick its subject and lead with it.`,
        });
      }
    }
    if (list.length) structural.set(p, list);
  }
}

// ─────────────────────────────────────────────────────────── shape (Fenton, Chapin)

const SEQUENCE =
  /^\s*(?:first(?:ly)?|second(?:ly)?|third(?:ly)?|fourth(?:ly)?|fifth|next|then|after that|finally|lastly|last|another|also|in addition|furthermore|moreover|one such|the first|the second|the third|the next|the last)\b/i;

function checkShape(P: Paragraph[], structural: Map<Paragraph, Finding[]>): void {
  for (const p of P) {
    if (p.list || p.S.length < 3) continue;
    const list = structural.get(p) ?? [];
    // Steps or items told in prose.
    const markers = p.S.filter((s) => SEQUENCE.test(s.masked));
    if (markers.length >= 3) {
      list.push({
        from: p.S[0]!.from,
        to: p.S[0]!.to,
        kind: 'hidden-list',
        category: 'structure',
        title: 'A list told in prose',
        message: `${markers.length} sentences here are items in a sequence (${markers
          .slice(0, 3)
          .map((s) => q(s.masked.match(SEQUENCE)![0].trim()))
          .join(', ')}). If it is a list, show it as one — numbered if the order matters.`,
      });
    }
    // The same opener three times running.
    const firsts = p.S.map((s) => tokens(s.masked)[0]?.lower ?? '');
    for (let i = 0; i + 2 < firsts.length; i++) {
      const w = firsts[i]!;
      if (!w || /^(?:the|a|an|i|we|you|it|in|on|at|to)$/.test(w)) continue;
      if (firsts[i + 1] === w && firsts[i + 2] === w) {
        list.push({
          from: p.S[i]!.from,
          to: p.S[i + 2]!.to,
          kind: 'same-opener',
          category: 'style',
          title: 'Three sentences, one opener',
          message: `Three sentences in a row open with ${q(cap(w))}. A reader hears the repetition before the sense. Vary the opening, or join two of them.`,
        });
        break;
      }
    }
    // Every sentence the same length: nothing for the ear to hold on to.
    if (p.S.length >= 4) {
      const lens = p.S.map((s) => tokens(s.masked).length);
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) ** 2, 0) / lens.length);
      if (mean >= 12 && sd < 2.5) {
        list.push({
          from: p.S[0]!.from,
          to: p.S[0]!.to,
          kind: 'monotone',
          category: 'style',
          title: 'Every sentence the same length',
          message: `All ${lens.length} sentences here run ${Math.min(...lens)}–${Math.max(...lens)} words. Prose that reads well varies its stride; one short sentence would give the reader a foothold.`,
        });
      }
    }
    if (list.length) structural.set(p, list);
  }
}

// ─────────────────────────────────────────────────────────── strength and hedging (Graham)

const HEDGE =
  /\b(?:perhaps|maybe|possibly|might|may|could|seems? to|seemed to|appears? to|appeared to|somewhat|rather|relatively|fairly|arguably|to some extent|to a certain extent|in some cases|in some ways|in certain cases|it is possible that|tends? to|tended to|generally|often|sometimes|likely|probably|presumably|conceivably|suggests? that|would seem|it seems|it appears|sort of|kind of|a bit|more or less|in a sense|not necessarily|we believe|i (?:think|believe|suspect|guess))\b/gi;

// Sentences that are true because they say nothing: "a complex issue", "many factors".
const VAPOUR =
  /\b(?:(?:is|are|was|were|remains?|becomes?|be) (?:a |an |another )?(?:very |highly |extremely |rather |quite |somewhat )?(?:complex|complicated|nuanced|multifaceted|multi-faceted|difficult|tricky) (?:issue|question|topic|subject|matter|problem|area|one|thing)s?|(?:there are|are|has|have|involves?|depends? on) (?:many|a number of|various|several|numerous|a range of|a variety of|a lot of|lots of) (?:different )?(?:factors|variables|considerations|things|aspects|elements|reasons)|(?:it|this|that|the answer) (?:all )?depends|there are (?:both )?(?:pros and cons|advantages and disadvantages|benefits and drawbacks|upsides and downsides)|(?:it would be|it is|it’s|it's) (?:a mistake|wrong|too simple|simplistic) to (?:oversimplify|generalise|generalize|say)|(?:in|on) (?:some|many|various|certain|several|different) (?:ways|levels|respects)|to (?:some|a certain|a greater or lesser|varying) (?:extent|degree)s?|can be (?:very |quite |rather )?(?:important|useful|helpful|significant|valuable|beneficial|interesting|challenging|problematic)|plays? (?:a |an )?(?:important |significant |key |major |big |vital )?(?:role|part) in|(?:a|the) (?:wide )?range of (?:factors|issues|things|considerations))\b/i;

function checkStrength(S: Sentence[], out: Finding[]): void {
  for (const s of S) {
    const t = s.masked;
    const hedges = [...new Set([...t.matchAll(HEDGE)].map((m) => m[0].toLowerCase()))];
    if (hedges.length >= 3) {
      out.push({
        from: s.from,
        to: s.to,
        kind: 'hedge-stack',
        category: 'clarity',
        title: 'Hedged three times',
        message: `${hedges.length} hedges in one sentence (${hedges.slice(0, 3).map(q).join(', ')}). One of them carries your uncertainty; the rest blur it. Say how sure you are once.`,
      });
      continue;
    }
    const m = t.match(VAPOUR);
    if (!m) continue;
    const toks = tokens(t);
    const concrete = /\d/.test(t) || toks.slice(1).filter((x) => /^[A-Z]/.test(x.word)).length >= 1;
    if (concrete) continue;
    out.push({
      from: s.from + m.index!,
      to: s.from + m.index! + m[0].length,
      kind: 'says-nothing',
      category: 'evidence',
      title: 'True, but says nothing',
      message: `${q(m[0])} is safe because nobody could disagree with it. What is the strongest version you know to be true — which factors, how complex, compared with what?`,
    });
  }
}

// ─────────────────────────────────────────────────────────── initials (Fenton, Gopen & Swan)

// Initials readers know, and strings that only look like initials.
const KNOWN_INITIALS = new Set(
  `USA US UK EU UN UNESCO NATO NASA FBI CIA NHS BBC CNN NYT WHO IMF WTO OECD GDP CEO CFO CTO COO CMO CIO VP HR PR IT AI ML API URL HTML CSS PDF JSON XML SQL CPU GPU RAM SSD USB HTTP HTTPS SSL TLS DNS IP TCP UDP SMS MMS GPS TV DVD CD LED LCD PC OS iOS AM PM BC AD CE BCE ID OK FAQ DIY RSVP ASAP PhD MD BA MA BSc MSc MBA JD LLM GPT ROI NPV IRR EPS EV EBITDA P&L IPO ETF SEC FTC FDA EPA IRS DOJ NFL NBA MLB NHL FIFA UEFA MIT UCLA NYC LA DC SF UX UI QA CI CD SDK IDE CLI GUI SaaS B2B B2C KPI OKR MVP CRM ERP SEO CMS DIY FYI IMO TBD TBA ETA RIP VIP ATM PIN ZIP SUV GMO DNA RNA HIV AIDS COVID MRI CT ICU ER ADHD IQ EQ ESG VC PE LP GP USD EUR GBP JPY CHF CNY AUD CAD BTC ETH NFT USB HDMI WiFi LTE 5G 4G 3D 2D VR AR XR UTC GMT EST PST CET BST`
    .split(/\s+/)
    .filter(Boolean),
);
const ROMAN = /^(?:I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV|XVI{0,3}|XIX|XX)$/;

interface Initials {
  name: string;
  uses: { from: number; to: number }[];
  definedAt: number;
}

/** Initials used without being spelled out, or spelled out only after they were first used. */
function checkInitials(text: string, S: Sentence[], out: Finding[]): void {
  const seen = new Map<string, Initials>();
  for (const s of S) {
    for (const m of s.masked.matchAll(
      /(?<![\w&/-])([A-Z][A-Z0-9]{1,5}|[A-Z][a-z]?[A-Z][A-Za-z]{0,4})(?:s|’s|'s)?(?![\w&/-])/g,
    )) {
      const name = m[1]!;
      if (name.length < 2 || !/[A-Z]{2}/.test(name) || KNOWN_INITIALS.has(name) || ROMAN.test(name)) continue;
      if (/^\d/.test(name) || /^[A-Z]\d/.test(name)) continue;
      const at = { from: s.from + m.index, to: s.from + m.index + m[0].length };
      const rec = seen.get(name) ?? { name, uses: [], definedAt: -1 };
      rec.uses.push(at);
      seen.set(name, rec);
    }
  }
  if (!seen.size) return;
  for (const rec of seen.values()) {
    // "Long Name (LN)" or "LN (long name)" anywhere in the draft.
    const esc = rec.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const after = new RegExp(`\\(${esc}s?\\)`);
    const before = new RegExp(
      `\\b${esc}s?\\s*\\((?=[a-z])[^)]{4,}\\)|\\b${esc}\\s+(?:stands for|is short for|means)\\b`,
    );
    const a = text.search(after);
    const b = text.search(before);
    rec.definedAt = a !== -1 && b !== -1 ? Math.min(a, b) : Math.max(a, b);
  }
  const notes: Finding[] = [];
  for (const rec of seen.values()) {
    const first = rec.uses[0]!;
    if (rec.definedAt === -1) {
      if (rec.uses.length < 2) continue;
      notes.push({
        ...first,
        kind: 'initials',
        category: 'clarity',
        title: 'Initials never spelled out',
        message: `${q(rec.name)} appears ${rec.uses.length} times and is never spelled out. Write it in full the first time, with the initials in brackets — a reader who doesn’t know it is lost from here on.`,
      });
    } else if (first.from < rec.definedAt - 1 && !text.slice(first.from, rec.definedAt).match(/^\S+\s*\(/)) {
      // The definition sits after this first use (and this use isn't the one being defined).
      const defined = text.slice(Math.max(0, rec.definedAt - 60), rec.definedAt + rec.name.length + 2).trim();
      notes.push({
        ...first,
        kind: 'initials',
        category: 'clarity',
        title: 'Used before it is defined',
        message: `${q(rec.name)} is spelled out only later (“…${defined.slice(-50)}”). Readers meet it here first: define it here.`,
      });
    }
  }
  out.push(...notes.sort((x, y) => x.from - y.from).slice(0, 6));
}

// ─────────────────────────────────────────────────────────── sentence mechanics (Fenton)

function checkMechanics(S: Sentence[], genre: Genre, out: Finding[]): void {
  for (const s of S) {
    const t = s.masked;
    const nested = t.match(/\([^()]*\(/);
    if (nested) {
      out.push({
        from: s.from + nested.index!,
        to: s.from + nested.index! + nested[0].length,
        kind: 'nested-parens',
        category: 'clarity',
        title: 'Brackets inside brackets',
        message:
          'An aside inside an aside: the reader loses the sentence. Give the inner one its own sentence, or cut it.',
      });
    }
    if (genre === 'technical' || genre === 'scientific') {
      const spatial = t.match(
        /\b(?:the )?(?:figure|table|chart|diagram|graph|image|screenshot|listing|equation) (?:above|below|on the (?:left|right)|opposite)\b|\bthe (?:following|preceding|previous|next) (?:figure|table|diagram|chart|graph)\b/i,
      );
      if (spatial)
        out.push({
          from: s.from + spatial.index!,
          to: s.from + spatial.index! + spatial[0].length,
          kind: 'spatial-ref',
          category: 'clarity',
          title: 'Points at a position, not a number',
          message: `${q(spatial[0])} stops being true the moment the page is laid out again. Number the figure and refer to it by number.`,
        });
    }
    if (genre === 'scientific') {
      const sig = t.match(/\bsignificant(?:ly)?\b/i);
      if (sig && !/\d|\bp\s*[<=>]|statistic|confidence|test|effect size|interval/i.test(t))
        out.push({
          from: s.from + sig.index!,
          to: s.from + sig.index! + sig[0].length,
          kind: 'significant',
          category: 'evidence',
          title: '“Significant”: statistically, or just large?',
          message:
            'In a paper “significant” is a claim about a test. If you mean a test, give the statistic; if you mean “large”, say “large”.',
        });
    }
  }
}

// ─────────────────────────────────────────────────────────── openings and promises (Fenton, Pak, Halevi, Gopen & Swan)

const DESCRIPTIVE =
  /^\s*(?:(?:this|the present|in this) (?:article|paper|post|piece|report|essay|guide|study|note|document|chapter|section)\b[^.!?]{0,80}?\b(?:describes?|discuss(?:es)?|presents?|examines?|considers?|explores?|looks? at|outlines?|covers?|addresses|deals with|aims? to|is about|focuses on|provides? an overview|introduces?|reviews?|surveys?)|(?:we|i) (?:will |shall |first )?(?:describe|discuss|present|examine|consider|explore|outline|cover|address|look at|review|survey|introduce)\b)/i;
const CLAIM =
  /\d|\b(?:show|shows|showed|found|find|finds|argue|argues|recommend|recommends|conclude|concludes|because|should|must|never|always|than|not|no|fails?|works?|beats?|costs?|saves?|is the|are the|result|answer|best|worst|wrong|right)\b/i;

function checkOpening(P: Paragraph[], out: Finding[]): void {
  const first = P.find((p) => !p.list && p.S.length >= 1);
  if (!first) return;
  const described = first.S.find((s) => DESCRIPTIVE.test(s.masked));
  if (!described) return;
  const whole = first.S.map((s) => s.masked).join(' ');
  if (CLAIM.test(whole.replace(DESCRIPTIVE, ''))) return;
  out.push({
    from: described.from,
    to: described.to,
    kind: 'descriptive-opening',
    category: 'structure',
    title: 'Says what it will discuss, not what it found',
    message:
      'The opening promises a discussion and withholds the result. Most readers never get further than the opening: tell them what you found or what you argue, then how.',
  });
}

const COUNT: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};
const ANNOUNCES =
  /\b(two|three|four|five|six|seven|eight|nine|ten|[2-9]|10)\s+(?:\w+\s+){0,2}?(?:reasons|things|steps|ways|points|factors|parts|kinds|types|cases|questions|rules|principles|lessons|options|benefits|problems|causes|effects|stages|examples|ideas|changes|components|elements|features|goals|conditions|criteria|requirements|strategies|mistakes|tips|areas|aspects|phases|levels|categories|approaches|methods|tools|signs|forms|sources|outcomes|risks|advantages|disadvantages|differences|choices|habits|tests|checks|answers|arguments|objections|exceptions|scenarios|patterns|parts)\b[^.!?]{0,40}:\s*$/i;

/** "Three reasons:" followed by a list of four. */
function checkAnnouncedCounts(text: string, P: Paragraph[], out: Finding[]): void {
  const B = blocks(text);
  for (const p of P) {
    if (p.list) continue;
    const last = p.S.at(-1);
    if (!last) continue;
    const line = text.slice(p.from, p.to);
    const m = line.match(ANNOUNCES);
    if (!m) continue;
    const announced = COUNT[m[1]!.toLowerCase()] ?? Number(m[1]);
    // The list items right after this paragraph.
    let i = B.findIndex((b) => b.from === p.from);
    if (i === -1) continue;
    let items = 0;
    for (i++; i < B.length && B[i]!.list; i++) {
      // Only top-level items: a nested item is indented.
      if (!/^\s{2,}/.test(text.slice(B[i]!.from, B[i]!.to))) items++;
    }
    if (!items || items === announced) continue;
    const at = p.from + m.index! + m[0].indexOf(m[1]!);
    out.push({
      from: at,
      to: at + m[1]!.length,
      kind: 'count-mismatch',
      category: 'consistency',
      title: 'The count and the list disagree',
      message: `This promises ${announced}; the list that follows has ${items}. A reader counts.`,
      suggestion: /^\d/.test(m[1]!)
        ? String(items)
        : (Object.entries(COUNT).find(([, n]) => n === items)?.[0] ?? String(items)),
    });
  }
}

// ─────────────────────────────────────────────────────────── entry points

// Within a paragraph, one structural note is enough; this is the order of
// preference when several apply. A list told in prose comes first: it is
// the most concrete diagnosis, and it explains the shifting openers too.
const STRUCTURAL_ORDER = [
  'hidden-list',
  'new-before-old',
  'weak-verb',
  'topic-shift',
  'no-link',
  'same-opener',
  'monotone',
];

/** Caps per kind for one draft, so a long piece gets a sample, not a flood. */
const CAPS: Record<string, number> = {
  plain: 14,
  'hidden-action': 10,
  interruption: 6,
  'weak-ending': 6,
  'hedge-stack': 5,
  'says-nothing': 5,
  'nested-parens': 4,
  'spatial-ref': 4,
  significant: 4,
};

/**
 * Findings about how the prose reads, from the reader-expectation and
 * plain-English literature. `S` is the draft's sentences, shared with the
 * other checks.
 */
export function styleFindings(text: string, genre: Genre, S: Sentence[] = sentences(text)): Finding[] {
  const P = paragraphs(text, S);
  const out: Finding[] = [];
  const structural = new Map<Paragraph, Finding[]>();
  checkPlain(S, out);
  checkActions(P, out, structural);
  checkInterruptions(S, out);
  checkEndings(P, out);
  checkFlow(P, structural);
  checkShape(P, structural);
  checkStrength(S, out);
  checkInitials(text, S, out);
  checkMechanics(S, genre, out);
  checkOpening(P, out);
  checkAnnouncedCounts(text, P, out);
  for (const list of structural.values()) {
    list.sort((a, b) => STRUCTURAL_ORDER.indexOf(a.kind) - STRUCTURAL_ORDER.indexOf(b.kind));
    out.push(list[0]!);
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

// ─────────────────────────────────────────────────────────── the skeleton

export interface SkeletonSentence {
  from: number;
  to: number;
  /** The topic position: who or what the sentence is about, by its opening words. */
  opener: string;
  /** The first finite verb, when it is a form of be, have or do — the sign of an action hidden elsewhere; null when the verb is a real one. */
  verb: string | null;
  words: number;
}

export interface SkeletonParagraph {
  from: number;
  to: number;
  /** The heading this paragraph sits under, if any. */
  heading: string;
  sentences: SkeletonSentence[];
}

/**
 * The draft stripped to what Gopen & Swan list when they diagnose a passage:
 * each sentence's opening words and its verb, paragraph by paragraph. The
 * list itself is the diagnosis — a reader can see whose story a paragraph
 * tells, and whether its verbs act.
 */
export function skeleton(text: string): SkeletonParagraph[] {
  const S = sentences(text);
  const out: SkeletonParagraph[] = [];
  let heading = '';
  let i = 0;
  for (const b of blocks(text)) {
    if (b.heading) {
      heading = text.slice(b.from, b.to).replace(/^#+\s*/, '');
      continue;
    }
    const list: SkeletonSentence[] = [];
    while (i < S.length && S[i]!.from < b.to) {
      const s = S[i]!;
      i++;
      if (s.from < b.from) continue;
      const toks = tokens(s.masked);
      const verb = toks.find(finiteVerb);
      const weak = verb && /^(?:am|is|are|was|were|be|been|being|has|have|had|do|does|did)$/.test(verb.lower);
      // "is growing", "has shown": the auxiliary of a real verb.
      const next = verb ? toks[toks.indexOf(verb) + 1] : undefined;
      const auxiliary = !!next && /(?:ing|ed|en|wn)$/.test(next.lower) && !SUFFIX_NOMINAL.test(next.lower);
      list.push({
        from: s.from,
        to: s.to,
        opener: spoken(topicPosition(s)),
        verb: weak && !auxiliary ? verb.word : null,
        words: toks.length,
      });
    }
    if (list.length) out.push({ from: b.from, to: b.to, heading, sentences: list });
  }
  return out;
}
