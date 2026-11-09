// Ollama's model library, as the app reads it: the models ollama.com/library
// lists, and the tags (sizes, quantisations) a model comes in. Only what the
// picker needs: a name to pull, a description, and roughly what it costs.

export const OLLAMA_LIBRARY = 'https://ollama.com/library';

/** One model on ollama.com/library, before a size is chosen. */
export interface CatalogModel {
  /** Ollama's name for it, e.g. "qwen3.5". */
  name: string;
  description: string;
  /** Parameter sizes it comes in: "0.8b", "4b", "70b". */
  sizes: string[];
  /** What it can do: "tools", "thinking", "vision", "audio", "embedding", "decision". */
  capabilities: string[];
  /** How long ago it changed, as the library says: "1 year ago". */
  updated?: string;
  /** How many tags the model has. */
  tags?: number;
}

/** One downloadable version of a model: `qwen3.5:4b`. */
export interface CatalogTag {
  /** The part after the colon: "4b", "latest", "8b-q4_K_M". */
  name: string;
  /** The download, in bytes, when the page says. */
  bytes?: number;
  /** The context window it runs at, e.g. "40K". */
  context?: string;
  /** Ollama points the bare model name at this one. */
  latest: boolean;
  /** A quantisation of another tag, e.g. `8b-q4_K_M`. */
  quantized: boolean;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  '#39': "'",
  nbsp: ' ',
};

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#?\w+);/g, (m, e: string) => ENTITIES[e] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

function bytes(size: string): number | undefined {
  const m = /([\d.]+)\s*(GB|MB)/i.exec(size);
  if (!m) return undefined;
  return Number(m[1]) * (m[2].toUpperCase() === 'GB' ? 1e9 : 1e6);
}

/**
 * The models on `ollama.com/library`. The page is one card per model; the
 * badge classes are what tells a capability from a size.
 */
export function parseOllamaLibrary(html: string): CatalogModel[] {
  const models: CatalogModel[] = [];
  const cards = /<a href="\/library\/([^"/]+)" class="group w-full space-y-5">([\s\S]*?)<\/a>/g;
  for (const [, name, card] of html.matchAll(cards)) {
    const description = /<p class="max-w-lg[^"]*">([\s\S]*?)<\/p>/.exec(card)?.[1];
    const capabilities = [...card.matchAll(/rounded-md bg-indigo-50[^"]*">([^<]+)</g)].map((m) => text(m[1]));
    const sizes = [...card.matchAll(/rounded-md bg-\[#ddf4ff\][^"]*">([^<]+)</g)].map((m) => text(m[1]));
    const updated = /<span\s*>([^<]*\bago)<\/span>/.exec(card)?.[1];
    const tags = /<span\s*>(\d+)<\/span>\s*<span class="hidden sm:flex">&nbsp;Tags<\/span>/.exec(card)?.[1];
    models.push({
      name: text(name),
      description: description ? text(description) : '',
      sizes,
      capabilities,
      ...(updated ? { updated } : {}),
      ...(tags ? { tags: Number(tags) } : {}),
    });
  }
  return models;
}

/** Only the models that can write: embeddings and rerankers can't. */
export function writerModels(models: readonly CatalogModel[]): CatalogModel[] {
  return models.filter((m) => !m.capabilities.includes('embedding'));
}

/** Models matching every word of `query`, best first: name matches before description matches. */
export function searchModels(models: readonly CatalogModel[], query: string, limit = 40): CatalogModel[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return models.slice(0, limit);
  const found: { model: CatalogModel; rank: number }[] = [];
  for (const model of models) {
    const name = model.name.toLowerCase();
    const haystack = `${name} ${model.sizes.join(' ')} ${model.description.toLowerCase()}`;
    if (!words.every((w) => haystack.includes(w))) continue;
    const rank = words.every((w) => name.includes(w)) ? (name.startsWith(words[0]!) ? 0 : 1) : 2;
    found.push({ model, rank });
  }
  return found
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((f) => f.model);
}

/**
 * The tags on a model's page (`/library/qwen3.5/tags`). The page shows each
 * twice, once for narrow screens and once for wide; the narrow one is simpler
 * to read, and duplicates are dropped.
 */
export function parseOllamaTags(html: string): CatalogTag[] {
  const tags = new Map<string, CatalogTag>();
  const rows =
    /<a href="\/library\/[^"/]+:([^"/]+)" class="md:hidden flex flex-col space-y-\[6px\] group">([\s\S]*?)<\/a>/g;
  for (const [, name, row] of html.matchAll(rows)) {
    if (tags.has(name)) continue;
    const size = /•\s*([\d.]+\s*(?:GB|MB))/.exec(row)?.[1];
    const context = /•\s*([\d.]+\s*[KM]?)\s*context window/.exec(row)?.[1]?.replace(/\s+/g, '');
    tags.set(name, {
      name,
      ...(size ? { bytes: bytes(size) } : {}),
      ...(context ? { context } : {}),
      latest: />latest</.test(row),
      quantized: /-(?:q|iq|fp)\d/i.test(name),
    });
  }
  return [...tags.values()].sort((a, b) => {
    if (a.latest !== b.latest) return a.latest ? -1 : 1;
    if (a.name === 'latest' || b.name === 'latest') return a.name === 'latest' ? -1 : 1;
    return Number(a.quantized) - Number(b.quantized);
  });
}

/** The version to pull when the writer picks a model and no tag: Ollama's default. */
export function defaultTag(tags: readonly CatalogTag[]): CatalogTag | undefined {
  return tags.find((t) => t.latest) ?? tags.find((t) => t.name === 'latest') ?? tags.find((t) => !t.quantized);
}

/** The versions worth showing, without the many quantisations of each. */
export function mainTags(tags: readonly CatalogTag[]): CatalogTag[] {
  const main = tags.filter((t) => !t.quantized);
  return main.length ? main : tags.slice(0, 12);
}
