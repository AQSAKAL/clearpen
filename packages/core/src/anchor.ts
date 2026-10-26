// Finds where a quoted passage lives in the draft. Models copy quotes almost —
// but not quite — character for character: curly quotes become straight,
// Markdown asterisks vanish, whitespace changes. This maps through all that.

export interface Span {
  from: number;
  to: number;
}

interface Folded {
  out: string;
  /** For each character of `out`, its position in the original text. */
  map: number[];
}

const FOLD: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '\u00a0': ' ', // no-break space
};

/** Normalises text while remembering, for each output character, where it came from. */
export function fold(text: string): Folded {
  let out = '';
  const map: number[] = [];
  let lastSpace = true;
  for (let i = 0; i < text.length; i++) {
    let ch = FOLD[text[i]!] ?? text[i]!;
    if (ch === '*' || ch === '_' || ch === '`') continue; // Markdown emphasis
    if (/\s/.test(ch)) {
      if (lastSpace) continue;
      ch = ' ';
      lastSpace = true;
    } else {
      lastSpace = false;
    }
    // Lower-case per character, keeping a one-to-one map even when a
    // character lower-cases to several (e.g. "İ").
    for (const c of ch.toLowerCase()) {
      out += c;
      map.push(i);
    }
  }
  return { out, map };
}

function span(folded: Folded, start: number, length: number): Span {
  return { from: folded.map[start]!, to: folded.map[start + length - 1]! + 1 };
}

/**
 * Locates `quote` in `doc`. Prefers a match at or after `after`, so notes
 * quoting a repeated phrase land in order.
 */
export function findQuote(doc: string, quote: string, after = 0, folded: Folded = fold(doc)): Span | null {
  const q = String(quote || '').trim();
  if (q.length < 3) return null;

  let i = doc.indexOf(q, after);
  if (i === -1) i = doc.indexOf(q);
  if (i !== -1) return { from: i, to: i + q.length };

  const fq = fold(q).out.trim();
  if (fq.length < 3) return null;
  const startAt = folded.map.findIndex((pos) => pos >= after);
  let j = startAt === -1 ? -1 : folded.out.indexOf(fq, startAt);
  if (j === -1) j = folded.out.indexOf(fq);
  if (j !== -1) return span(folded, j, fq.length);

  // Last resort for long quotes: anchor on the first and last few words.
  const words = fq.split(' ');
  if (words.length >= 8) {
    const lead = words.slice(0, 5).join(' ');
    const tail = words.slice(-5).join(' ');
    let a = startAt === -1 ? -1 : folded.out.indexOf(lead, startAt);
    if (a === -1) a = folded.out.indexOf(lead);
    if (a !== -1) {
      const b = folded.out.indexOf(tail, a + lead.length);
      if (b !== -1 && b - a < fq.length * 1.6) return span(folded, a, b + tail.length - a);
    }
  }
  return null;
}

/**
 * Places notes one at a time, as they arrive, in document order: each new
 * note is searched for after the previous one, and a note overlapping one
 * already placed is dropped.
 */
export function createAnchorer(doc: string) {
  const folded = fold(doc);
  const placed: Span[] = [];
  let cursor = 0;
  return <T extends { quote: string }>(note: T): (T & Span) | null => {
    const hit = findQuote(doc, note.quote, cursor, folded);
    if (!hit) return null;
    if (placed.some((p) => hit.from < p.to && hit.to > p.from)) return null;
    placed.push(hit);
    cursor = hit.from;
    return { ...note, ...hit };
  };
}

/** Anchors a whole list of notes at once. */
export function anchorNotes<T extends { quote: string }>(doc: string, notes: T[]): (T & Span)[] {
  const place = createAnchorer(doc);
  return notes
    .map((n) => place(n))
    .filter((n): n is T & Span => n !== null)
    .sort((a, b) => a.from - b.from);
}
