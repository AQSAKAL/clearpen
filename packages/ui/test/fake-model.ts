// A scripted model for interface tests: each answer is picked by matching the
// request's last message, and streamed in small chunks like a real model.
// The real AI tasks run on top of it, so tests exercise core and UI together.

import { type ChatRequest, createLLM, type LLMClient, type LLMProvider } from '@clearpen/core';

export interface Reply {
  when: RegExp;
  /** The answer, or 'hang' to stay silent until the request is aborted. */
  reply: string | 'hang';
}

const lastUser = (req: ChatRequest) => req.messages.filter((m) => m.role === 'user').pop()?.content ?? '';

export function fakeModel(replies: Reply[]): { llm: LLMClient; requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  const provider: LLMProvider = {
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    listModels: async () => ['qwen3:8b', 'gemma3:12b'],
    async *stream(req) {
      requests.push(req);
      const reply = replies.find((r) => r.when.test(lastUser(req)))?.reply ?? '';
      if (reply === 'hang') {
        await new Promise<never>((_, reject) => {
          const fail = () => reject(Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }));
          if (req.signal?.aborted) fail();
          req.signal?.addEventListener('abort', fail, { once: true });
        });
      }
      for (const chunk of reply.match(/[\s\S]{1,6}/g) ?? []) {
        await new Promise((r) => setTimeout(r, 1));
        yield chunk;
      }
    },
    async complete(req) {
      requests.push(req);
      return replies.find((r) => r.when.test(lastUser(req)))?.reply ?? '{}';
    },
    isLoaded: async () => true,
    preload: async () => {},
    describeError: (err) => String(err),
  };
  return { llm: createLLM({ provider, stallMs: 2000 }), requests };
}
