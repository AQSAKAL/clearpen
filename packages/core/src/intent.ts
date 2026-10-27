// What a typed instruction over a selection is really asking for: a check, an
// answer, or an edit. Order matters: "is the logic consistent?" is about
// consistency, "does this hold up?" about logic.

export type Lens = 'factcheck' | 'logic' | 'consistency' | 'clarity';
export type Intent = Lens | 'ask';

const INTENTS: [Lens, RegExp][] = [
  ['consistency', /\bconsisten|\bcontradict|\bmatch(?:es)? the rest\b/i],
  // "is this clear?", "check the flow", "how does it read?" — a verdict on how it reads, not a rewrite ("make it clearer" is an edit).
  [
    'clarity',
    /\b(?:check|test|assess|review|judge|rate|how is|how(?:'|’)s|is (?:this|it|that)|does (?:this|it|that))\b[^.?]*\b(?:clarity|clear|readab\w*|flow|easy to (?:read|follow)|hard to (?:read|follow)|confusing|read (?:well|ok|okay|smoothly|easily))\b|\b(?:clarity|readability|flow) check\b|\bhow (?:does|will|would) (?:this|it|that) read\b/i,
  ],
  [
    'logic',
    /\b(?:check|test|critique|assess|evaluate|review|stress-test)\b[^.?]*\b(?:logic|reasoning|argument)\b|\b(?:logic|reasoning|argument)\b[^.?]*\b(?:sound|valid|hold up|flawed|weak)\b|\bdoes (?:this|it|that) (?:make sense|follow|hold up|add up)\b|\bfallac|\blogical(?:ly)?\b|\bholes? in\b/i,
  ],
  [
    'factcheck',
    /\bfact[- ]?check|\bverify\b|\bis (?:this|it|that|any of this|all of this|everything) (?:true|right|correct|accurate|factual|real|legit)\b|\bcheck (?:the |if |whether |for |that )?(?:it(?:'|’)?s? )?(?:facts?|claims?|accuracy|accurate|figures|numbers|stats?|statistics|sources?|true|right|correct|maths?)\b|\bfactual(?:ly)?\b|\bany (?:factual )?(?:errors|mistakes|inaccuracies)\b|\bis (?:this|it|that) (?:wrong|false)\b/i,
  ],
];
const QUESTION =
  /\?\s*$|^(?:what|why|how|who|when|where|which|is|are|does|do|did|should|explain|what(?:'|’)s|tell me)\b/i;
const POLITE_REWRITE =
  /^(?:can|could|would|will) you (?:please )?(?:make|rewrite|turn|change|fix|shorten|expand|simplify|improve|add|remove|cut|rephrase|translate|convert|format|tighten|reword)\b/i;

/** A check, a question to answer, or null for an edit instruction. */
export function intentOf(instruction: string): Intent | null {
  const s = instruction.trim();
  for (const [lens, re] of INTENTS) if (re.test(s)) return lens;
  if (QUESTION.test(s) && !POLITE_REWRITE.test(s)) return 'ask';
  return null;
}

// ─────────────────────────────────────────────────────────── edit, don't write

// Clearpen edits what the author wrote; it never writes new material from
// scratch. A prompt alone doesn't hold a small model to that, so the line is
// drawn in code: once on the request, once on what comes back.
const STRUCTURE =
  /\b(?:sub)?head(?:ing|er)s?\b|\btitles?\b|\blists?\b|\bbullets?\b|\btables?\b|\blinks?\b|\bbold\b|\bitalic|\bformat|\bpunctuat|\bspelling\b|\bgrammar\b/i;
const FROM_SCRATCH =
  /\b(?:write|draft|compose|generate|create|produce|add|insert|give me|come up with)\b[^.?!]{0,40}?\b(?:paragraphs?|sections?|intro(?:duction)?s?|conclusions?|endings?|openings?|examples?|stor(?:y|ies)|anecdotes?|sentences?|more(?: text| content| words)?|articles?|posts?|essays?|chapters?|bio)\b|\b(?:continue(?: writing)?|keep (?:going|writing)|finish (?:it|this|the (?:article|post|section|paragraph))|flesh (?:it |this )?out|elaborate(?: on)?|expand (?:on |it|this))\b/i;

/** True when an instruction asks for new material rather than an edit. */
export function asksToWrite(instruction: string): boolean {
  const s = String(instruction);
  return FROM_SCRATCH.test(s) && !STRUCTURE.test(s);
}

const wordsOf = (s: string): string[] =>
  String(s)
    .toLowerCase()
    .match(/[\p{L}\p{N}’']+/gu) || [];

/** How many words a change brings in that the passage doesn't already have. Headings don't count — they're structure. */
export function newWords(passage: string, insert: string): number {
  const known = new Set(wordsOf(passage));
  const body = String(insert)
    .split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l))
    .join('\n');
  return wordsOf(body).filter((w) => !known.has(w)).length;
}

// An edit trims; it doesn't throw the passage away. Small models answer "cut
// the filler" by deleting the whole paragraph, so a change that removes most
// of the passage is dropped — unless the writer asked to delete it.
const DELETE_IT =
  /\b(?:delete|remove|drop|cut|lose|get rid of|scrap)\b[^.?!]{0,30}?\b(?:it|this|that|all|everything|whole|entire|paragraphs?|sections?|passage|sentences?|lines?|bullets?|points?)\b/i;

/** True when the instruction asks to delete the passage, or part of it, outright. */
export function asksToDelete(instruction: string): boolean {
  return DELETE_IT.test(String(instruction));
}

/** True when replacing `removed` with `insert` throws away most of `passage` instead of trimming it. */
export function removesTooMuch(passage: string, removed: string, insert: string): boolean {
  const total = wordsOf(passage).length;
  const gone = wordsOf(removed).length;
  return total >= 8 && gone >= total * 0.6 && wordsOf(insert).length < gone * 0.3;
}

/** True when replacing `removed` (within `passage`) with `insert` writes new material instead of editing. */
export function writesNewMaterial(passage: string, removed: string, insert: string): boolean {
  const fresh = newWords(passage, insert);
  if (!String(removed).trim()) return fresh > 6; // a pure insertion of prose
  return fresh > 10 + 0.6 * wordsOf(removed).length;
}
