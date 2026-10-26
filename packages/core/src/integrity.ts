// The facts a rewrite must never change silently: numbers, money, percentages,
// multiples, dates, tickers, versions, URLs and code. Every AI suggestion is
// checked against the text it replaces, and anything added, dropped or
// altered is flagged on the suggestion itself.

type FactKind = 'code' | 'url' | 'ticker' | 'version' | 'number';

const KINDS: [FactKind, RegExp][] = [
  // Order matters: each pattern blanks what it matched before the next runs,
  // so a version or a code span is never re-read as a bare number.
  ['code', /```[\s\S]*?```|`[^`\n]+`/g],
  // Trailing punctuation belongs to the sentence, not the link.
  ['url', /\bhttps?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"’”]/g],
  ['ticker', /\b(?:NYSE|NASDAQ|AMEX|LSE|TSX|ASX|HKEX)\s*:\s*[A-Z][A-Z.]{0,5}\b|\$[A-Z]{1,5}\b(?![\d.])/g],
  ['version', /\bv?\d+\.\d+\.\d+(?:[-.][\w.]+)?\b|\bv\d+(?:\.\d+)?\b/g],
  [
    'number',
    /(?:[$€£¥₹]\s?)?[-+−]?\d(?:[\d,]*\d)?(?:\.\d+)?(?:\s?(?:%|x\b|×|bps\b|pp\b|[kKmMbBtT]n?\b|MM\b|million\b|billion\b|trillion\b))?/g,
  ],
];

const blankOut = (s: string, from: number, to: number) => s.slice(0, from) + ' '.repeat(to - from) + s.slice(to);

function normalise(kind: FactKind, raw: string): string {
  let t = raw.trim();
  if (kind === 'number') {
    t = t.replace(/\s+/g, '').replace(/−/g, '-').replace(/×/g, 'x').toLowerCase();
    // "1,200" and "1200" are the same figure.
    t = t.replace(/(\d),(?=\d{3}\b)/g, '$1');
  }
  if (kind === 'code') t = t.replace(/\s+/g, ' ');
  return `${kind}:${t}`;
}

/** Every protected fact in `text`, as a multiset: normalised key → { n, raw }. */
export function facts(text: string): Map<string, { n: number; raw: string }> {
  // Ordered-list markers ("1. ", "12) ") are structure, not figures.
  let rest = String(text).replace(/^(\s*)\d+[.)](?=\s)/gm, (m) => ' '.repeat(m.length));
  const out = new Map<string, { n: number; raw: string }>();
  for (const [kind, re] of KINDS) {
    const hits = [...rest.matchAll(re)].filter((m) => m[0].trim());
    for (const m of hits) {
      const key = normalise(kind, m[0]);
      const seen = out.get(key);
      if (seen) seen.n++;
      else out.set(key, { n: 1, raw: m[0].trim() });
      rest = blankOut(rest, m.index, m.index + m[0].length);
    }
  }
  return out;
}

const kindOf = (key: string) => key.slice(0, key.indexOf(':')) as FactKind;

export interface FactChange {
  kind: FactKind;
  raw: string;
}

/** What `after` added and what it lost, compared with `before`. */
export function compare(before: string, after: string): { removed: FactChange[]; added: FactChange[] } {
  const a = facts(before);
  const b = facts(after);
  const removed: FactChange[] = [];
  const added: FactChange[] = [];
  for (const [k, v] of a) for (let i = b.get(k)?.n || 0; i < v.n; i++) removed.push({ kind: kindOf(k), raw: v.raw });
  for (const [k, v] of b) for (let i = a.get(k)?.n || 0; i < v.n; i++) added.push({ kind: kindOf(k), raw: v.raw });
  return { removed, added };
}

/** A short warning for a suggestion, or '' when every fact survived. */
export function warning(before: string, after: string, { allowDrops = false } = {}): string {
  const { removed, added } = compare(before, after);
  const lost = allowDrops ? [] : removed;
  if (!lost.length && !added.length) return '';
  const parts: string[] = [];
  // Pair a lost figure with an added one of the same kind: that's a change.
  const pool = [...added];
  for (const r of lost) {
    const j = pool.findIndex((x) => x.kind === r.kind);
    if (j !== -1) parts.push(`${r.raw} → ${pool.splice(j, 1)[0]!.raw}`);
    else parts.push(`drops ${r.raw}`);
  }
  for (const x of pool) parts.push(`adds ${x.raw}`);
  const shown = parts.slice(0, 3).map((p) => (p.length > 40 ? `${p.slice(0, 38)}…` : p));
  return `Check: ${shown.join(', ')}${parts.length > 3 ? ` (+${parts.length - 3} more)` : ''}`;
}

/** Facts in new text that appear nowhere in the reference material — possible inventions. */
export function inventions(newText: string, reference: string): string[] {
  const known = facts(reference);
  const fresh: string[] = [];
  for (const [k, v] of facts(newText)) if (!known.has(k) && kindOf(k) !== 'code') fresh.push(v.raw);
  return fresh;
}
