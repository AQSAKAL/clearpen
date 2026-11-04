// WebLLM (MLC) runs the model inside the page, on WebGPU. The package is
// imported lazily: the desktop app and the server never take this path, and
// never load it.
//
// What we learned about it:
// - the first call downloads the weights (hundreds of MB) into Cache Storage,
//   then they load from disk; `initProgressCallback` reports both;
// - it speaks the OpenAI API, so the mapping is mostly field names;
// - a model's context window is fixed by its `mlc-chat-config.json` (4096 for
//   the prebuilt entries), and must be overridden in the app config;
// - Qwen3 models think out loud unless `extra_body.enable_thinking` is false;
//   WebLLM then counts the empty thinking block as part of the answer, so this
//   provider hides it and applies stop strings itself, after hiding it;
// - there is no AbortSignal on a request: `interruptGenerate()` stops it.

import type {
  AppConfig,
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatOptions,
  InitProgressReport,
  MLCEngine,
  MLCEngineConfig,
  ModelRecord,
} from '@mlc-ai/web-llm';
import type { ChatRequest, LLMProvider, PullProgress, StreamInfo } from './types.ts';
import { thinkFilter } from './util.ts';

/**
 * The models Clearpen offers in the browser, preferred first. All are prebuilt
 * WebLLM entries. Qwen3.5 2B is the default: ~1.0 GiB to download, ~2.25 GB of
 * VRAM, 4096 tokens, and its thinking phase is turned off for us.
 */
export const WEBLLM_MODELS = [
  'Qwen3.5-2B-q4f16_1-MLC',
  'Qwen3.5-0.8B-q4f16_1-MLC',
  'Qwen3.5-4B-q4f16_1-MLC',
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
] as const;

export const WEBLLM_DEFAULT_MODEL = WEBLLM_MODELS[0];

/** Can this page run a model on the GPU? */
export function webllmSupported(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}

type CreateEngine = (model: string, config: MLCEngineConfig, chatOpts?: ChatOptions) => Promise<MLCEngine>;

export interface WebLLMOptions {
  /** Which prebuilt model to load. Defaults to `WEBLLM_DEFAULT_MODEL`. */
  model?: string;
  /**
   * Your own MLC builds: weights on any HTTPS URL (Hugging Face), plus the
   * `.wasm` compiled for WebGPU. They join the catalogue the picker offers.
   */
  records?: ModelRecord[];
  /**
   * Raise the 4096-token window the prebuilt models ship with, at a VRAM cost.
   * 16384 matches what Clearpen asks of Ollama; 8192 is a gentler compromise.
   */
  contextWindowSize?: number;
  /** Log what is loaded and what the model answers, for diagnosing a browser. */
  debug?: boolean;
  /** For tests: a stand-in for WebLLM's `CreateMLCEngine`. */
  createEngine?: CreateEngine;
}

/** Every model the picker offers: ours, then the prebuilt ones. */
function catalogue(model: string, records: ModelRecord[]): string[] {
  const ids = [...records.map((r) => r.model_id), ...WEBLLM_MODELS];
  const offered = [...new Set(ids)];
  return offered.includes(model) ? offered : [model, ...offered];
}

/** A new app config, with our models' context windows raised. */
async function appConfigFor(contextWindowSize: number | undefined, records: ModelRecord[]): Promise<AppConfig> {
  const { prebuiltAppConfig } = await import('@mlc-ai/web-llm');
  const custom = new Set(records.map((r) => r.model_id));
  const own = new Set<string>([...WEBLLM_MODELS, ...custom]);
  const raised = (record: ModelRecord): ModelRecord =>
    contextWindowSize && own.has(record.model_id)
      ? { ...record, overrides: { ...record.overrides, context_window_size: contextWindowSize } }
      : record;
  return {
    ...prebuiltAppConfig,
    model_list: [
      ...records.map(raised),
      ...prebuiltAppConfig.model_list.filter((r) => !custom.has(r.model_id)).map(raised),
    ],
  };
}

/** Qwen3 and Qwen3.5 produce a thinking block unless told not to. */
const thinks = (model: string) => /^Qwen3/.test(model);

export function createWebLLM({
  model = WEBLLM_DEFAULT_MODEL,
  records = [],
  contextWindowSize,
  debug = false,
  createEngine,
}: WebLLMOptions = {}): LLMProvider {
  let engine: MLCEngine | null = null;
  let loaded: string | null = null;
  let loading: Promise<MLCEngine> | null = null;
  const watching = new Set<(progress: PullProgress) => void>();
  const offered = catalogue(model, records);
  const note = debug
    ? (message: string, ...rest: unknown[]) => console.error(`[clearpen:webllm] ${message}`, ...rest)
    : () => {};

  /** Loads a model the first time, and swaps models afterwards. One at a time. */
  async function engineFor(target: string): Promise<MLCEngine> {
    if (engine && loaded === target) return engine;
    if (!loading) {
      loading = (async () => {
        if (!createEngine && !webllmSupported()) throw new Error('WebGPU is not available in this browser.');
        const create: CreateEngine = createEngine ?? (await import('@mlc-ai/web-llm')).CreateMLCEngine;
        const appConfig = await appConfigFor(contextWindowSize, records);
        let shown = -10;
        const report = (r: InitProgressReport) => {
          // `completed`/`total` are bytes on Ollama; here they carry a fraction.
          const progress: PullProgress = { status: r.text, completed: r.progress, total: 1, done: r.progress >= 1 };
          for (const watch of watching) watch(progress);
          const percent = Math.floor(r.progress * 100);
          if (percent >= shown + 10) {
            shown = percent;
            note('loading', `${percent}%`, r.text);
          }
        };
        if (engine) {
          note('switching model', target);
          await engine.reload(target);
          loaded = target;
          note('ready', target);
          return engine;
        }
        note('loading model', target);
        engine = await create(target, { appConfig, initProgressCallback: report, logLevel: 'WARN' });
        loaded = target;
        note('ready', target);
        return engine;
      })()
        .catch((err: unknown) => {
          console.error('[clearpen:webllm] the model could not be loaded:', err);
          throw err;
        })
        .finally(() => {
          loading = null;
        });
    }
    return loading;
  }

  const request = (req: ChatRequest, stream: boolean, useFormat = true): ChatCompletionRequest => ({
    messages: req.messages,
    stream,
    temperature: req.temperature,
    max_tokens: req.maxTokens,
    response_format:
      !req.format || !useFormat ? undefined : { type: 'json_object', schema: JSON.stringify(req.format) },
    ...(thinks(req.model) ? { extra_body: { enable_thinking: false } } : {}),
  });

  const interrupt = (eng: MLCEngine, signal?: AbortSignal) => {
    const stop = () => void eng.interruptGenerate();
    signal?.addEventListener('abort', stop, { once: true });
    return () => signal?.removeEventListener('abort', stop);
  };

  /**
   * Applies stop strings on this side. WebLLM writes the empty thinking block
   * it puts before a Qwen3 answer into the generated text (`enable_thinking:
   * false`), and it checks stop strings against that text — so "\n\n" matches
   * inside `<think>\n\n</think>\n\n` and ends the answer before it starts.
   */
  const streamStop = (stops: string[] | undefined) => {
    const list = (stops ?? []).filter(Boolean);
    const hold = list.length ? Math.max(...list.map((s) => s.length)) - 1 : 0;
    let pending = '';
    let stopped = false;
    return {
      get stopped() {
        return stopped;
      },
      push(text: string): string {
        pending += text;
        if (!list.length) {
          const out = pending;
          pending = '';
          return out;
        }
        let cut = -1;
        for (const s of list) {
          const at = pending.indexOf(s);
          if (at !== -1 && (cut === -1 || at < cut)) cut = at;
        }
        if (cut !== -1) {
          stopped = true;
          const out = pending.slice(0, cut);
          pending = '';
          return out;
        }
        // Keep back a tail that could still become a stop string.
        if (pending.length <= hold) return '';
        const out = pending.slice(0, pending.length - hold);
        pending = pending.slice(-hold);
        return out;
      },
      flush(): string {
        const out = pending;
        pending = '';
        return out;
      },
    };
  };

  /** The tail of the prompt, so a debug log pairs an answer with what was asked. */
  const asked = (req: ChatRequest): string => {
    const last = [...req.messages].reverse().find((m) => m.role === 'user');
    return typeof last?.content === 'string' ? last.content.slice(-400).replace(/\s+/g, ' ') : '';
  };

  /** Cuts a finished answer at its first stop string, as a server would. */
  const cutAtStop = (text: string, stops: string[] | undefined): string => {
    let out = text;
    for (const s of stops ?? []) {
      const at = out.indexOf(s);
      if (at !== -1) out = out.slice(0, at);
    }
    return out;
  };

  /** Drops a thinking block — closed, or still open when tokens ran out. */
  const withoutThinking = (text: string): string => {
    const clean = text.replace(/<think>[\s\S]*?<\/think>\s*/g, '');
    const open = clean.indexOf('<think>');
    return open === -1 ? clean : clean.slice(0, open);
  };

  async function* stream(req: ChatRequest, info: StreamInfo = {}): AsyncGenerator<string> {
    const eng = await engineFor(req.model);
    const done = interrupt(eng, req.signal);
    const started = performance.now();
    let first = 0;
    let raw = '';
    const think = thinkFilter();
    const stop = streamStop(req.stop);
    note('ask', req.model, asked(req));
    // The empty thinking block is followed by two newlines, which would be
    // visible text — and match a "\n\n" stop — before the answer starts.
    let begun = false;
    const trimStart = (text: string): string => {
      if (begun) return text;
      const cut = text.replace(/^\s+/, '');
      if (cut) begun = true;
      return cut;
    };
    try {
      const answer = (await eng.chat.completions.create({
        ...request(req, true),
      })) as AsyncIterable<ChatCompletionChunk>;
      for await (const chunk of answer) {
        if (req.signal?.aborted) break;
        const choice = chunk.choices[0];
        if (choice?.finish_reason === 'length') info.truncated = true;
        const text = choice?.delta?.content;
        if (text) {
          raw += text;
          const visible = stop.push(trimStart(think(text)));
          if (visible) {
            if (!first) first = Math.round(performance.now() - started);
            yield visible;
          }
          if (stop.stopped) {
            void eng.interruptGenerate();
            break;
          }
        }
      }
      const tail = stop.stopped || req.signal?.aborted ? '' : stop.flush();
      if (tail) yield tail;
    } finally {
      done();
      note(
        'stream',
        req.model,
        `${Math.round(performance.now() - started)}ms (first ${first}ms), ${raw.length} characters:`,
        raw.slice(0, 300).replace(/\s+/g, ' '),
      );
    }
  }

  async function complete(req: ChatRequest): Promise<string> {
    const eng = await engineFor(req.model);
    note('ask', req.model, asked(req));
    const once = async (useFormat: boolean) => {
      const done = interrupt(eng, req.signal);
      try {
        const answer = (await eng.chat.completions.create({
          ...request(req, false, useFormat),
        })) as ChatCompletion;
        return answer.choices[0]?.message?.content ?? '';
      } finally {
        done();
      }
    };
    try {
      const at = performance.now();
      const text = cutAtStop(withoutThinking(await once(true)), req.stop);
      note(
        'complete',
        `${req.model}${req.format ? ' (json)' : ''}`,
        `${Math.round(performance.now() - at)}ms:`,
        text.slice(0, 300).replace(/\s+/g, ' '),
      );
      return text;
    } catch (err) {
      // A grammar the engine can't build shouldn't cost the writer the answer:
      // ask again unconstrained; the prompt still says JSON and we parse it.
      if (!req.format || req.signal?.aborted) throw err;
      console.error('[clearpen:webllm] JSON-constrained request failed; retrying without it:', err);
      const at = performance.now();
      const text = cutAtStop(withoutThinking(await once(false)), req.stop);
      note(
        'complete',
        `${req.model} (unconstrained)`,
        `${Math.round(performance.now() - at)}ms:`,
        text.slice(0, 300).replace(/\s+/g, ' '),
      );
      return text;
    }
  }

  async function listModels(signal?: AbortSignal): Promise<string[]> {
    if (signal?.aborted) throw new Error('The request was cancelled.');
    if (!webllmSupported()) throw new Error('WebGPU is not available in this browser.');
    // Every offered model is selectable; the chosen one downloads on first use.
    return offered;
  }

  /** Loads the model, reporting download progress as it goes. */
  async function* pull(target: string, opts: { signal?: AbortSignal } = {}): AsyncIterable<PullProgress> {
    const queue: PullProgress[] = [];
    let wake: (() => void) | null = null;
    const watch = (p: PullProgress) => {
      queue.push(p);
      wake?.();
      wake = null;
    };
    const stopped = () => {
      wake?.();
      wake = null;
    };
    watching.add(watch);
    opts.signal?.addEventListener('abort', stopped, { once: true });
    const done = engineFor(target);
    try {
      while (true) {
        while (queue.length) yield queue.shift()!;
        if (opts.signal?.aborted) return;
        const finished = await Promise.race([
          done.then(() => true),
          new Promise<boolean>((resolve) => {
            wake = () => resolve(false);
          }),
        ]);
        if (finished) {
          while (queue.length) yield queue.shift()!;
          return;
        }
      }
    } finally {
      watching.delete(watch);
      opts.signal?.removeEventListener('abort', stopped);
    }
  }

  function describeError(err: unknown): string {
    const text = err instanceof Error ? err.message : String(err);
    if (/webgpu|gpu adapter|navigator\.gpu|not available/i.test(text))
      return 'This browser can’t run the model in the page: WebGPU is off or unsupported. Try a recent Chrome, Edge or Safari with hardware acceleration on.';
    if (/out of memory|oom|device lost|device was lost/i.test(text))
      return 'The model ran out of memory in this tab. Close other tabs, or choose a smaller model.';
    if (/failed to fetch|network|404|integrity/i.test(text))
      return 'The model couldn’t be downloaded. Check your connection, and try again.';
    return `The browser model failed: ${text}`;
  }

  return {
    kind: 'webllm',
    baseUrl: 'this browser',
    listModels,
    stream,
    complete,
    isLoaded: async (m) => loaded === m,
    preload: async (m) => void (await engineFor(m)),
    acceptsModel: (m) => offered.includes(m),
    pull,
    describeError,
  };
}
