import type { ChatMessage, JsonSchema } from '../prompts.ts';

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  /** Constrain the answer to this JSON Schema (where the engine supports it). */
  format?: JsonSchema;
  signal?: AbortSignal;
}

/** Filled in as a stream runs. */
export interface StreamInfo {
  /** True when the model stopped because it hit `maxTokens`. */
  truncated?: boolean;
}

/** A model server: Ollama, or anything that speaks the OpenAI API. */
export interface LLMProvider {
  readonly kind: string;
  readonly baseUrl: string;
  listModels(signal?: AbortSignal): Promise<string[]>;
  /**
   * Streams the answer as text chunks. Yields an empty string for traffic
   * that carried no visible text (so callers can tell the model is alive).
   */
  stream(req: ChatRequest, info?: StreamInfo): AsyncIterable<string>;
  /** The whole answer at once. */
  complete(req: ChatRequest): Promise<string>;
  /** Is the model already in memory? Servers that can't tell say yes. */
  isLoaded(model: string): Promise<boolean>;
  /** Loads the model ahead of the first request. Best-effort. */
  preload(model: string): Promise<void>;
  /** A sentence a writer can act on, for an error from this server. */
  describeError(err: unknown): string;
}

/** `fetch`, or a stand-in with the same shape (e.g. Tauri's HTTP plugin). */
export type Fetch = typeof globalThis.fetch;
