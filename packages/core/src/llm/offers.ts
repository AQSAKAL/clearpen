// The models Clearpen offers to download when there's none yet: the one that
// edits best, and a lighter one for computers with less memory. The sizes
// are Ollama's downloads.

export interface ModelOffer {
  /** Ollama's name for it. */
  model: string;
  name: string;
  /** The download, in bytes. */
  bytes: number;
  /** The memory it wants to run alongside everything else, in GB. */
  memoryGB: number;
  note: string;
}

export const MODEL_OFFERS: readonly ModelOffer[] = [
  {
    model: 'qwen3:8b',
    name: 'Qwen3 8B',
    bytes: 5.23e9,
    memoryGB: 16,
    note: 'The sharpest edits and checks. For computers with 16 GB of memory or more.',
  },
  {
    // The instruct build: the plain "qwen3:4b" is a model that always thinks,
    // and its thinking spills into answers.
    model: 'qwen3:4b-instruct',
    name: 'Qwen3 4B',
    bytes: 2.5e9,
    memoryGB: 8,
    note: 'Lighter and quicker, for 8 GB of memory. Its edits are a little less sharp.',
  },
];

/** The offer that suits a computer with `memory` bytes — the best one when that's unknown. */
export function recommendedOffer(memory: number | null | undefined): ModelOffer {
  const offers = MODEL_OFFERS;
  if (!memory) return offers[0]!;
  // "16 GB" machines report a little less.
  const gb = memory / 2 ** 30 + 0.5;
  return offers.find((o) => gb >= o.memoryGB) ?? offers[offers.length - 1]!;
}

/** "5.2 GB", "480 MB". */
export function formatBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(n >= 1e10 ? 0 : 1)} GB`;
  if (n >= 1e6) return `${Math.round(n / 1e6)} MB`;
  return `${Math.max(0, Math.round(n / 1e3))} KB`;
}
