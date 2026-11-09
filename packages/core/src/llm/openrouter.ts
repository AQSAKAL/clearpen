// OpenRouter: a hosted gateway to hundreds of models from many companies,
// through one key and one OpenAI-shaped API. The key belongs to the writer;
// Clearpen only sends it to openrouter.ai.

import { createOpenAICompatible } from './openai.ts';
import type { Fetch, LLMProvider, ModelInfo } from './types.ts';

export const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
/** Where OpenRouter can say what is using the key, as its docs ask. */
export const OPENROUTER_REFERER = 'https://github.com/AQSAKAL/clearpen';

/**
 * Good defaults for writing, in order, when the writer hasn't picked a model.
 * They are fast and inexpensive, and drawn from what OpenRouter serves; the
 * catalogue decides, so a retired id is simply skipped.
 */
export const OPENROUTER_PREFERRED = [
  'google/gemini-3.1-flash-lite',
  'anthropic/claude-haiku-5.5',
  'deepseek/deepseek-v4.1-flash',
  'openai/gpt-5.4-mini',
  'google/gemini-2.5-flash',
  'openai/gpt-4.1-mini',
];

/** One model from `GET /models`, as the picker shows it. */
export interface OpenRouterModel extends ModelInfo {
  /** The catalogue's own word for what it does, e.g. "text+image->text". */
  modality?: string;
  /** Input and output cost the same: no charge. */
  free?: boolean;
}

const price = (pricing: Record<string, unknown> | undefined, key: string): number | undefined => {
  const n = Number(pricing?.[key]);
  // OpenRouter uses -1 for "varies" (the auto router, BYOK-only models).
  return Number.isFinite(n) && n >= 0 ? n * 1e6 : undefined;
};

/**
 * The writing models in OpenRouter's catalogue: models that return text, not
 * batch-only entries, with their name, context and price. Image-only and
 * audio-only models have nothing to say to a writer.
 */
export function parseOpenRouterModels(data: unknown): OpenRouterModel[] {
  const list = (data as { data?: unknown })?.data;
  if (!Array.isArray(list)) return [];
  const models: OpenRouterModel[] = [];
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue;
    const m = raw as Record<string, unknown>;
    if (typeof m.id !== 'string' || m.id.endsWith(':batch')) continue;
    const architecture = m.architecture as { output_modalities?: unknown; modality?: unknown } | undefined;
    const outputs = Array.isArray(architecture?.output_modalities) ? architecture.output_modalities : [];
    if (!outputs.includes('text')) continue;
    const pricing = m.pricing as Record<string, unknown> | undefined;
    const input = price(pricing, 'prompt');
    const output = price(pricing, 'completion');
    const model: OpenRouterModel = {
      id: m.id,
      ...(typeof m.name === 'string' && m.name !== m.id ? { name: m.name } : {}),
      ...(typeof m.description === 'string' && m.description ? { description: m.description } : {}),
      ...(typeof m.context_length === 'number' && m.context_length > 0 ? { context: m.context_length } : {}),
      ...(input !== undefined ? { inputPrice: input } : {}),
      ...(output !== undefined ? { outputPrice: output } : {}),
      ...(typeof architecture?.modality === 'string' ? { modality: architecture.modality } : {}),
      ...(input === 0 || output === 0 ? { free: input === 0 && output === 0 } : {}),
    };
    models.push(model);
  }
  return models;
}

/** Models matching every word of `query`, best first: the id and name before the description. */
export function searchOpenRouterModels(
  models: readonly OpenRouterModel[],
  query: string,
  limit = 60,
): OpenRouterModel[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) {
    // OpenRouter lists its catalogue in no useful order (a cloaked model can
    // come first). Open on the models we know write well, then the rest —
    // and keep the unnamed "stealth" models out of the way unless searched for.
    const preferred = new Map(OPENROUTER_PREFERRED.map((id, i) => [id, i]));
    const rank = (m: OpenRouterModel) => preferred.get(m.id) ?? (m.id.startsWith('stealth/') ? 1000 : 100);
    return [...models].sort((a, b) => rank(a) - rank(b)).slice(0, limit);
  }
  const found: { model: OpenRouterModel; rank: number }[] = [];
  for (const model of models) {
    const id = model.id.toLowerCase();
    const name = (model.name ?? '').toLowerCase();
    const haystack = `${id} ${name} ${model.description?.toLowerCase() ?? ''}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    const rank = words.every((w) => id.includes(w) || name.includes(w))
      ? id.startsWith(words[0]!) || name.startsWith(words[0]!)
        ? 0
        : 1
      : 2;
    found.push({ model, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((f) => f.model);
}

/** The model to use from a catalogue, when the writer hasn't picked one. */
export function pickOpenRouterModel(
  models: readonly OpenRouterModel[],
  preferred = OPENROUTER_PREFERRED,
): string | null {
  for (const id of preferred) if (models.some((m) => m.id === id)) return id;
  return models[0]?.id ?? null;
}

export interface OpenRouterOptions {
  apiKey: string;
  fetch?: Fetch;
  /** The site OpenRouter can look at, for its rankings. */
  referer?: string;
  title?: string;
}

/**
 * OpenRouter through the OpenAI-compatible client, with its attribution
 * headers and its own catalogue. The key is passed in from the app's secret
 * store; it is never written to a settings file or a log.
 */
export function createOpenRouter({
  apiKey,
  fetch,
  referer = OPENROUTER_REFERER,
  title = 'Clearpen',
}: OpenRouterOptions): LLMProvider {
  const key = apiKey.trim();
  if (!key) throw new Error('An OpenRouter API key is needed.');
  return createOpenAICompatible({
    baseUrl: OPENROUTER_BASE,
    apiKey: key,
    fetch,
    kind: 'openrouter',
    headers: { 'HTTP-Referer': referer, 'X-Title': title },
    strictModels: true,
    parseCatalogue: parseOpenRouterModels,
  });
}
