// The one object the rest of Margin talks to: a model server plus which model
// plays which role, with protection against a model that goes quiet.

import type { ChatRequest, LLMProvider, StreamInfo } from './types.ts';
import { anySignal, parseJSONAnswer } from './util.ts';

/**
 * - quick: everything interactive — autocomplete, edits, checks, reviews.
 *   Must be fast and keep its prompt cache warm.
 * - coach: outlines and section plans — the argument, never the prose.
 * - checker: fact-checking, where a larger model knows more.
 * On a typical laptop two models don't fit in memory together, so by default
 * every role uses the quick model.
 */
export type Role = 'quick' | 'coach' | 'checker';

/** Good defaults, in order, when the writer hasn't picked a model. */
export const PREFERRED_MODELS = [
  'qwen3:8b',
  'qwen3:14b',
  'gemma4:12b',
  'gemma3:12b',
  'llama3.1:8b',
  'mistral-nemo',
  'gemma4:12b-mlx',
];

export interface LLMStatus {
  ok: boolean;
  provider: string;
  baseUrl: string;
  models: string[];
  roles: Record<Role, string | null>;
  error: string | null;
}

export interface LLMClientOptions {
  provider: LLMProvider;
  /** A model per role. Missing roles use the quick model; a missing quick model, the best one installed. */
  models?: Partial<Record<Role, string>>;
  /** A model silent this long — before its first word or mid-answer — is treated as hung. */
  stallMs?: number;
  preferred?: string[];
}

export type StreamRequest = Omit<ChatRequest, 'model'> & { model: string };

export interface LLMClient {
  readonly provider: LLMProvider;
  status(): Promise<LLMStatus>;
  modelFor(role?: Role): Promise<string>;
  setModel(role: Role, model: string | null): void;
  /** Streams text chunks; throws "The model stopped responding." if it goes quiet. */
  stream(req: StreamRequest, info?: StreamInfo): AsyncGenerator<string>;
  /** A JSON answer, parsed. `salvage` recovers a result from malformed output. */
  json(req: StreamRequest, salvage?: (text: string) => unknown): Promise<unknown>;
}

/** The best model to default to from those installed. */
export function pickModel(installed: string[], preferred = PREFERRED_MODELS): string | null {
  for (const m of preferred) if (installed.includes(m)) return m;
  return installed.find((m) => !/embed/i.test(m)) ?? null;
}

/** How long `modelFor` trusts the last list of installed models. */
const STATUS_FRESH_MS = 10_000;

export function createLLM({
  provider,
  models = {},
  stallMs = 120_000,
  preferred = PREFERRED_MODELS,
}: LLMClientOptions): LLMClient {
  const chosen: Partial<Record<Role, string | null>> = { ...models };

  async function status(): Promise<LLMStatus> {
    try {
      const installed = await provider.listModels();
      // Hosted servers may not list every model they serve: trust an explicit choice.
      const usable = (m: string | null | undefined) => !!m && (installed.includes(m) || provider.kind !== 'ollama');
      const quick = usable(chosen.quick) ? chosen.quick! : pickModel(installed, preferred);
      const role = (r: Role) => (usable(chosen[r]) ? chosen[r]! : quick);
      return {
        ok: !!quick,
        provider: provider.kind,
        baseUrl: provider.baseUrl,
        models: installed,
        roles: { quick, coach: role('coach'), checker: role('checker') },
        error: quick ? null : 'No models installed.',
      };
    } catch (err) {
      return {
        ok: false,
        provider: provider.kind,
        baseUrl: provider.baseUrl,
        models: [],
        roles: { quick: null, coach: null, checker: null },
        error: provider.describeError(err),
      };
    }
  }

  // The installed models change rarely; don't ask the server before every request.
  let recent: { at: number; status: LLMStatus } | null = null;

  async function modelFor(role: Role = 'quick'): Promise<string> {
    const direct = chosen[role] ?? (role === 'quick' ? null : chosen.quick);
    if (direct && provider.kind !== 'ollama') return direct;
    const s = recent && Date.now() - recent.at < STATUS_FRESH_MS ? recent.status : await status();
    recent = s.ok ? { at: Date.now(), status: s } : null;
    const m = s.roles[role];
    if (!m) throw new Error(s.error || 'No model available.');
    return m;
  }

  async function* stream(req: StreamRequest, info: StreamInfo = {}): AsyncGenerator<string> {
    const stall = new AbortController();
    let timer = setTimeout(() => stall.abort(), stallMs);
    const alive = () => {
      clearTimeout(timer);
      timer = setTimeout(() => stall.abort(), stallMs);
    };
    try {
      for await (const chunk of provider.stream({ ...req, signal: anySignal([req.signal, stall.signal]) }, info)) {
        alive();
        if (chunk) yield chunk;
      }
    } catch (err) {
      if (stall.signal.aborted && !req.signal?.aborted) throw new Error('The model stopped responding.');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async function json(req: StreamRequest, salvage?: (text: string) => unknown): Promise<unknown> {
    const text = await provider.complete({ maxTokens: 1500, ...req });
    try {
      return parseJSONAnswer(text);
    } catch (err) {
      if (salvage) return salvage(text);
      throw err;
    }
  }

  return {
    provider,
    status,
    modelFor,
    setModel(role, model) {
      chosen[role] = model || null;
    },
    stream,
    json,
  };
}
