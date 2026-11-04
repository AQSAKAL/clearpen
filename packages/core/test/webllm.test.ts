// The in-page model (WebLLM), against a fake engine: what Clearpen sends it,
// how its stream is read, and how a cut-off answer is reported.
import assert from 'node:assert/strict';
import type { ChatCompletion, ChatCompletionChunk, ChatCompletionRequest, MLCEngine } from '@mlc-ai/web-llm';
import { test } from 'vitest';
import { createWebLLM, WEBLLM_DEFAULT_MODEL } from '../src/llm/webllm.ts';
import { collect } from './fake.ts';

function chunk(content: string | null, finish: ChatCompletionChunk['choices'][number]['finish_reason'] = null) {
  return {
    choices: [{ delta: { content }, finish_reason: finish, index: 0 }],
  } as ChatCompletionChunk;
}

/** An engine that answers from fixed chunks and records the requests it saw. */
function fakeEngine(chunks: ChatCompletionChunk[] | ChatCompletion, seen: ChatCompletionRequest[]) {
  return (async () => ({
    chat: {
      completions: {
        async create(req: ChatCompletionRequest) {
          seen.push(req);
          if (req.stream)
            return (async function* () {
              for (const c of chunks as ChatCompletionChunk[]) yield c;
            })();
          return chunks as ChatCompletion;
        },
      },
    },
    reload: async () => {},
    interruptGenerate: async () => {},
  })) as unknown as (model: string) => Promise<MLCEngine>;
}

test('WebLLM: streams text and reports a cut-off answer', async () => {
  const seen: ChatCompletionRequest[] = [];
  const engine = fakeEngine([chunk('Hel'), chunk('lo'), chunk(null, 'length')], seen);
  const llm = createWebLLM({ createEngine: engine });
  const info: { truncated?: boolean } = {};
  const text = (
    await collect(
      llm.stream({ model: WEBLLM_DEFAULT_MODEL, messages: [{ role: 'user', content: 'hi' }], maxTokens: 5 }, info),
    )
  ).join('');
  assert.equal(text, 'Hello');
  assert.equal(info.truncated, true);
  assert.equal(seen[0].stream, true);
  assert.equal(seen[0].max_tokens, 5);
});

test('WebLLM: a JSON request constrains the answer to the schema', async () => {
  const seen: ChatCompletionRequest[] = [];
  const completion = {
    choices: [
      {
        message: { role: 'assistant', content: '<think>\n\n</think>\n\n{}' },
        finish_reason: 'stop',
        index: 0,
      },
    ],
  } as ChatCompletion;
  const engine = fakeEngine(completion, seen);
  const llm = createWebLLM({ createEngine: engine });
  const schema = { type: 'object', properties: { ok: { type: 'boolean' } } };
  const answer = await llm.complete({
    model: WEBLLM_DEFAULT_MODEL,
    messages: [{ role: 'user', content: 'hi' }],
    format: schema,
  });
  assert.equal(answer, '{}');
  assert.deepEqual(seen[0].response_format, { type: 'json_object', schema: JSON.stringify(schema) });
  assert.equal(seen[0].stream, false);
});

test('WebLLM: an answer hides the empty thinking block, and stops apply after it', async () => {
  const seen: ChatCompletionRequest[] = [];
  // This is what WebLLM returns with enable_thinking: false: the block it put
  // in front of the answer is decoded into the answer.
  const engine = fakeEngine([chunk('<think>\n\n</think>\n\nHel'), chunk('lo\n\nThere')], seen);
  const llm = createWebLLM({ model: 'Qwen3.5-2B-q4f16_1-MLC', createEngine: engine });
  const text = (
    await collect(
      llm.stream({
        model: 'Qwen3.5-2B-q4f16_1-MLC',
        messages: [{ role: 'user', content: 'hi' }],
        stop: ['\n\n'],
      }),
    )
  ).join('');
  assert.equal(text, 'Hello');
  // Applied here, after the block is hidden: passed on, "\n\n" would match in it.
  assert.equal(seen[0].stop, undefined);
});

test('WebLLM: Qwen3 is told not to think out loud', async () => {
  const seen: ChatCompletionRequest[] = [];
  const engine = fakeEngine([chunk('hi')], seen);
  const llm = createWebLLM({ model: 'Qwen3.5-2B-q4f16_1-MLC', createEngine: engine });
  await collect(llm.stream({ model: 'Qwen3.5-2B-q4f16_1-MLC', messages: [{ role: 'user', content: 'hi' }] }));
  assert.deepEqual(seen[0].extra_body, { enable_thinking: false });
});
