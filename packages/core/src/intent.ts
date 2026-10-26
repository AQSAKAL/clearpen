// What a typed instruction over a selection is really asking for: a check, an
// answer, or an edit. Order matters: "is the logic consistent?" is about
// consistency, "does this hold up?" about logic.

export type Lens = 'factcheck' | 'logic' | 'consistency';
export type Intent = Lens | 'ask';

const INTENTS: [Lens, RegExp][] = [
  ['consistency', /\bconsisten|\bcontradict|\bmatch(?:es)? the rest\b/i],
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
