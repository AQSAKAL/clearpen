// Signposts for the reader who skims — checks drawn from two writers on how a
// paper is actually read, run by code with no model involved, in the technical
// and scientific genres only:
//
// - Halevi, "Writing Clear Conference Submissions" (2006): the reviewer has a
//   few hours, reads parts out of order and does not remember earlier ones.
//   "Keep the reader informed about what's happening now and what's coming
//   next"; every part says what it does; "put many forward and backward
//   pointers in the paper"; and don't tell the reader "how hard you had to
//   work" — "most readers are not interested in how many versions of the
//   definition or construction you went through".
// - Pak, "How to write a clear math paper" (2018): readers read titles, maybe
//   abstracts, maybe the introduction, and skip to the main result. The
//   introduction closes by outlining the structure "in your own words", since
//   "this helps the reader to navigate".
//
// Four notes, each phrased as what a reader does at that passage: a section of
// three paragraphs or more whose first sentence says neither what it does nor
// what it finds (section-opening); a pointer with nowhere to point — "as
// discussed above", "see below" — in a sentence that names no section, figure
// or theorem (vague-pointer); an introduction to four or more sections that
// gives no map of them (no-map); and, in a paper, a line about how hard the
// problem was (hardship). Each kind is capped so a long draft gets a sample,
// not a flood. None of them is a rule; each is dismissed with a click.

import { type Block, blocks, type Sentence, sentences } from './analysis.ts';
import type { Finding, Genre } from './checks.ts';
import { stem } from './style.ts';

// ─────────────────────────────────────────────────────────── parts

interface Paragraph extends Block {
  S: Sentence[];
}

/** A stretch of the draft under one heading — or before the first. */
interface Part {
  /** The heading as written, without its marks; '' before the first heading. */
  title: string;
  /** The heading's level; 0 before the first heading. */
  level: number;
  from: number;
  to: number;
  /** Every block with a sentence in it, list items included. */
  P: Paragraph[];
}

const headingText = (line: string) =>
  line
    .replace(/^#+\s*/, '')
    .replace(/\s+#+\s*$/, '')
    .replace(/[*_`]/g, '')
    .trim();

/** The draft split at its headings; only parts with prose are kept. */
function parts(text: string, S: Sentence[]): Part[] {
  const out: Part[] = [];
  let cur: Part = { title: '', level: 0, from: 0, to: text.length, P: [] };
  let i = 0;
  for (const b of blocks(text)) {
    if (b.heading) {
      cur.to = b.from;
      out.push(cur);
      cur = { title: headingText(text.slice(b.from, b.to)), level: b.level ?? 1, from: b.from, to: text.length, P: [] };
      continue;
    }
    const list: Sentence[] = [];
    while (i < S.length && S[i]!.from < b.to) {
      if (S[i]!.from >= b.from) list.push(S[i]!);
      i++;
    }
    if (list.length) cur.P.push({ ...b, S: list });
  }
  out.push(cur);
  return out.filter((p) => p.P.length);
}

/** The introduction: the part headed "Introduction", else the first part with prose that is not an abstract. */
function introOf(P: Part[]): Part | undefined {
  return (
    P.find((p) => /^(?:\d+[.)]?\s*)?introduction\b/i.test(p.title)) ??
    P.find((p) => !/^(?:\d+[.)]?\s*)?(?:abstract|summary)\b/i.test(p.title)) ??
    P[0]
  );
}

/** The level of the draft's sections: the shallowest heading level with two or more headings. */
function sectionLevel(P: Part[]): number {
  for (let l = 1; l <= 6; l++) if (P.filter((p) => p.level === l).length >= 2) return l;
  return 6;
}

// ─────────────────────────────────────────────────────────── words

const WORD = /[\p{L}\p{N}’']+/gu;
const words = (s: string) => [...s.matchAll(WORD)].map((m) => m[0].replace(/^[’']+|[’']+$/g, '')).filter(Boolean);

// Words that name nothing on their own, so they never match a heading.
const SMALL = new Set(
  'the and for with from this that what when where which while about into over under your their these those more less most some other than then onto upon also just like very each every both such only'.split(
    ' ',
  ),
);
/** What a stretch of text names: the stems of its longer content words. */
const keys = (s: string) =>
  new Set(
    words(s)
      .map((w) => w.toLowerCase())
      .filter((w) => w.length > 3 && !SMALL.has(w))
      .map(stem),
  );
const shares = (a: Set<string>, b: Set<string>) => [...a].some((x) => b.has(x));

/**
 * Inside a quotation: an odd number of straight quotes, or an unclosed curly
 * one, between the paragraph's start and `at`. Counted over the paragraph, not
 * the sentence, since a sentence can break inside a quote ("wait… I know").
 */
const inQuotes = (text: string, from: number, at: number) => {
  const before = text.slice(from, at).replace(/`[^`\n]*`/g, '');
  const straight = (before.match(/"/g) ?? []).length;
  const curly = (before.match(/“/g) ?? []).length - (before.match(/”/g) ?? []).length;
  return straight % 2 === 1 || curly > 0;
};

const q = (s: string) => `“${s}”`;
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Keeps the capital when a replacement starts a sentence. */
const matchCase = (original: string, replacement: string) =>
  /^\p{Lu}/u.test(original) && /^\p{Ll}/u.test(replacement) ? cap(replacement) : replacement;

// ─────────────────────────────────────────────────────────── section openings (Halevi)

// A first sentence that says what the section does: "This section shows…",
// "We now turn to…", "Here we compare…".
const ORIENTS =
  /\b(?:this (?:section|subsection|part|chapter|appendix)\b|(?:in )?what follows\b|the (?:rest|remainder) of this\b|here,? (?:we|i)\b|(?:below|next|now|first),? (?:we|i)\b|(?:we|i) (?:now|next|first|then|begin|start|turn|return|proceed|are now|am now)\b|(?:we|i) (?:(?:will|shall|can|also|briefly|then) )?(?:show|prove|describe|compare|define|derive|give|present|explain|introduce|establish|state|argue|discuss|examine|analy[sz]e|measure|test|evaluate|outline|list|review|summari[sz]e|extend|generali[sz]e|apply|construct|build|propose|report|sketch|recall|formali[sz]e|motivate|illustrate|address|answer|ask|consider|look at|turn to|return to|focus on|walk through|set up|cover|work through|check|verify)(?:s|es|ed|d|n|ing)?\b|(?:our|the) (?:goal|aim|purpose|task|plan|question) (?:here|now|of this|in this)\b|let (?:us|’s|'s)\b|the (?:proof|argument|construction|analysis|derivation|idea) (?:proceeds|has|is in|runs|goes|splits|falls|is as follows)\b|as follows\b|in (?:two|three|four|five|six|\d+) (?:steps|parts|stages)\b)/i;

// A first sentence that states something: a number, a comparison, a negation,
// a reason, a result verb. The reader learns the section's point from it.
const CLAIMS =
  /\d|\b(?:two|three|four|five|six|seven|eight|nine|ten|twice|half|most|every|all|none|no|not|never|cannot|can’t|can't|than|more|less|fewer|faster|slower|better|worse|larger|smaller|higher|lower|because|therefore|so that|hence|thus|should|must|shows?|showed|shown|proves?|proved|finds?|found|demonstrates?|demonstrated|concludes?|concluded|reduces?|reduced|improves?|improved|increases?|increased|decreases?|decreased|outperforms?|outperformed|fails?|failed|works?|worked|holds?|held|follows?|followed|implies|imply|implied|yields?|yielded|causes?|caused|leads?|led|requires?|required|needs?|needed|costs?|saves?|saved|beats?|beat|breaks?|broke|wins?|won|loses?|lost|matters|depends?|means|is the|are the|result|results|answer|best|worst|wrong|right|only|always)\b/i;

// A section that opens inside the formalism: "Let G = (V, E)…", "Theorem 2."
const FORMAL =
  /^\s*(?:\*\*|__|_|\*)?(?:let|define|denote|suppose|assume|theorem|lemma|definition|proposition|corollary|proof|notation|claim)\b/i;

// Headings that say by convention what the section is for.
const CONVENTIONAL =
  /^(?:\d+[.)]?\s*)?(?:abstract|introduction|background|conclusions?|summary|acknowledge?ments|references|bibliography|appendix|appendices|further reading|notes|contents|table of contents)\b/i;

/** A named thing in the sentence — a capitalised word after the first, or code. */
const named = (s: Sentence) =>
  /`[^`\n]+`/.test(s.text) ||
  words(s.masked)
    .slice(1)
    .some((w) => w.length >= 2 && /^\p{Lu}/u.test(w) && !/^I(?:[’']|$)/.test(w));

function checkOpenings(P: Part[], intro: Part | undefined, out: Finding[]): void {
  for (const p of P) {
    // The introduction, anything before it (an abstract) and the conventional sections are not checked.
    if (!p.level || p === intro || (intro && p.from < intro.from) || CONVENTIONAL.test(p.title)) continue;
    if (p.P.filter((x) => !x.list).length < 3) continue;
    // A run-in label — "**A.**", "**Data migration.**" — is not the sentence to judge; take the one after it.
    const first = p.P[0]!.S;
    const s = words(first[0]!.masked).length < 4 && first[1] ? first[1] : first[0]!;
    const t = s.masked;
    const formal = FORMAL.test(t);
    if (!formal) {
      if (/[?:]["”’')\]]*\s*$/.test(t) || ORIENTS.test(t)) continue;
      if (CLAIMS.test(t) || named(s)) continue;
    }
    const opener = q(clip(s.text.replace(/\s+/g, ' ')));
    out.push({
      from: s.from,
      to: s.to,
      kind: 'section-opening',
      category: 'structure',
      title: 'What is this section for?',
      message: formal
        ? `This section opens inside the details (${opener}). A reader who skims reads the heading and the first sentence, and has to read on to learn what the section does and what it is for. Say that first, in one sentence.`
        : `A reader who skims reads the heading and this first sentence (${opener}), and neither says what the section does or what it finds; they have to read the section to learn what it is for. One sentence up front — what it shows, and what that is for — lets them decide whether to.`,
    });
  }
}

// ─────────────────────────────────────────────────────────── vague pointers (Halevi)

interface Pointer {
  re: RegExp;
  /** The phrase with the place named, or null when only the author can rewrite it. */
  fix: ((m: RegExpMatchArray, place: string) => string) | null;
}

const BACK = 'above|earlier|previously';
const FORWARD = 'below|later';
const SAID =
  '(?:discussed|mentioned|noted|described|shown|seen|saw|explained|outlined|stated|argued|defined|introduced|observed|said|showed|demonstrated|presented|given|detailed|covered|addressed|established|proved|proven|sketched)';
/** The match with its direction word swapped for the place. */
const inPlace = (m: RegExpMatchArray, place: string) => `${m[0].slice(0, -m[1]!.length)}in ${place}`;

const POINTERS: Pointer[] = [
  // "as discussed above", "as we saw earlier", "as shown below"
  {
    re: new RegExp(
      `\\bas (?:(?:we|i) )?(?:(?:was|is|were|already|briefly|just|will be) )?${SAID} (${BACK}|before|${FORWARD})\\b`,
      'gi',
    ),
    fix: inPlace,
  },
  // "see above", "see below"
  { re: new RegExp(`\\b(?:see|cf\\.?) (${BACK}|${FORWARD})\\b`, 'gi'), fix: (_m, place) => `see ${place}` },
  // "the method described above", "the bound given below"
  { re: new RegExp(`\\b${SAID} (${BACK}|${FORWARD})\\b`, 'gi'), fix: inPlace },
  // "the previously defined term"
  { re: new RegExp(`\\b(${BACK}) ${SAID}\\b`, 'gi'), fix: null },
  // "more on this below"
  {
    re: new RegExp(`\\b(?:more|further|details?) (?:on (?:this|that|these|it) )?(${BACK}|${FORWARD})\\b`, 'gi'),
    fix: inPlace,
  },
  // "we return to this later"
  {
    re: new RegExp(
      `\\b(?:we|i) (?:will |shall |’ll |'ll )?(?:return|come back|get|turn) to (?:this|that|it|these|them) (${BACK}|${FORWARD})\\b`,
      'gi',
    ),
    fix: inPlace,
  },
  // "Later, we show…", "Previously we defined…"
  {
    re: new RegExp(`(?<!\\p{L})(${BACK}|${FORWARD})(,?) (we|i)\\b`, 'giu'),
    fix: (m, place) => `in ${place}${m[2]}${' '}${m[3]}`,
  },
  // "the above discussion", "the earlier section"
  {
    re: /\bthe (above|preceding|foregoing|earlier) (discussion|section|subsection|argument|analysis|results?|examples?|definition|remarks?|points?|lemma|theorem|proof|construction|observation|paragraphs?|table|figure|list|steps?)\b/gi,
    fix: (m, place) => (/^(?:sub)?section$/i.test(m[2]!) ? `the section ${place}` : `the ${m[2]} in ${place}`),
  },
];

const BACKWARD = /^(?:above|earlier|previously|before|preceding|foregoing)$/i;

// The sentence names its place: "Section 2", "Figure 3", "Theorem 1", "§4", an internal link.
const NAMED_PLACE =
  /\b(?:sections?|sec\.|chapters?|figures?|figs?\.|tables?|theorems?|lemmas?|propositions?|corollar(?:y|ies)|definitions?|equations?|eqs?\.|appendi(?:x|ces)|algorithms?|listings?|steps?|parts?|examples?|remarks?|notes?|footnotes?|pages?|p\.|pp\.|lines?)\s*\(?(?:\d|[A-Z]\b|[IVX]+\b)|§\s*\d|\(\d+(?:\.\d+)*\)|\bin (?:the )?(?:section|chapter|part|appendix) (?:on|about|called|titled|named|headed)\b|\b(?:in|under|see) (?:the (?:heading|section) )?[“"]/i;

// The thing pointed at sits right here: a code block, table, image or list next to this paragraph.
const LOCAL = /^\s*(?:```|~~~|\||!\[|[-*+]\s|\d+[.)]\s|\$\$|<)/;
const lineAfter = (text: string, pos: number) => text.slice(pos).match(/\S[^\n]*/)?.[0] ?? '';
const lineBefore = (text: string, pos: number) => {
  const before = text.slice(0, pos).trimEnd();
  return before.slice(before.lastIndexOf('\n') + 1);
};

function checkPointers(text: string, P: Part[], out: Finding[]): void {
  for (const here of P) {
    for (const p of here.P) {
      for (const s of p.S) {
        const t = s.masked;
        if (NAMED_PLACE.test(t) || /\]\(#/.test(s.text)) continue;
        // Every pointer in the sentence; where two patterns catch the same words, the longer match stands.
        const found: { m: RegExpExecArray; fix: Pointer['fix'] }[] = [];
        for (const { re, fix } of POINTERS) {
          re.lastIndex = 0;
          for (const m of t.matchAll(re)) found.push({ m, fix });
        }
        found.sort((a, b) => a.m.index - b.m.index || b.m[0].length - a.m[0].length);
        let end = -1;
        for (const { m, fix } of found) {
          if (m.index < end) continue;
          end = m.index + m[0].length;
          // A quoted "as discussed above" is someone's words, not a pointer.
          if (inQuotes(text, p.from, s.from + m.index)) continue;
          const back = BACKWARD.test(m[1]!);
          // "shown below:" with the table on the next line points at something the reader can see.
          if (!back && (/:\s*$/.test(t) || LOCAL.test(lineAfter(text, p.to)))) continue;
          if (back && LOCAL.test(lineBefore(text, p.from))) continue;
          const others = P.filter((x) => x !== here && (back ? x.from < here.from : x.from > here.from));
          const phrase = s.text.slice(m.index, end);
          const f: Finding = {
            from: s.from + m.index,
            to: s.from + end,
            kind: 'vague-pointer',
            category: 'clarity',
            title: 'Points somewhere, but where?',
            message: `${q(phrase)} sends the reader off without saying where. One who skipped that part, or came in from elsewhere, has nothing to search for. Name the place — the section, figure, table or theorem.`,
          };
          if (others.length && others.length <= 4)
            f.message += ` The sections ${back ? 'before' : 'after'} this one: ${others
              .map((x) => (x.title ? q(x.title) : 'the opening'))
              .join(', ')}.`;
          // One section in that direction, and it has a name: the author can take it with a click.
          if (fix && others.length === 1 && others[0]!.title)
            f.suggestion = matchCase(phrase, fix(m, q(others[0]!.title)));
          out.push(f);
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────── the map (Pak, Halevi)

// A pointer forward in the introduction: "Section 2", "we first… then…", "the
// rest of this paper", "below we", "as follows:".
const MAP =
  /\b(?:(?:sections?|sec\.|chapters?|parts?|appendix|appendices)\s*\(?\d|§\s*\d|the (?:rest|remainder) of (?:this|the) (?:paper|article|post|piece|document|report|note|chapter|guide|essay|text|thesis|tutorial)|in what follows|in the (?:following|next|remaining) (?:sections?|parts?|chapters?|pages?)|in the sections? (?:that follow|below)|(?:later|below) in this (?:paper|article|post|piece|document|report|note|guide|chapter|tutorial)|(?:this|the) (?:paper|article|post|piece|document|report|note|guide|chapter|tutorial) (?:is (?:organi[sz]ed|structured|arranged|laid out)|proceeds|has (?:\w+ )?parts|falls into|consists of|covers|walks through|is in (?:two|three|four|five|six|\d+) parts)|(?:below|next),? (?:we|i)\b|(?:we|i) (?:\w+ ){0,4}?below\b|(?:discussed|described|explained|detailed|covered|addressed|shown|given|listed|outlined|presented|set out|laid out|referred to|returned to|taken up|treated|examined|considered|dealt with) (?:below|later|in turn|next)\b|(?:we|i) (?:first|begin by|start by|begin with|start with|then|next|finally|close by|end by|conclude by|conclude with|end with|proceed as follows)\b|the (?:following|next) (?:two|three|four|five|six|\d+) (?:sections|parts)|(?:outline|overview|structure|plan|organi[sz]ation) of (?:this|the) (?:paper|article|post|piece|document|report|guide)|road ?map|as follows:)/i;

function checkMap(P: Part[], intro: Part | undefined, out: Finding[]): void {
  if (!intro) return;
  const level = sectionLevel(P);
  const sections = P.filter((p) => p.level <= level);
  if (sections.length < 4) return;
  const after = sections.filter((p) => p.from > intro.from);
  if (after.length < 2) return;
  // The sections named by their heading words: a sentence or a list that names two of them is a map.
  const headings = P.filter((p) => p.from > intro.from && p.title).map((p) => keys(p.title));
  const namedIn = (s: string) => headings.map((k, i) => (shares(keys(s), k) ? i : -1)).filter((i) => i !== -1);
  const listed = new Set<number>();
  for (const p of intro.P) {
    for (const s of p.S) {
      if (MAP.test(s.masked)) return;
      const n = namedIn(s.masked);
      if (p.list) for (const i of n) listed.add(i);
      else if (n.length >= 2) return;
    }
  }
  if (listed.size >= 2) return;
  const last = intro.P.at(-1)!.S.at(-1)!;
  out.push({
    from: last.from,
    to: last.to,
    kind: 'no-map',
    category: 'structure',
    title: 'No map of what follows',
    message: `${after.length} sections follow this one, and nothing here says what they are or in what order. A reader who skims uses the opening to decide where to jump; without a map they read the headings and guess. One sentence naming the parts — or a short list of them — is enough.`,
  });
}

// ─────────────────────────────────────────────────────────── how hard it was (Halevi)

const HARDSHIP =
  /\b(?:after (?:many|several|numerous|countless|repeated|multiple) (?:failed |unsuccessful )?(?:attempts|tries|iterations|false starts)|after (?:much|considerable|a great deal of|a lot of|months of|years of|weeks of) (?:effort|work|trial and error|experimentation|struggle)|(?:surprisingly|unexpectedly|extremely|remarkably|notoriously) (?:difficult|hard|tricky|challenging|subtle)|(?:we|i) struggled|took us (?:\w+ )?(?:months|years|weeks|days|a long time|a while)|(?:it|this|which|that) took us\b|turned out to be (?:(?:much|far|surprisingly|very|quite|rather) )?(?:harder|hard|difficult|challenging|tricky|non-?trivial|subtle)|(?:highly|deeply|by no means) (?:non-?trivial|obvious|straightforward)|far from (?:obvious|easy|simple|straightforward|trivial)|(?:we|i) tried (?:several|many|numerous|various|a number of|dozens of)|(?:considerable|significant|substantial|enormous|great) (?:effort|work|difficulty) (?:was|went into|went in)|(?:through|by) trial and error|painstaking|laborious|arduous|gruel+ing|no small (?:feat|task)|(?:it|this|the (?:problem|proof|task|analysis|construction)) (?:was|is|proved|turned out) (?:not|far from|anything but) (?:easy|simple|straightforward|trivial|obvious)|(?:many|several|numerous) (?:versions|drafts|iterations|rewrites|attempts) (?:before|later|were needed)|(?:first|initial|early) attempts? (?:failed|did not work|fell short))\b/gi;

function checkHardship(text: string, P: Part[], out: Finding[]): void {
  for (const part of P) {
    for (const p of part.P) {
      for (const s of p.S) {
        HARDSHIP.lastIndex = 0;
        for (const m of s.masked.matchAll(HARDSHIP)) {
          // Quoted, it is someone else's confession.
          if (inQuotes(text, p.from, s.from + m.index)) continue;
          const phrase = s.text.slice(m.index, m.index + m[0].length);
          out.push({
            from: s.from + m.index,
            to: s.from + m.index + m[0].length,
            kind: 'hardship',
            category: 'tone',
            title: 'Effort, not result',
            message: `${q(phrase)} tells the reader how hard this was for you. A reader wants the result and why it holds; how many attempts it took is yours to remember, not theirs to read. Cut it, or say what the difficulty revealed.`,
          });
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────── entry point

/** Caps per kind for one draft, so a long piece gets a sample, not a flood. */
const CAPS: Record<string, number> = {
  'section-opening': 3,
  'vague-pointer': 3,
  'no-map': 1,
  hardship: 3,
};

/**
 * Findings for the reader who skims — section openings, pointers with nowhere
 * to point, a missing map, effort-talk — in the technical and scientific
 * genres; nothing for the others. `S` is the draft's sentences, shared with
 * the other checks.
 */
export function signpostFindings(text: string, genre: Genre, S: Sentence[] = sentences(text)): Finding[] {
  if (genre !== 'technical' && genre !== 'scientific') return [];
  const P = parts(text, S);
  const intro = introOf(P);
  const out: Finding[] = [];
  checkOpenings(P, intro, out);
  checkPointers(text, P, out);
  checkMap(P, intro, out);
  if (genre === 'scientific') checkHardship(text, P, out);
  const counts = new Map<string, number>();
  return out
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .filter((f) => {
      const n = (counts.get(f.kind) ?? 0) + 1;
      counts.set(f.kind, n);
      return n <= (CAPS[f.kind] ?? Number.POSITIVE_INFINITY);
    });
}
