// Turns "here is the whole passage again, slightly different" into the few
// places that actually changed. A word-level Myers diff, then grouped the way
// an editor marks up a page: changed words, or the whole sentence when most of
// it changed.

// A figure ("$1,200", "14.5%") is one token, so a changed number is shown whole.
const TOKEN = /\s+|[$€£¥]?\d[\d,.]*\d%?|[$€£¥]?\d%?|[\p{L}\p{N}_’'-]+|[^\s\p{L}\p{N}_’'-]/gu;

export function tokens(s: string): string[] {
  return s.match(TOKEN) || [];
}

export interface Run {
  op: '=' | '-' | '+';
  /** Token range [start, end) in the old list. */
  a: [number, number];
  /** Token range [start, end) in the new list. */
  b: [number, number];
}

/**
 * Myers' O(ND) diff over tokens — or null when the texts differ in more than
 * `maxD` tokens (then they are better treated as one replacement).
 */
export function diffTokens(a: string[], b: string[], maxD = 2400): Run[] | null {
  const n = a.length;
  const m = b.length;
  const max = Math.min(n + m, maxD);
  const off = max + 1;
  let v: Int32Array = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  let found = -1;
  for (let d = 0; d <= max && found === -1; d++) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? v[off + k + 1]! : v[off + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[off + k] = x;
      if (x >= n && y >= m) {
        found = d;
        break;
      }
    }
  }
  if (found === -1) return null;
  // Walk back through the trace to recover the edit script.
  const steps: ['=' | '-' | '+', number, number][] = [];
  let x = n;
  let y = m;
  for (let d = found; d > 0; d--) {
    v = trace[d]!;
    const k = x - y;
    const prevK = k === -d || (k !== d && v[off + k - 1]! < v[off + k + 1]!) ? k + 1 : k - 1;
    const px = v[off + prevK]!;
    const py = px - prevK;
    while (x > px && y > py) {
      x--;
      y--;
      steps.push(['=', x, y]);
    }
    if (x === px) {
      y--;
      steps.push(['+', x, y]);
    } else {
      x--;
      steps.push(['-', x, y]);
    }
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    steps.push(['=', x, y]);
  }
  steps.reverse();
  const runs: Run[] = [];
  for (const [op, i, j] of steps) {
    const last = runs[runs.length - 1];
    if (last && last.op === op) {
      if (op !== '+') last.a[1] = i + 1;
      if (op !== '-') last.b[1] = j + 1;
      continue;
    }
    runs.push({ op, a: [i, op === '+' ? i : i + 1], b: [j, op === '-' ? j : j + 1] });
  }
  return runs;
}

/** One change to the old text: replace [from, to) with `insert`. */
export interface Hunk {
  from: number;
  to: number;
  insert: string;
}

interface Region {
  a0: number;
  a1: number;
  b0: number;
  b1: number;
  absorbed?: boolean;
}

const offsets = (toks: string[]) => {
  const out = [0];
  for (const t of toks) out.push(out[out.length - 1]! + t.length);
  return out;
};
const isSpace = (t: string) => /^\s+$/.test(t);
const ENDS_SENTENCE = /^(?:[.!?…]+|\n\s*)$/;

/**
 * The places where `after` differs from `before`, as edits to `before`, in
 * order and non-overlapping. Unchanged text is never part of an edit, except
 * to keep a mostly rewritten sentence whole.
 */
export function hunks(before: string, after: string): Hunk[] {
  if (before === after) return [];
  const a = tokens(before);
  const b = tokens(after);
  const runs = diffTokens(a, b);
  if (!runs) return [{ from: 0, to: before.length, insert: after }];
  const ao = offsets(a);

  // 1. Changed regions.
  const regions: Region[] = [];
  for (const r of runs) {
    if (r.op === '=') continue;
    const prev = regions[regions.length - 1];
    if (prev && prev.a1 === r.a[0] && prev.b1 === r.b[0]) {
      prev.a1 = r.a[1];
      prev.b1 = r.b[1];
      continue;
    }
    regions.push({ a0: r.a[0], a1: r.a[1], b0: r.b[0], b1: r.b[1] });
  }

  // 2. Merge regions on one line separated only by spaces, punctuation or one
  //    tiny word — "the quick" → "a fast" is one change, not two.
  const merged: Region[] = [];
  for (const r of regions) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const gap = a.slice(prev.a1, r.a0);
      const words = gap.filter((t) => !isSpace(t) && /[\p{L}\p{N}]/u.test(t));
      const sameLine = !gap.some((t) => t.includes('\n'));
      if (sameLine && (words.length === 0 || (words.length === 1 && words[0]!.length <= 3))) {
        prev.a1 = r.a1;
        prev.b1 = r.b1;
        continue;
      }
    }
    merged.push({ ...r });
  }

  // 3. A sentence mostly rewritten becomes one change, so it reads as a sentence.
  const spans: [number, number][] = [];
  let start = 0;
  for (let i = 0; i < a.length; i++) {
    if (ENDS_SENTENCE.test(a[i]!) || i === a.length - 1) {
      spans.push([start, i + 1]);
      start = i + 1;
    }
  }
  const out: Region[] = [];
  for (const [s0, s1] of spans) {
    const inside = merged.filter((r) => r.a0 >= s0 && r.a1 <= s1 && !(r.a0 === r.a1 && r.a0 === s0 && s0 !== 0));
    if (inside.length < 2) continue;
    const words = a.slice(s0, s1).filter((t) => !isSpace(t)).length || 1;
    const changed = inside.reduce((n, r) => n + a.slice(r.a0, r.a1).filter((t) => !isSpace(t)).length, 0);
    if (changed / words < 0.5) continue;
    const first = inside[0]!;
    const last = inside[inside.length - 1]!;
    for (const r of inside) r.absorbed = true;
    out.push({ a0: first.a0, a1: last.a1, b0: first.b0, b1: last.b1 });
  }
  for (const r of merged) if (!r.absorbed) out.push(r);
  out.sort((x, y) => x.a0 - y.a0);

  return (
    out
      .map((r) => ({ from: ao[r.a0]!, to: ao[r.a1]!, insert: b.slice(r.b0, r.b1).join('') }))
      // A change that only swaps one run of spaces for another isn't worth a click.
      .filter((h) => !(/^[ \t]*$/.test(before.slice(h.from, h.to)) && /^[ \t]*$/.test(h.insert)))
  );
}

/** Applies hunks (offsets into `text`) and returns the new text. */
export function applyHunks(text: string, changes: Hunk[]): string {
  let out = '';
  let pos = 0;
  for (const c of [...changes].sort((x, y) => x.from - y.from)) {
    out += text.slice(pos, c.from) + c.insert;
    pos = c.to;
  }
  return out + text.slice(pos);
}
