// Guided writing: a template is a short sequence of frames — each a sentence
// with one blank — that the author completes one after the other. A frame is
// a question in the shape of a sentence: it is shown in grey at the cursor
// and in the margin, never inserted into the article, and the author types
// the whole sentence. After each, Clearpen may ask one question about what
// the sentence leaves unsaid, and asks the next frame's question. It never
// fills a blank. Adding a template is adding an entry to TEMPLATES.

import { endsSentence, paragraphSentences } from './autocomplete.ts';

export const BLANK = '___';

export interface Frame {
  /** The sentence to complete, with one `___` blank: "I feel ___ today." */
  text: string;
  /** The question the blank answers, as the coach would put it. */
  ask: string;
  /** Why this sentence is here — shown when the author asks. */
  why: string;
}

export interface Template {
  id: TemplateId;
  label: string;
  /** One line: what the frames are. */
  hint: string;
  /** What the finished piece is, for the coach. */
  about: string;
  /** All frames in one paragraph, or each frame its own paragraph. */
  layout: 'paragraph' | 'paragraphs';
  frames: Frame[];
  /** What the card says when every frame is filled. */
  done: string;
}

export const TEMPLATE_IDS = ['reflect', 'problem', 'scientific'] as const;
export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATES: Record<TemplateId, Template> = {
  // A paragraph that makes its point: the feeling, its source, and what it
  // means — the same three parts the paragraph judge looks for.
  reflect: {
    id: 'reflect',
    label: 'Reflect',
    hint: 'Three sentences: what you feel, where it comes from, what you want instead.',
    about: 'a short reflection, written to understand a feeling rather than to publish',
    layout: 'paragraph',
    frames: [
      {
        text: 'I feel ___ today.',
        ask: 'What’s the feeling? One or two words will do.',
        why: 'Naming the feeling is this paragraph’s point; the rest explains it. A feeling written down becomes something you can look at.',
      },
      {
        text: 'That comes from ___.',
        ask: 'Where does it come from — a thing that happened, not a mood?',
        why: 'A feeling with a source can be examined; without one it only repeats. This is the reason behind the point.',
      },
      {
        text: 'What I want instead is ___.',
        ask: 'What would be different if this went the way you want?',
        why: 'Saying what you want turns a feeling into something you can act on — what the paragraph means.',
      },
    ],
    done: 'Three sentences: a feeling, where it comes from, and what you want. All of them yours.',
  },
  problem: {
    id: 'problem',
    label: 'Work a problem',
    hint: 'Five frames: the problem, why it matters, what you’ve tried, what stops you, ways forward.',
    about: 'a problem worked through on the page, to see it whole before deciding what to do',
    layout: 'paragraphs',
    frames: [
      {
        text: 'I’m working on ___.',
        ask: 'What’s the problem, in one sentence a stranger would follow?',
        why: 'A problem you can state is one you can work on; a vague one stays vague.',
      },
      {
        text: 'It matters because ___.',
        ask: 'What goes wrong if it stays unsolved?',
        why: 'The cost of the problem decides how much of it is worth solving.',
      },
      {
        text: 'What I’ve tried: ___.',
        ask: 'What have you already done, and what happened?',
        why: 'What failed narrows down where the answer can be.',
      },
      {
        text: 'What stops me: ___.',
        ask: 'What’s the one thing in the way — a fact, a person, something you don’t know?',
        why: 'An obstacle named is half the plan.',
      },
      {
        text: 'Ways forward: ___.',
        ask: 'What could you try next? A bad option counts.',
        why: 'Options written down can be compared; the first one that comes to mind is rarely the best.',
      },
    ],
    done: 'The problem, on the page: what it is, why it matters, what you’ve tried, what’s in the way, and ways forward.',
  },
  // The informative abstract, one sentence per part: what a reviewer with a
  // few hours must know by the end of the introduction (Halevi; Pak).
  scientific: {
    id: 'scientific',
    label: 'The skeleton',
    hint: 'Six sentences: the question, what is known, what is new, the method, the result, what it means.',
    about: 'the skeleton of a scientific paper — the sentences a reviewer must find by the end of the introduction',
    layout: 'paragraphs',
    frames: [
      {
        text: 'This paper asks ___.',
        ask: 'What is the question, in one sentence a reader outside your field could follow?',
        why: 'A reviewer reads the abstract and the introduction first and must know the question before anything else.',
      },
      {
        text: 'What is already known: ___.',
        ask: 'What did earlier work establish that this builds on? One or two results, named.',
        why: 'The reader can only see what is new against what was known.',
      },
      {
        text: 'What is new here is ___.',
        ask: 'What does this paper add that was not there before?',
        why: 'By the end of the introduction the reader must know what is new. Say it before the details.',
      },
      {
        text: 'We answered it by ___.',
        ask: 'What did you do — the method, in one sentence?',
        why: 'The method is how a reader judges the result: one sentence here, the detail in its own section.',
      },
      {
        text: 'We found ___.',
        ask: 'What is the main result, with its number if it has one?',
        why: 'Most readers skip to the main result. State it early, as a claim, not as a topic.',
      },
      {
        text: 'This means ___.',
        ask: 'What follows from the result — for the field, or for practice?',
        why: 'A result without its meaning leaves the reader to guess why it matters.',
      },
    ],
    done: 'The skeleton of the paper: the question, what is known, what is new, the method, the result, what it means. Now the sections.',
  },
};

export const isTemplateId = (t: unknown): t is TemplateId =>
  typeof t === 'string' && (TEMPLATE_IDS as readonly string[]).includes(t);

const words = (s: string): string[] => (s.toLowerCase().match(/[\p{L}\p{N}’']+/gu) || []).filter((w) => w !== BLANK);

/** The frame's fixed words, lower-cased: "I feel ___ today." → [i, feel, today]. */
export const frameScaffold = (frame: Frame): string[] => words(frame.text.replace(BLANK, ' '));

/** The last complete sentence of the paragraph being written, or ''. */
export function lastSentence(before: string): string {
  if (!endsSentence(before)) return '';
  return paragraphSentences(before).at(-1) ?? '';
}

/**
 * Has the author's sentence filled the frame? A finished sentence that keeps
 * the frame's words must have more than them ("I feel." has not); one in the
 * author's own shape needs only to be a sentence of two words or more.
 */
export function frameFilled(frame: Frame, sentence: string): boolean {
  const s = sentence.trim();
  if (!s || !endsSentence(s)) return false;
  const w = words(s);
  const scaffold = frameScaffold(frame);
  const opens = scaffold.slice(0, 2);
  const keepsFrame = opens.length === 2 && w[0] === opens[0] && w[1] === opens[1];
  return keepsFrame ? w.length > scaffold.length : w.length >= 2;
}

/**
 * Whether a coach's reply earns its place: a question (or nothing), short,
 * and never a sentence in the author's shape — the coach asks; the author
 * writes.
 */
export function guideReplyOk(frame: Frame, reply: string): boolean {
  const r = reply.trim();
  if (!r) return true;
  if (r.length > 240 || !/\?["”’)]*$/.test(r)) return false;
  const w = words(r);
  const opens = frameScaffold(frame).slice(0, 2);
  return !(opens.length === 2 && w[0] === opens[0] && w[1] === opens[1]);
}
