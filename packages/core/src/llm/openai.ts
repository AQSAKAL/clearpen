// Any server that speaks the OpenAI chat API: LM Studio, llama.cpp's
// llama-server, vLLM, or a hosted provider.

import type { ChatRequest, Fetch, LLMProvider, StreamInfo } from './types.ts';
import { isUnreachable, lines, thinkFilter, timeoutSignal } from './util.ts';

export interface OpenAIOptions {
  baseUrl?: string;
  apiKey?: string;
  fetch?: Fetch;
}

interface Choice {
  delta?: { content?: string };
  message?: { content?: string };
  finish_reason?: string | null;
}

export function createOpenAICompatible({
  baseUrl = 'http://127.0.0.1:1234/v1',
  apiKey = '',
  fetch: fetchImpl = globalThis.fetch,
}: OpenAIOptions = {}): LLMProvider {
  const base = baseUrl.replace(/\/$/, '');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  };
  const noStructuredOutput = new Set<string>();

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
    let res = await fetchImpl(`${base}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify(b),
      signal: req.signal ?? null,
    });
    if (res.status === 400 && b.response_format) {
      noStructuredOutput.add(req.model);
      delete b.response_format;
      res = await fetchImpl(`${base}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify(b),
        signal: req.signal ?? null,
      });
    }
    if (!res.ok)
      throw new Error(`Model server error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res;
  }

  const provider: LLMProvider = {
    kind: 'openai',
    baseUrl: base,

    async listModels(signal) {
      const t = timeoutSignal(4000, signal);
      try {
        const res = await fetchImpl(`${base}/models`, { headers, signal: t.signal });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        const data = (await res.json()) as { data?: { id: string }[] };
        return (data.data || []).map((m) => m.id);
      } finally {
        t.clear();
      }
    },

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
        const data = (await res.json()) as { choices?: Choice[] };
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
