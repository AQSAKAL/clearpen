// Ollama's native API. What we learned running 8–12B models on a laptop:
// - one context size for every request, or Ollama reloads the model;
// - keep the model in memory between requests (keep_alive);
// - tell thinking models (qwen3, gemma4, deepseek-r1) not to think out loud,
//   or every answer starts with seconds of hidden text;
// - Ollama's MLX engine has no structured output: ask nicely instead.

import type { ChatRequest, Fetch, LLMProvider, PullProgress, StreamInfo } from './types.ts';
import { isUnreachable, lines, thinkFilter, timeoutSignal } from './util.ts';

export interface OllamaOptions {
  baseUrl?: string;
  /** Context window for every request (changing it reloads the model). */
  numCtx?: number;
  /** How long Ollama keeps the model in memory after a request. */
  keepAlive?: string;
  fetch?: Fetch;
}

interface PullLine {
  status?: string;
  digest?: string;
  total?: number;
  completed?: number;
  error?: string;
}

interface OllamaChunk {
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
  error?: string;
}

export function createOllama({
  baseUrl = 'http://127.0.0.1:11434',
  numCtx = 16384,
  keepAlive = '2h',
  fetch: fetchImpl = globalThis.fetch,
}: OllamaOptions = {}): LLMProvider {
  const base = baseUrl.replace(/\/$/, '');
  const thinking = new Map<string, boolean>();
  const noStructuredOutput = new Set<string>();

  async function getJSON<T>(path: string, init: RequestInit = {}, ms = 4000): Promise<T> {
    const t = timeoutSignal(ms, init.signal ?? undefined);
    try {
      const res = await fetchImpl(`${base}${path}`, {
        ...init,
        headers: { 'Content-Type': 'application/json' },
        signal: t.signal,
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      return (await res.json()) as T;
    } finally {
      t.clear();
    }
  }

  async function supportsThinking(model: string): Promise<boolean> {
    const known = thinking.get(model);
    if (known !== undefined) return known;
    try {
      const info = await getJSON<{ capabilities?: string[] }>('/api/show', {
        method: 'POST',
        body: JSON.stringify({ model }),
      });
      const yes = (info.capabilities || []).includes('thinking');
      thinking.set(model, yes);
      return yes;
    } catch {
      return false; // unknown for now — ask again next time
    }
  }

  async function body(req: ChatRequest, stream: boolean) {
    const b: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream,
      keep_alive: keepAlive,
      options: {
        temperature: req.temperature ?? 0.7,
        top_p: 0.9,
        repeat_penalty: 1.05,
        num_predict: req.maxTokens ?? 600,
        num_ctx: numCtx,
        ...(req.stop ? { stop: req.stop } : {}),
      },
    };
    if (await supportsThinking(req.model)) b.think = false;
    if (req.format && !noStructuredOutput.has(req.model)) b.format = req.format;
    return b;
  }

  async function post(req: ChatRequest, stream: boolean): Promise<Response> {
    const b = await body(req, stream);
    let res = await fetchImpl(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(b),
      signal: req.signal ?? null,
    });
    // No structured output on this engine: remember, and ask without it.
    if ((res.status === 501 || res.status === 400) && b.format) {
      noStructuredOutput.add(req.model);
      delete b.format;
      res = await fetchImpl(`${base}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(b),
        signal: req.signal ?? null,
      });
    }
    if (!res.ok)
      throw new Error(`Model server error ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
    return res;
  }

  const provider: LLMProvider = {
    kind: 'ollama',
    baseUrl: base,

    async listModels(signal) {
      const data = await getJSON<{ models?: { name: string }[] }>('/api/tags', signal ? { signal } : {});
      return (data.models || []).map((m) => m.name);
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
        if (!line) continue;
        const msg = JSON.parse(line) as OllamaChunk;
        if (msg.error) throw new Error(msg.error);
        if (msg.done) info.truncated = msg.done_reason === 'length';
        yield filter(msg.message?.content || '');
      }
    },

    async complete(req) {
      try {
        const res = await post({ ...req, temperature: req.temperature ?? 0.2 }, false);
        const data = (await res.json()) as OllamaChunk;
        return data.message?.content || '';
      } catch (err) {
        if (req.signal?.aborted) throw err;
        throw new Error(provider.describeError(err));
      }
    },

    async isLoaded(model) {
      try {
        const data = await getJSON<{ models?: { name: string; model: string }[] }>('/api/ps');
        return (data.models || []).some((m) => m.name === model || m.model === model);
      } catch {
        return true;
      }
    },

    async preload(model) {
      try {
        await getJSON(
          '/api/generate',
          {
            method: 'POST',
            body: JSON.stringify({ model, prompt: '', keep_alive: keepAlive, options: { num_ctx: numCtx } }),
          },
          120000,
        );
      } catch {
        // Best-effort: the first real request loads it instead.
      }
    },

    async *pull(model, { signal } = {}) {
      let res: Response;
      try {
        res = await fetchImpl(`${base}/api/pull`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, stream: true }),
          signal: signal ?? null,
        });
      } catch (err) {
        if (signal?.aborted) throw err;
        throw new Error(provider.describeError(err));
      }
      if (!res.ok) throw new Error(`Couldn’t download ${model}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
      // A model comes in parts — the weights, then small files — each with its own size.
      const parts = new Map<string, { total: number; completed: number }>();
      let done = false;
      for await (const raw of lines(res.body!)) {
        const line = raw.trim();
        if (!line) continue;
        const msg = JSON.parse(line) as PullLine;
        if (msg.error) throw new Error(msg.error);
        if (msg.digest && msg.total) parts.set(msg.digest, { total: msg.total, completed: msg.completed ?? 0 });
        let total = 0;
        let completed = 0;
        for (const p of parts.values()) {
          total += p.total;
          completed += Math.min(p.completed, p.total);
        }
        done = msg.status === 'success';
        const progress: PullProgress = { status: msg.status ?? '', completed: done ? total : completed, total, done };
        yield progress;
      }
      // Ollama keeps what it has; asking again carries on from there.
      if (!done) throw new Error('The download stopped before it finished. Try again to carry on where it left off.');
    },

    describeError(err) {
      if (isUnreachable(err)) return 'Cannot reach Ollama. Start it with "ollama serve".';
      return err instanceof Error ? err.message : String(err);
    },
  };
  return provider;
}
