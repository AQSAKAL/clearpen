// Any server that speaks the OpenAI chat API: LM Studio, llama.cpp's
// llama-server, vLLM, OpenRouter, or another hosted provider.

import type { ChatRequest, Fetch, LLMProvider, ModelInfo, StreamInfo } from './types.ts';
import { isUnreachable, lines, thinkFilter, timeoutSignal } from './util.ts';

export interface OpenAIOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: Fetch;
  /** The name the app shows for this server: "openai", "openrouter". */
  kind?: string;
  /** Extra request headers, such as OpenRouter's attribution. */
  headers?: Record<string, string>;
  /**
   * Only accept a model the server lists. For a hosted catalogue that changes,
   * this keeps a model id left in the writer's settings by another provider
   * from being sent. A local server may not list everything it serves.
   */
  strictModels?: boolean;
  /** Reads the model list with more than its ids. */
  parseCatalogue?: (data: unknown) => ModelInfo[];
}

interface Choice {
  delta?: { content?: string };
  message?: { content?: string };
  finish_reason?: string | null;
}

/** Waits briefly before a retry, unless the writer cancels. */
function pause(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('The request was cancelled.'));
    const onAbort = () => {
      clearTimeout(timer);
      reject(new Error('The request was cancelled.'));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** The usual `{ data: [{ id, name? }] }` answer, as a picker needs it. */
export function openAIModels(data: unknown): ModelInfo[] {
  const list = (data as { data?: unknown })?.data;
  if (!Array.isArray(list)) return [];
  return list
    .filter((m): m is { id: string; name?: string } => !!m && typeof (m as { id?: unknown }).id === 'string')
    .map((m) => ({ id: m.id, ...(typeof m.name === 'string' && m.name !== m.id ? { name: m.name } : {}) }));
}

export function createOpenAICompatible({
  baseUrl = 'http://127.0.0.1:1234/v1',
  apiKey = '',
  fetch: fetchImpl = globalThis.fetch,
  kind = 'openai',
  headers: extraHeaders = {},
  strictModels = false,
  parseCatalogue = openAIModels,
}: OpenAIOptions = {}): LLMProvider {
  const base = baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    ...extraHeaders,
  };
  const noStructuredOutput = new Set<string>();
  // What the server last said it serves, for `acceptsModel`.
  let known: string[] | null = null;

  function body(req: ChatRequest, stream: boolean) {
    const b: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream,
      temperature: req.temperature ?? 0.7,
      top_p: 0.9,
      max_tokens: req.maxTokens ?? 600,
      ...(req.stop ? { stop: req.stop } : {}),
    };
    if (req.format && !noStructuredOutput.has(req.model))
      b.response_format = { type: 'json_schema', json_schema: { name: 'result', schema: req.format, strict: true } };
    return b;
  }

  async function post(req: ChatRequest, stream: boolean): Promise<Response> {
    const b = body(req, stream);
    // A hosted catalogue is wide: some models want `max_completion_tokens`,
    // some reject a response format they can't honour. Both say so with a 400,
    // and either can be retried without losing the task. An upstream provider
    // can also fail once (502, 503, 429) and answer on the next try.
    let fixes = 0;
    let retries = 0;
    for (;;) {
      const res = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(b),
        signal: req.signal ?? null,
      });
      if (res.ok) return res;
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      if (res.status === 400 && fixes < 2) {
        if (b.response_format) {
          noStructuredOutput.add(req.model);
          delete b.response_format;
          fixes++;
          continue;
        }
        if (b.max_tokens && /max_completion_tokens/i.test(detail)) {
          b.max_completion_tokens = b.max_tokens;
          delete b.max_tokens;
          fixes++;
          continue;
        }
      }
      if (res.status === 502 || res.status === 503 || res.status === 504) {
        if (retries < 2) {
          retries++;
          await pause(300 * retries, req.signal);
          continue;
        }
        throw new Error('That model isn’t answering right now. Try again, or choose another model.');
      }
      if (res.status === 429) {
        if (retries < 1) {
          retries++;
          await pause(800, req.signal);
          continue;
        }
        throw new Error('The model is busy right now. Try again in a moment, or pick another model.');
      }
      if (res.status === 401) throw new Error('The API key was refused. Check it and try again.');
      if (res.status === 402) throw new Error('The model server says this key is out of credit.');
      throw new Error(`Model server error ${res.status}: ${detail.slice(0, 200)}`);
    }
  }

  async function models(signal?: AbortSignal): Promise<ModelInfo[]> {
    const t = timeoutSignal(4000, signal);
    try {
      const res = await fetchImpl(`${base}/models`, { headers, signal: t.signal });
      if (!res.ok) {
        if (res.status === 401) throw new Error('The API key was refused. Check it and try again.');
        throw new Error(`${res.status} ${res.statusText}`);
      }
      const text = await res.text();
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('The model server sent an answer Clearpen couldn’t read. Try again in a moment.');
      }
      return parseCatalogue(data);
    } finally {
      t.clear();
    }
  }

  const provider: LLMProvider = {
    kind,
    baseUrl: base,

    async listModels(signal) {
      const found = await models(signal);
      known = found.map((m) => m.id);
      return known;
    },

    catalogue: models,

    ...(strictModels ? { acceptsModel: (m: string) => !known || known.includes(m) } : {}),

    async *stream(req: ChatRequest, info: StreamInfo = {}) {
      let res: Response;
      try {
        res = await post(req, true);
      } catch (err) {
        if (req.signal?.aborted) throw err;
        throw new Error(provider.describeError(err));
      }
      const filter = thinkFilter();
      for await (const raw of lines(res.body!)) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') continue;
        const choice = (JSON.parse(data) as { choices?: Choice[] }).choices?.[0];
        if (choice?.finish_reason) info.truncated = choice.finish_reason === 'length';
        yield filter(choice?.delta?.content || '');
      }
    },

    async complete(req) {
      try {
        const res = await post({ ...req, temperature: req.temperature ?? 0 }, false);
        const text = await res.text();
        // A busy provider can send an empty or broken body with a 200; treat
        // it as no answer rather than failing with a JSON parse message.
        let data: { choices?: Choice[] } = {};
        try {
          data = JSON.parse(text) as { choices?: Choice[] };
        } catch {
          // No answer to read.
        }
        return data.choices?.[0]?.message?.content || '';
      } catch (err) {
        if (req.signal?.aborted) throw err;
        throw new Error(provider.describeError(err));
      }
    },

    isLoaded: async () => true,
    preload: async () => {},

    describeError(err) {
      if (isUnreachable(err)) return `Cannot reach the model server at ${base}.`;
      return err instanceof Error ? err.message : String(err);
    },
  };
  return provider;
}
