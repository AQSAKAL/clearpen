// Every prompt Margin sends, in one place.
//
// Rules of thumb that held up in testing with 8–12B local models:
// - Say exactly what to output and nothing else ("ONLY the rewritten passage").
// - Put the stable material (system prompt, article start) first so the model
//   server can reuse its prompt cache; put the volatile bit last.
// - Ask for structure with a JSON schema rather than prose instructions.
// - One focused job per prompt: small models do one job well and five badly.

import type { Lens } from './intent.ts';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A JSON Schema, passed to the model server to constrain its output. */
export type JsonSchema = Record<string, unknown>;

/** What the writer has told Margin about the article. */
export interface Brief {
  topic?: string;
  audience?: string;
  angle?: string;
  tone?: string;
  length?: string;
  /** The writer's research notes and sources — the only facts the AI may add. */
  notes?: string;
  genre?: string;
}

export interface OutlineSection {
  heading: string;
  points: string[];
}

export interface Outline {
  title: string;
  sections: OutlineSection[];
}

/** The last `n` characters — for text before the cursor, the end is what matters. */
const clip = (s: string, n: number) => (s.length > n ? s.slice(s.length - n) : s);
const head = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

export function briefBlock(brief: Brief = {}): string {
  const lines: string[] = [];
  if (brief.topic) lines.push(`Topic: ${brief.topic}`);
  if (brief.audience) lines.push(`Audience: ${brief.audience}`);
  if (brief.angle) lines.push(`Angle / key message: ${brief.angle}`);
  if (brief.tone) lines.push(`Tone: ${brief.tone}`);
  if (brief.length) lines.push(`Target length: about ${brief.length} words`);
  if (brief.notes) lines.push(`Author's notes and sources:\n${head(brief.notes, 4000)}`);
  return lines.join('\n');
}

const withBrief = (brief: Brief | undefined, before: string, after: string) =>
  brief && briefBlock(brief) ? `${before}${briefBlock(brief)}${after}` : '';

// ─────────────────────────────────────────────────────────── autocomplete

const COMPLETE_SYSTEM = `You are an autocomplete engine inside a writing app. Continue the author's text from exactly where the cursor is, in the same voice, tense and style. Output ONLY the words that come next — never repeat text that is already there, never add commentary, quotation marks around your answer, or code fences. Finish the current sentence, or write at most one more short sentence.`;

export function completeMessages({
  title = '',
  before = '',
  after = '',
}: {
  title?: string;
  before?: string;
  after?: string;
}): ChatMessage[] {
  return [
    { role: 'system', content: COMPLETE_SYSTEM },
    {
      role: 'user',
      content: `Article title: ${title || '(untitled)'}

<text_before_cursor>
${clip(before, 6000)}
</text_before_cursor>
<text_after_cursor>
${head(after, 600)}
</text_after_cursor>

Continue from the cursor.`,
    },
  ];
}

// ─────────────────────────────────────────────────────────── rewrite

/** The built-in actions on a selection; each is rewritten, then split into pinpoint changes. */
export const REWRITES = {
  improve: 'Improve this passage: make it clearer, tighter and more vivid without changing its meaning or voice.',
  shorten: 'Make it about 40% shorter. Keep every key point.',
  simplify: 'Rewrite it in plain, simple language anyone could follow. Short sentences, everyday words.',
  grammar: 'Fix spelling, grammar and punctuation only. Change nothing else.',
  formal: 'Rewrite it in a more formal, professional tone.',
  casual: 'Rewrite it in a warmer, more conversational tone.',
  confident: 'Rewrite it to sound more confident and direct: cut hedges and qualifiers.',
  persuasive: 'Rewrite it to be more persuasive, with a stronger case and a clearer call to the reader.',
  hook: 'Rewrite it as a gripping opening that makes the reader need to keep reading.',
  active: 'Rewrite it in the active voice, with strong verbs.',
} as const;

export type RewriteAction = keyof typeof REWRITES;

const EDIT_SYSTEM = `You are an expert editor working inside a writing app. You rewrite a passage exactly as instructed. Keep the author's meaning, facts, voice and Markdown formatting unless the instruction says otherwise. Unless the instruction is only to fix grammar, also cut clichés ("in today's fast-paced world", "at the end of the day"), filler ("very", "basically", "really") and hedges, and prefer concrete words to abstract ones. Never invent facts, quotes, names or statistics. Output ONLY the rewritten passage — no preamble, no quotation marks around it, no explanation.`;

interface PassageInput {
  title?: string;
  text: string;
  instruction: string;
  before?: string;
  after?: string;
}

export function rewriteMessages({
  title = '',
  text,
  instruction,
  before = '',
  after = '',
}: PassageInput): ChatMessage[] {
  return [
    { role: 'system', content: EDIT_SYSTEM },
    {
      role: 'user',
      content: `Article title: ${title || '(untitled)'}

Context before the passage:
"""${clip(before, 1500)}"""

Context after the passage:
"""${head(after, 600)}"""

Passage to rewrite:
"""${text}"""

Instruction: ${instruction}`,
    },
  ];
}

// For free instructions: the model returns pinpoint edits, never the passage
// again. "Add subheadings" becomes three inserts; nothing else is touched.
const EDITS_SYSTEM = `You are a precise editor working inside a writing app. You carry out the author's instruction by making the smallest set of edits that does it — like marking up a page with a pencil. Never retype text you are not changing; never "improve" anything the instruction didn't ask about. Keep the author's facts, numbers, names, links and Markdown. Never invent facts, quotes, names or statistics. You answer only with JSON.`;

export function editsMessages({ title = '', text, instruction, before = '', after = '' }: PassageInput): ChatMessage[] {
  return [
    { role: 'system', content: EDITS_SYSTEM },
    {
      role: 'user',
      content: `Article title: ${title || '(untitled)'}

Context before the passage:
"""${clip(before, 1500)}"""

Context after the passage:
"""${head(after, 600)}"""

Passage:
"""${text}"""

Instruction: ${instruction}

Return JSON {"edits": [...]} — only the edits the instruction needs, in the order they appear. Each edit has:
- "type": "insert_before", "insert_after", "replace" or "delete";
- "anchor": the exact words from the passage, copied character for character — for "replace" and "delete", exactly the words to change (as few as possible); for "insert_before" and "insert_after", the first or last sentence of the paragraph or line the new text goes next to;
- "text": the new text in Markdown ("" for "delete"). A heading, list or new paragraph is its own block, e.g. "## A catchy heading". Put a heading with "insert_before" on the first sentence of the paragraph it introduces.
If the instruction really needs the whole passage rewritten, use one "replace" whose anchor is the whole passage.`,
    },
  ];
}

export const editsSchema: JsonSchema = {
  type: 'object',
  properties: {
    edits: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: ['insert_before', 'insert_after', 'replace', 'delete'] },
          anchor: { type: 'string' },
          text: { type: 'string' },
        },
        required: ['type', 'anchor', 'text'],
      },
    },
  },
  required: ['edits'],
};

// ─────────────────────────────────────────────────────────── thinking aids

// Margin never writes the author's prose. It helps them think: the point a
// section must make, the steps of the argument, the evidence to find, the
// objection to answer, the questions only they can answer. Notes, not prose.
const COACH_SYSTEM = `You are a writing coach and a sharp editor. You NEVER write the author's prose: no paragraphs, no ready-to-use sentences, no openings, endings, examples or transitions written out. Writing is the author's job; yours is to help them think. You lay out logic and argument as short notes — fragments of at most 15 words, in your voice as a coach, never in the author's voice. Never invent facts, statistics, studies, quotes, people or anecdotes: for evidence, say what kind would support the point and where the author might find it; for examples, point to the kind of experience the author could draw on. You answer only with JSON.`;

/** Each kind of help: what it's for, and the groups of notes to return ([label, how many and what]). */
export const THINK_KINDS = {
  shape: {
    task: 'Lay out the argument of the section under the heading "{heading}", so the author can write it themselves.',
    groups: [
      ['The point', '1 note: the one claim this section must establish'],
      ['Steps of the argument', '3 to 5 notes, in order, each one step of reasoning'],
      ['Evidence to find', '2 to 4 notes: the kind of evidence that would support it, and where to look'],
      ['Strongest objection', '1 or 2 notes'],
      ['Ask yourself', '2 or 3 questions only the author can answer from their own experience'],
    ],
  },
  next: {
    task: 'Say where the argument should go next, from where the text stops.',
    groups: [
      ['Where it goes next', '2 to 4 notes: the next steps of the argument, in order'],
      ['Ask yourself', '2 questions that would help the author write the next part'],
    ],
  },
  opening: {
    task: 'Suggest ways the author could open the article — describe the angle, never write the opening.',
    groups: [
      ['Ways to open', '3 notes, each an angle to open from (e.g. "Open on the moment you…")'],
      ['The promise', '1 note: what the reader should know they will get'],
    ],
  },
  ending: {
    task: 'Suggest how the author could end the article — describe it, never write it.',
    groups: [
      ['What the ending must land', '1 or 2 notes'],
      ['Ways to close', '2 or 3 notes, each an angle'],
      ['Ask yourself', '1 or 2 questions'],
    ],
  },
  examples: {
    task: 'Suggest what kind of example would make the point just before the cursor concrete — never write the example or make one up.',
    groups: [
      ['Examples to look for', "3 to 5 notes: kinds of example from the author's own work or reading"],
      ['Ask yourself', '1 or 2 questions that would surface a real example'],
    ],
  },
  counter: {
    task: 'Find the strongest objections a skeptical reader would raise to the argument so far.',
    groups: [
      ['Strongest objections', '2 notes'],
      ['How you might answer', '2 notes: the reasoning, not the words'],
    ],
  },
  ideas: {
    task: 'Suggest fresh angles the author could cover next.',
    groups: [['Angles to cover', '5 notes, specific and different from what is already written']],
  },
  point: {
    task: 'Check whether the argument so far comes across as the author means it.',
    groups: [
      ['Your point, as a reader hears it', '1 note'],
      ['Where it gets unclear', '1 or 2 notes'],
      ['What it still needs', '1 or 2 notes'],
    ],
  },
  deepen: {
    task: 'For the selected passage, say what a reader would still want to know — never rewrite or extend it.',
    groups: [
      ['A reader would ask', '2 or 3 questions'],
      ['What would make it concrete', '2 notes: the kind of detail, number or example to look for'],
      ['What to cut or check', '0 or 1 note'],
    ],
  },
} as const satisfies Record<string, { task: string; groups: readonly (readonly [string, string])[] }>;

export type ThinkKind = keyof typeof THINK_KINDS;

export interface ThinkInput {
  kind: ThinkKind;
  title?: string;
  brief?: Brief;
  /** The author's text up to the cursor. */
  before?: string;
  after?: string;
  /** The selected passage, for kinds that work on one. */
  passage?: string;
  /** The section heading, for "shape". */
  heading?: string;
  /** The author's own notes for the section. */
  notes?: string[];
  /** The article's section headings. */
  outline?: string[];
}

export function thinkMessages({
  kind,
  title = '',
  brief,
  before = '',
  after = '',
  passage = '',
  heading = '',
  notes = [],
  outline = [],
}: ThinkInput): ChatMessage[] {
  const k = THINK_KINDS[kind];
  const groups = k.groups.map(([label, what]) => `  - "${label}": ${what}`).join('\n');
  return [
    { role: 'system', content: COACH_SYSTEM },
    {
      role: 'user',
      content: `Title: ${title || '(untitled)'}
${withBrief(brief, '\nBrief:\n', '\n')}${outline.length ? `\nThe article's sections: ${outline.map((h) => `"${h}"`).join(', ')}\n` : ''}
The author's text so far:
<<<
${clip(before, 9000) || '(nothing yet)'}
>>>
${passage ? `\nThe selected passage:\n<<<\n${head(passage, 4000)}\n>>>\n` : ''}${notes.length ? `\nThe author's own notes for this section:\n${notes.map((n) => `- ${n}`).join('\n')}\n` : ''}${after.trim() ? `\nWhat comes after:\n<<<\n${head(after, 1500)}\n>>>\n` : ''}
${k.task.replace('{heading}', heading)}

Return JSON {"groups": [{"label": "...", "items": ["...", "..."]}]} with these groups, in this order:
${groups}
Notes, not prose: short fragments the author can think with. Never write sentences the author could paste into the article.`,
    },
  ];
}

export const thinkSchema: JsonSchema = {
  type: 'object',
  properties: {
    groups: {
      type: 'array',
      items: {
        type: 'object',
        properties: { label: { type: 'string' }, items: { type: 'array', items: { type: 'string' } } },
        required: ['label', 'items'],
      },
    },
  },
  required: ['groups'],
};

// ─────────────────────────────────────────────────────────── review

export const NOTE_CATEGORIES = ['clarity', 'concision', 'structure', 'evidence', 'tone', 'grammar', 'style'] as const;
export type NoteCategory = (typeof NOTE_CATEGORIES)[number];

export function reviewMessages({
  title = '',
  content,
  brief,
}: {
  title?: string;
  content: string;
  brief?: Brief;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are a demanding but kind senior editor at a respected magazine. You review drafts and leave precise margin notes. Each note points at an exact passage, says what is wrong in one plain sentence, and — where you can — offers a replacement. Focus on what matters most: unclear sentences, padding and repetition, weak structure, unsupported claims, tone problems, and real errors. Do not nitpick, and never invent problems: a strong draft gets few notes. Never praise inside notes. A suggestion must actually fix the problem you name — if you flag a cliché, your replacement must not contain it.`,
    },
    {
      role: 'user',
      content: `Title: ${title || '(untitled)'}
${withBrief(brief, '\nBrief:\n', '\n')}
<draft>
${head(content, 24000)}
</draft>

Review this draft. Return JSON with:
- "summary": two or three sentences of overall assessment — the draft's biggest strength and the most important thing to fix.
- "notes": up to 10 margin notes (fewer if the draft is strong), in the order they appear in the draft. Each note has:
  - "quote": the exact words from the draft the note is about, copied character for character (one phrase or sentence, 4 to 40 words);
  - "category": one of ${NOTE_CATEGORIES.join(', ')};
  - "issue": what is wrong, in one plain sentence;
  - "suggestion": the replacement text for the quoted words, or "" if the fix needs the author (for example a missing source).`,
    },
  ];
}

export const reviewSchema: JsonSchema = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          quote: { type: 'string' },
          category: { type: 'string', enum: [...NOTE_CATEGORIES] },
          issue: { type: 'string' },
          suggestion: { type: 'string' },
        },
        required: ['quote', 'category', 'issue', 'suggestion'],
      },
    },
  },
  required: ['summary', 'notes'],
};

// ─────────────────────────────────────────────────────────── checking a passage

export interface LensDefinition {
  verdicts: readonly string[];
  /** Verdicts that mean "nothing to fix". */
  ok: readonly string[];
  overall: readonly string[];
  items: string;
  system: string;
}

// A check judges a passage; it never rewrites it. Three lenses, each its own
// focused prompt.
export const CHECK_LENSES: Record<Lens, LensDefinition> = {
  factcheck: {
    verdicts: ['correct', 'incorrect', 'misleading', 'unverifiable', 'opinion'],
    ok: ['correct', 'opinion'],
    overall: ['accurate', 'mostly accurate', 'misleading', 'inaccurate', 'can’t verify'],
    items:
      'every checkable factual claim — what something is, how it works, who did what, numbers, dates, names, attributions',
    system: `You are a meticulous fact-checker at a serious technical and business publication. You check the passage the author selected, claim by claim. You have NO internet access and cannot open links, repositories or papers: judge only from well-established knowledge and from the draft itself. If a claim depends on something you cannot know that way — what a specific repository, product or page contains, a recent event, a private figure — its verdict is "unverifiable", and you say exactly what the author should check and where. Never invent sources, studies, quotes, versions or details. Be exact about how technical terms relate: is one an alternative to the other, a part of it, a kind of it, or an implementation of it? "Instead of X, use Y" is misleading when Y is part of X or works on top of it. A claim that misdescribes how something works, or sets up a false contrast, is "incorrect" or "misleading" even if people often say it that way: explain precisely why, and give a corrected wording that keeps the author's point. Plain opinions are "opinion".`,
  },
  logic: {
    verdicts: ['sound', 'unsupported', 'does not follow', 'fallacy', 'contradiction'],
    ok: ['sound'],
    overall: ['sound', 'weak', 'flawed'],
    items: 'every claim or conclusion that the reasoning depends on',
    system: `You are a sharp, fair critical-thinking editor. You test the reasoning in the passage the author selected: does each conclusion follow from what supports it? Look for unsupported leaps, correlation taken as causation, generalising from one case, circular reasoning, false choices, slippery slopes, appeals to popularity or authority, and claims that contradict the rest of the draft. Judge the argument, not the prose or the facts. Never invent problems: sound reasoning gets the verdict "sound".`,
  },
  consistency: {
    verdicts: ['consistent', 'contradicts the draft', 'contradicts the notes'],
    ok: ['consistent'],
    overall: ['consistent', 'inconsistent'],
    items:
      'every figure, name, date, term, claim or recommendation in the passage that also appears elsewhere in the draft or notes',
    system: `You check whether the passage the author selected agrees with the rest of their draft and their notes: figures, names, dates, terms, claims, recommendations and tone of certainty. Report a conflict only when you can point to the exact words elsewhere that it conflicts with, and quote them in the explanation.`,
  },
};

export function checkMessages({
  title = '',
  text,
  before = '',
  after = '',
  lens = 'factcheck',
  brief,
  facts = '',
}: {
  title?: string;
  text: string;
  before?: string;
  after?: string;
  lens?: Lens;
  brief?: Brief;
  facts?: string;
}): ChatMessage[] {
  const L = CHECK_LENSES[lens];
  const wide = lens === 'consistency';
  return [
    { role: 'system', content: `${L.system} You answer only with JSON.` },
    {
      role: 'user',
      content: `Title: ${title || '(untitled)'}
${brief?.notes ? `\nThe author's notes and sources:\n"""${head(brief.notes, 3000)}"""\n` : ''}
The draft, with the selected passage marked [[PASSAGE]]:
"""${clip(before, wide ? 14000 : 2500)}[[PASSAGE]]${head(after, wide ? 8000 : 1200)}"""
${facts ? `\n${facts}\n` : ''}
The passage to check:
"""${text}"""

Return JSON with:
- "items": ${L.items}, in order. Each has:
  - "quote": the exact words from the passage, copied character for character (a phrase or one sentence);
  - "explanation": first work out what is actually true here, then say it in one or two plain sentences${lens === 'factcheck' ? ' — for something you cannot verify, say what to check and where' : ''};
  - "verdict": one of ${L.verdicts.map((v) => `"${v}"`).join(', ')}, following from your explanation;
  - "fix": replacement text for the quoted words that makes them right, or "" if they are fine or only the author can fix them.
- "overall": one of ${L.overall.map((v) => `"${v}"`).join(', ')};
- "summary": one sentence the author can act on.`,
    },
  ];
}

export function checkSchema(lens: Lens): JsonSchema {
  const L = CHECK_LENSES[lens];
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          // Explanation before verdict: the model reasons, then judges.
          properties: {
            quote: { type: 'string' },
            explanation: { type: 'string' },
            verdict: { type: 'string', enum: [...L.verdicts] },
            fix: { type: 'string' },
          },
          required: ['quote', 'explanation', 'verdict', 'fix'],
        },
      },
      overall: { type: 'string', enum: [...L.overall] },
      summary: { type: 'string' },
    },
    required: ['items', 'overall', 'summary'],
  };
}

/**
 * A second, neutral opinion on a correction the checker wants to make. Asked
 * to "find errors", a small model invents some; asked plainly whether its own
 * correction is true, it usually knows. Unconfirmed corrections are dropped.
 */
export function verifyMessages(statement: string): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You answer factual questions carefully and honestly. Rely only on well-established knowledge. If you are not confident, answer "unsure" — a wrong "true" or "false" is much worse than "unsure". Answer only with JSON.',
    },
    {
      role: 'user',
      content: `Statement: "${statement}"\n\nIs this statement true? Return JSON {"reasoning": "one or two sentences", "answer": "true" | "false" | "unsure"}.`,
    },
  ];
}

export const verifySchema: JsonSchema = {
  type: 'object',
  properties: { reasoning: { type: 'string' }, answer: { type: 'string', enum: ['true', 'false', 'unsure'] } },
  required: ['reasoning', 'answer'],
};

// ─────────────────────────────────────────────────────────── planning

export function headlineMessages({
  title = '',
  content = '',
  brief,
}: {
  title?: string;
  content?: string;
  brief?: Brief;
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are a headline editor. You write honest, specific, compelling headlines — never clickbait that the article cannot deliver. You answer only with JSON.',
    },
    {
      role: 'user',
      content: `${withBrief(brief, 'Brief:\n', '\n\n')}${content.trim() ? `Current title: ${title || '(none)'}\n\nArticle:\n${head(content, 12000)}\n\n` : ''}Write 8 headline options in different styles. Return JSON {"headlines": [{"text": "...", "style": "one of: direct, curiosity, how-to, list, bold claim, question, story, benefit"}]}.`,
    },
  ];
}

export const headlineSchema: JsonSchema = {
  type: 'object',
  properties: {
    headlines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { text: { type: 'string' }, style: { type: 'string' } },
        required: ['text', 'style'],
      },
    },
  },
  required: ['headlines'],
};

export function outlineMessages({ title = '', brief = {} }: { title?: string; brief?: Brief }): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        'You are an experienced editor who plans articles with a strong, logical shape: a hook, a clear promise, sections that each earn their place, and a satisfying close. You answer only with JSON.',
    },
    {
      role: 'user',
      content: `Plan an article.
Working title: ${title || '(none yet)'}
${briefBlock(brief)}

Return JSON {"title": "a strong working title", "sections": [{"heading": "...", "points": ["2 to 4 specific points this section makes"]}]} with 4 to 7 sections. The first section is the introduction and the last is the conclusion; give them real headings, not "Introduction" and "Conclusion".`,
    },
  ];
}

export const outlineSchema: JsonSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: { heading: { type: 'string' }, points: { type: 'array', items: { type: 'string' } } },
        required: ['heading', 'points'],
      },
    },
  },
  required: ['title', 'sections'],
};

export function metaMessages({ title = '', content }: { title?: string; content: string }): ChatMessage[] {
  return [
    { role: 'system', content: 'You prepare articles for publication. You answer only with JSON.' },
    {
      role: 'user',
      content: `Title: ${title || '(untitled)'}

Article:
${head(content, 14000)}

Return JSON {"description": "an SEO meta description under 155 characters", "slug": "url-slug", "tags": ["5 tags"], "excerpt": "a 2-sentence teaser", "social": "a post announcing the article for LinkedIn or X, under 280 characters, no hashtags spam"}.`,
    },
  ];
}

export const metaSchema: JsonSchema = {
  type: 'object',
  properties: {
    description: { type: 'string' },
    slug: { type: 'string' },
    tags: { type: 'array', items: { type: 'string' } },
    excerpt: { type: 'string' },
    social: { type: 'string' },
  },
  required: ['description', 'slug', 'tags', 'excerpt', 'social'],
};

// ─────────────────────────────────────────────────────────── ask

export function askMessages({
  title = '',
  content,
  question,
  history = [],
}: {
  title?: string;
  content: string;
  question: string;
  history?: { role: string; content: string }[];
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content: `You are the author's trusted editor and writing partner. You have the full draft below. Answer the author's questions about it directly and specifically, quoting the draft where useful. Be honest; don't flatter. Keep answers short unless asked for more. Use Markdown sparingly.

Title: ${title || '(untitled)'}
<draft>
${head(content, 24000)}
</draft>`,
    },
    ...history.slice(-8).map(
      (m): ChatMessage => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content).slice(0, 4000),
      }),
    ),
    { role: 'user', content: question },
  ];
}
