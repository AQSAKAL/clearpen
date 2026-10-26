// What every AI task shares: input errors, the loading notice, and streaming
// plain text with a fallback when a separate writer model won't start.

import type { LLMClient, Role } from '../llm/client.ts';
import type { StreamInfo } from '../llm/types.ts';
import { anySignal } from '../llm/util.ts';
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
  role?: Role;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** How long a separate writer model may stay silent before the quick model takes over. */
  firstWordMs?: number;
}

/**
 * Streams a plain-text answer as token events and returns the raw text.
 * A separate writer model that hasn't said a word in `firstWordMs` is given
 * up on, and the quick model — already in memory — writes it instead.
 */
export async function* streamText(
  llm: LLMClient,
  messages: ChatMessage[],
  { role = 'quick', signal, firstWordMs = 45_000, ...opts }: TextStreamOptions,
  info: StreamInfo = {},
): AsyncGenerator<NoticeEvent | TokenEvent, string> {
  let model = await llm.modelFor(role);
  const quick = await llm.modelFor('quick');
  const notice = await loadingNotice(llm, model);
  if (notice) yield notice;
  let raw = '';

  async function* attempt(m: string, timeoutMs: number): AsyncGenerator<TokenEvent, boolean> {
    const giveUp = new AbortController();
    const timer = timeoutMs ? setTimeout(() => giveUp.abort(), timeoutMs) : null;
    try {
      for await (const chunk of llm.stream(
        { model: m, messages, ...opts, signal: anySignal([signal, giveUp.signal]) },
        info,
      )) {
        if (timer) clearTimeout(timer);
        raw += chunk;
        yield { type: 'token', text: chunk };
      }
    } catch (err) {
      if (giveUp.signal.aborted && !signal?.aborted && !raw) return false;
      throw err;
    } finally {
      if (timer) clearTimeout(timer);
    }
    return true;
  }

  const fallback = role === 'writer' && model !== quick;
  if (!(yield* attempt(model, fallback ? firstWordMs : 0))) {
    yield { type: 'notice', text: `${model} is taking too long to start — writing with ${quick} instead.` };
    model = quick;
    yield* attempt(model, 0);
  }
  return raw;
}

/** A trimmed string field, or '' — for model output that may be any shape. */
export const field = (v: unknown, max = 2000): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** The words in a draft. */
export const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
