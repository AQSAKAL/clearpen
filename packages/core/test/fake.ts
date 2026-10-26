// A scripted model server for tests: decide each answer from the request.

import { createLLM, type LLMClient } from '../src/llm/client.ts';
import type { ChatRequest, LLMProvider, StreamInfo } from '../src/llm/types.ts';

export interface Script {
  /** Chunks to stream for a request — or 'hang' to stay silent until aborted. */
  stream?: (req: ChatRequest) => string[] | 'hang';
  complete?: (req: ChatRequest) => string;
  truncated?: boolean;
  loaded?: boolean;
}

const lastUser = (req: ChatRequest) => req.messages.filter((m) => m.role === 'user').pop()?.content ?? '';

/** Waits until `signal` aborts, then throws like fetch does. */
const hang = (signal?: AbortSignal) =>
  new Promise<never>((_, reject) => {
    const fail = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
    if (signal?.aborted) fail();
    signal?.addEventListener('abort', fail, { once: true });
  });

export function fakeProvider(script: Script): LLMProvider & { requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  return {
    kind: 'fake',
    baseUrl: 'fake://',
    requests,
    listModels: async () => ['quick-model', 'coach-model', 'big-model'],
    async *stream(req: ChatRequest, info: StreamInfo = {}) {
      requests.push(req);
      const out = script.stream?.(req) ?? [];
      if (out === 'hang') await hang(req.signal);
      for (const chunk of out as string[]) {
        await Promise.resolve();
        yield chunk;
      }
      info.truncated = !!script.truncated;
    },
    async complete(req) {
      requests.push(req);
      return script.complete?.(req) ?? '{}';
    },
    isLoaded: async () => script.loaded ?? true,
    preload: async () => {},
    describeError: (err) => String(err),
  };
}

export function fakeLLM(
  script: Script,
  models: Record<string, string> = { quick: 'quick-model' },
): { llm: LLMClient; provider: ReturnType<typeof fakeProvider> } {
  const provider = fakeProvider(script);
  return { llm: createLLM({ provider, models, stallMs: 200 }), provider };
}

/** Splits `text` into small chunks, the way a model streams. */
export const chunks = (text: string, size = 7): string[] => text.match(new RegExp(`[\\s\\S]{1,${size}}`, 'g')) ?? [];

/** Every event a task yields. */
export async function collect<T>(gen: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

export { lastUser };
