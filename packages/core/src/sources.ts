// The writer's sources: pages they saved with the article, or text they
// pasted, kept as Markdown. A suggestion or a check is given the few passages
// that bear on what is being written, never the whole page — a 2,000-word
// page is four times what a small model is shown for a suggestion, and the
// one passage that matters drowns in the rest.
//
// - BM25 over windows about a paragraph long finds the passage, in well under
//   a millisecond.
// - Each window brings the opening of its section: the detail that matches the
//   draft ("APID-11887") is rarely where the source states what it shows.
// - When BM25 has a clear winner, that is the passage. Only when it hasn't
//   does the model pick among the best few, by number, as the judge names
//   sentences; code keeps only numbers that name a window.

import { CREDENTIAL_MASK, contentWords, maskSecrets } from './autocomplete.ts';

export interface Source {
  id: string;
  /** Where it came from; '' for text the writer pasted. */
  url: string;
  title: string;
  /** The page's text, as Markdown. */
  markdown: string;
  /** When it was fetched or pasted, in ms. */
  addedAt: number;
}

export const MAX_SOURCES = 12;
export const MAX_SOURCE_CHARS = 200_000;

/** The sources in a brief, cleaned: what the library stores. */
export function normaliseSources(v: unknown): Source[] {
  if (!Array.isArray(v)) return [];
  const s = (x: unknown, n: number) => String(x ?? '').slice(0, n);
  return v
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({
      id: s(x.id, 64),
      url: /^https?:\/\//i.test(String(x.url ?? '')) ? s(x.url, 2000) : '',
      title: s(x.title, 300).replace(/\s+/g, ' ').trim(),
      markdown: s(x.markdown, MAX_SOURCE_CHARS),
      addedAt: Number.isFinite(x.addedAt) ? Number(x.addedAt) : 0,
    }))
    .filter((x) => x.id && x.markdown.trim())
    .slice(0, MAX_SOURCES);
}

/** The writer's notes and saved sources as one text: what a figure in the draft may be checked against. */
export const sourcesText = (brief?: { notes?: string; sources?: Source[] }): string =>
  [brief?.notes ?? '', ...(brief?.sources ?? []).map((s) => s.markdown)].filter((t) => t.trim()).join('\n\n');

// ─────────────────────────────────────────────────────────── windows

/**
 * A piece of a source under its section's heading: a paragraph, list, table
 * or code block — with the block after it when it is a lead-in ("one of
 * which, verbatim:"). Packing paragraphs to a size instead puts a passage
 * beside a stranger and cuts it from the line it introduces.
 */
export interface SourceWindow {
  /** 1-based across all the sources: the number a model names. */
  id: number;
  source: Source;
  heading: string;
  text: string;
  /** The first window of its section, whose opening says what the section is about. */
  sectionStart: number;
  terms: string[];
}

const WINDOW_CHARS = 700;
const LEAD_CHARS = 400;

interface Piece {
  heading: string;
  text: string;
  /** Opens a section. */
  first: boolean;
  terms: string[];
}

/** The Markdown's blocks: blank lines part them, except inside a code fence. */
function blocks(markdown: string): string[] {
  const out: string[] = [];
  let cur: string[] = [];
  let fence = false;
  for (const line of markdown.split('\n')) {
    if (/^\s*(?:```|~~~)/.test(line)) fence = !fence;
    if (!fence && !line.trim()) {
      if (cur.length) out.push(cur.join('\n'));
      cur = [];
    } else cur.push(line);
  }
  if (cur.length) out.push(cur.join('\n'));
  return out;
}

/** A block too long for one window, cut between sentences (a code block, between lines). */
function cut(block: string): string[] {
  if (block.length <= WINDOW_CHARS) return [block];
  const parts = /^\s*(?:```|~~~)/.test(block) ? block.split(/(?<=\n)/) : block.split(/(?<=[.!?…]["”’)]*)\s+/);
  const out: string[] = [];
  let cur = '';
  for (const p of parts) {
    if (cur && cur.length + p.length > WINDOW_CHARS) {
      out.push(cur.trim());
      cur = '';
    }
    cur += cur && !cur.endsWith('\n') ? ` ${p}` : p;
    while (cur.length > WINDOW_CHARS * 2) {
      out.push(cur.slice(0, WINDOW_CHARS));
      cur = cur.slice(WINDOW_CHARS);
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** A block that belongs with the one after it: a lead-in, ending on the colon that introduces it. */
const leadsOn = (text: string) => /:["”’)]*$/.test(text.trim());

/** A section's opening as a passage shows it: its first paragraph, in whole sentences, never code. */
function leadOf(text: string): string {
  const para = text.split(/\n\s*\n/)[0]!.trim();
  if (/^(?:```|~~~|\|)/.test(para)) return '';
  if (para.length <= LEAD_CHARS) return para;
  let out = '';
  for (const s of para.match(/[^.!?…]+[.!?…]+["”’)]*\s*/g) ?? []) {
    if (out && out.length + s.length > LEAD_CHARS) break;
    out += s;
  }
  return (out || para.slice(0, LEAD_CHARS)).trim();
}

const pieceCache = new WeakMap<Source, Piece[]>();

function pieces(source: Source): Piece[] {
  const known = pieceCache.get(source);
  if (known) return known;
  const out: Piece[] = [];
  let heading = '';
  let cur = '';
  let first = true;
  const flush = () => {
    if (!cur.trim()) return;
    out.push({ heading, text: cur.trim(), first, terms: contentWords(`${heading} ${cur}`) });
    cur = '';
    first = false;
  };
  for (const block of blocks(source.markdown)) {
    const h = block.match(/^#{1,6}\s+(.+)$/);
    if (h && !block.includes('\n')) {
      flush();
      heading = h[1]!.replace(/\s+/g, ' ').trim();
      first = true;
      continue;
    }
    for (const part of cut(block)) {
      if (cur && (!leadsOn(cur) || cur.length + part.length > WINDOW_CHARS)) flush();
      cur += `${part}\n\n`;
    }
  }
  flush();
  pieceCache.set(source, out);
  return out;
}

/** Every source's windows, numbered across them all. */
export function sourceWindows(sources: Source[] = []): SourceWindow[] {
  const out: SourceWindow[] = [];
  for (const source of sources) {
    let start = 0;
    for (const p of pieces(source)) {
      const id = out.length + 1;
      if (p.first || !start) start = id;
      out.push({ id, source, heading: p.heading, text: p.text, sectionStart: start, terms: p.terms });
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────── search

export interface Ranked {
  window: SourceWindow;
  score: number;
}

/** Okapi BM25 over the windows, the heading counting as part of each. */
export function rankWindows(windows: SourceWindow[], query: string): Ranked[] {
  const q = [...new Set(contentWords(query))];
  if (!q.length || !windows.length) return [];
  const avg = windows.reduce((a, w) => a + w.terms.length, 0) / windows.length || 1;
  const df = new Map<string, number>();
  for (const w of windows) for (const t of new Set(w.terms)) df.set(t, (df.get(t) ?? 0) + 1);
  const k1 = 1.2;
  const b = 0.75;
  return windows
    .map((window) => {
      let score = 0;
      for (const t of q) {
        const n = df.get(t);
        if (!n) continue;
        let tf = 0;
        for (const x of window.terms) if (x === t) tf++;
        if (!tf) continue;
        const idf = Math.log(1 + (windows.length - n + 0.5) / (n + 0.5));
        score += (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * window.terms.length) / avg));
      }
      return { window, score };
    })
    .filter((r) => r.score > 0)
    .sort((x, y) => y.score - x.score);
}

/** What a suggestion searches with: the paragraph being written and the two before it ("What can we see here?" alone names nothing). */
export const sourceQuery = (before: string): string =>
  before
    .split(/\n\s*\n/)
    .slice(-3)
    .join('\n\n')
    .slice(-2000);

/** The best few windows: what the model chooses among when it is asked to. */
export const SHORTLIST = 6;
/** At most this many passages reach a prompt. */
export const MAX_PASSAGES = 2;
/** BM25's best is the passage, without asking, when it scores this many times the next. */
export const DECISIVE = 2;

export const isDecisive = (ranked: Ranked[]): boolean =>
  ranked.length === 1 || (ranked.length > 1 && ranked[0]!.score >= DECISIVE * ranked[1]!.score);

// ─────────────────────────────────────────────────────────── passages

/** What a prompt is given from a source: a window, with the opening of its section when that is elsewhere. */
export interface Passage {
  id: number;
  title: string;
  url: string;
  heading: string;
  /** The section's opening, or '' when the window is it. */
  lead: string;
  text: string;
}

/** The windows named by `ids` (unknown ones dropped), at most `n`, each with its section's opening. */
export function passagesFor(windows: SourceWindow[], ids: number[], n = MAX_PASSAGES): Passage[] {
  const byId = new Map(windows.map((w) => [w.id, w]));
  const chosen = [...new Set(ids)]
    .map((id) => byId.get(id))
    .filter((w): w is SourceWindow => !!w)
    .slice(0, n);
  const shown = new Set(chosen.map((w) => w.id));
  return chosen.map((w) => {
    const start = byId.get(w.sectionStart);
    const lead = start && !shown.has(start.id) ? leadOf(start.text) : '';
    return { id: w.id, title: w.source.title, url: w.source.url, heading: w.heading, lead, text: w.text };
  });
}

/** Where a passage comes from, for the writer: the page, and its section. */
export const citation = (p: Pick<Passage, 'title' | 'url' | 'heading'>): string =>
  `${p.title || p.url || 'a pasted note'}${p.heading ? `, “${p.heading}”` : ''}`;

/** BM25's best passages for a query, without asking a model: for checks, where the passage checked is the query. */
export function searchPassages(sources: Source[] | undefined, query: string, n = MAX_PASSAGES): Passage[] {
  const windows = sourceWindows(sources);
  const ranked = rankWindows(windows, query);
  const ids = isDecisive(ranked) ? ranked.slice(0, 1) : ranked.slice(0, n);
  return passagesFor(
    windows,
    ids.map((r) => r.window.id),
  );
}

// A connection string carries its password in the middle of a host name, so
// masking the password alone still leaves a line a model copies whole.
// It runs to the next space, query and all ({"rejectUnauthorized":true}), less a trailing full stop or comma.
const CREDENTIAL_URL = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/?#@:]+:[^\s/?#@]+@\S*[^\s.,;:!?)\]>"'`]/gi;

/** A source's text as a prompt may show it: connection strings and keys masked. */
export const maskSource = (text: string): string => maskSecrets(text.replace(CREDENTIAL_URL, CREDENTIAL_MASK));
