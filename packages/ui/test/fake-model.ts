// A scripted model for interface tests: each answer is picked by matching the
// request's last message, and streamed in small chunks like a real model.
// The real AI tasks run on top of it, so tests exercise core and UI together.

import { type ChatRequest, createLLM, type LLMClient, type LLMProvider } from '@clearpen/core';

/** The computer the fake model runs on: is Ollama running, what's installed, and how downloads go. */
export interface FakeMachine {
  running: boolean;
  installed: string[];
  /** Makes the next download fail with this message. */
  pullFails?: string;
  /** A download waits here, part-way through, until the test lets it finish — so the test can look at it in progress. */
  pullHold?: Promise<void>;
}

export interface Reply {
  when: RegExp;
  /** The answer, or 'hang' to stay silent until the request is aborted. */
  reply: string | 'hang';
}

const lastUser = (req: ChatRequest) => req.messages.filter((m) => m.role === 'user').pop()?.content ?? '';

export function fakeModel(
  replies: Reply[],
  machine: FakeMachine = { running: true, installed: ['qwen3:8b', 'gemma3:12b'] },
): { llm: LLMClient; requests: ChatRequest[] } {
  const requests: ChatRequest[] = [];
  const provider: LLMProvider = {
    kind: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    async listModels() {
      if (!machine.running) throw new TypeError('fetch failed');
      return [...machine.installed];
    },
    // A download in four steps, a few milliseconds apart — too quick to look
    // at on a slow runner, so a test that needs to see it in progress holds it.
    async *pull(model, { signal } = {}) {
      const total = 4000;
      yield { status: 'pulling manifest', completed: 0, total: 0, done: false };
      for (const completed of [1000, 2500, 4000]) {
        await new Promise((r) => setTimeout(r, 20));
        if (signal?.aborted) throw Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' });
        if (machine.pullFails) {
          const message = machine.pullFails;
          machine.pullFails = undefined;
          throw new Error(message);
        }
        yield { status: `pulling ${model}`, completed, total, done: false };
        if (completed === 2500 && machine.pullHold) await machine.pullHold;
      }
      machine.installed.push(model);
      yield { status: 'success', completed: total, total, done: true };
    },
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
