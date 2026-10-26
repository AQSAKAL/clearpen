// Tasks that answer with structured data: headlines, an outline, and the
// metadata for publishing. Models without schema support sometimes return
// partial objects, so every answer is normalised into a safe shape.

import type { LLMClient, Role } from '../llm/client.ts';
import * as P from '../prompts.ts';
import { field, InputError, type TaskOptions, wordCount } from './common.ts';

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const get = (v: unknown, key: string): unknown =>
  v && typeof v === 'object' ? (v as Record<string, unknown>)[key] : undefined;

export interface Headline {
  text: string;
  style: string;
}

export function normaliseHeadlines(out: unknown): Headline[] {
  return list(get(out, 'headlines'))
    .map((h) => ({ text: field(get(h, 'text'), 300), style: field(get(h, 'style'), 40) }))
    .filter((h) => h.text)
    .slice(0, 10);
}

export function normaliseOutline(o: unknown): P.Outline {
  const sections = list(get(o, 'sections'))
    .map((s) => ({
      heading: field(get(s, 'heading'), 300),
      points: list(get(s, 'points'))
        .map((p) => field(p, 500))
        .filter(Boolean),
    }))
    .filter((s) => s.heading)
    .slice(0, 12);
  return { title: field(get(o, 'title'), 300), sections };
}

export interface Meta {
  description: string;
  slug: string;
  tags: string[];
  excerpt: string;
  social: string;
}

export function normaliseMeta(m: unknown): Meta {
  return {
    description: field(get(m, 'description'), 400),
    slug: field(get(m, 'slug'), 120)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-+|-+$/g, ''),
    tags: list(get(m, 'tags'))
      .map((t) => field(t, 60))
      .filter(Boolean)
      .slice(0, 8),
    excerpt: field(get(m, 'excerpt'), 600),
    social: field(get(m, 'social'), 600),
  };
}

async function structured(
  llm: LLMClient,
  messages: P.ChatMessage[],
  format: P.JsonSchema,
  maxTokens: number,
  { signal }: TaskOptions,
  role: Role = 'quick',
): Promise<unknown> {
  const model = await llm.modelFor(role);
  return llm.json({ model, messages, format, maxTokens, ...(signal ? { signal } : {}) });
}

export async function headlines(
  llm: LLMClient,
  input: { title?: string; content?: string; brief?: P.Brief },
  opts: TaskOptions = {},
): Promise<Headline[]> {
  return normaliseHeadlines(await structured(llm, P.headlineMessages(input), P.headlineSchema, 900, opts));
}

export async function outline(
  llm: LLMClient,
  input: { title?: string; brief?: P.Brief },
  opts: TaskOptions = {},
): Promise<P.Outline> {
  if (!input.brief?.topic && !input.title?.trim()) throw new InputError('Tell me what the article is about first.');
  // An outline is the argument's shape — the coach's job.
  const out = normaliseOutline(await structured(llm, P.outlineMessages(input), P.outlineSchema, 1500, opts, 'coach'));
  if (!out.sections.length) throw new Error('The model didn’t return an outline — try again.');
  return out;
}

export async function meta(
  llm: LLMClient,
  input: { title?: string; content: string },
  opts: TaskOptions = {},
): Promise<Meta> {
  if (wordCount(input.content) < 60) throw new InputError('There isn’t enough of the article yet to describe it.');
  return normaliseMeta(await structured(llm, P.metaMessages(input), P.metaSchema, 900, opts));
}
