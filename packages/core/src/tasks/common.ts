// What every AI task shares: input errors, the loading notice, and streaming
// plain text as token events.

import type { LLMClient } from '../llm/client.ts';
import type { StreamInfo } from '../llm/types.ts';
import type { ChatMessage } from '../prompts.ts';

/** A request the task can't do as asked — a 400, not a crash. */
export class InputError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'InputError';
    this.status = status;
  }
}

export interface NoticeEvent {
  type: 'notice';
  text: string;
}

export interface TokenEvent {
  type: 'token';
  text: string;
}

/** The longest passage a single rewrite, edit or check accepts. */
export const MAX_PASSAGE = 12_000;

export interface TaskOptions {
  signal?: AbortSignal;
}

/** Tells the writer why the first word is slow, when the model isn't in memory yet. */
export async function loadingNotice(llm: LLMClient, model: string): Promise<NoticeEvent | null> {
  return (await llm.provider.isLoaded(model))
    ? null
    : { type: 'notice', text: `Loading ${model} into memory — the first answer takes a few extra seconds…` };
}

export interface TextStreamOptions extends TaskOptions {
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}

/** Streams a plain-text answer from the quick model as token events, and returns the raw text. */
export async function* streamText(
  llm: LLMClient,
  messages: ChatMessage[],
  opts: TextStreamOptions,
  info: StreamInfo = {},
): AsyncGenerator<NoticeEvent | TokenEvent, string> {
  const model = await llm.modelFor('quick');
  const notice = await loadingNotice(llm, model);
  if (notice) yield notice;
  let raw = '';
  for await (const chunk of llm.stream({ model, messages, ...opts }, info)) {
    raw += chunk;
    yield { type: 'token', text: chunk };
  }
  return raw;
}

/** A trimmed string field, or '' — for model output that may be any shape. */
export const field = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The words in a draft. */
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
