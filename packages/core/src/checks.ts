// Deterministic checks — the arithmetic, consistency and reasoning slips a
// language model misses or gets wrong with total confidence. Nothing here is
// guessed: each finding is computed from the text, and every calculation is
// reported as a plain fact so that Review and Ask can be told the verified
// result instead of doing the maths themselves. Pure functions; they run in
// the browser, on the server and in tests.

import { type Sentence, sentences } from './analysis.ts';
import type { Span } from './anchor.ts';
import { signpostFindings } from './signposts.ts';
import { styleFindings } from './style.ts';
import { termFindings } from './terms.ts';

/**
 * What kind of piece this is, which decides which checks run and how the
 * review reads it. `scientific` is a paper or research write-up: claims,
 * evidence, defined terms, a result stated early.
 */
export const GENRES = ['article', 'technical', 'scientific', 'business', 'investment'] as const;
export type Genre = (typeof GENRES)[number];

export type Category =
  | 'numbers'
  | 'factcheck'
  | 'logic'
  | 'consistency'
  | 'compliance'
  | 'procedure'
  | 'clarity'
  | 'concision'
  | 'structure'
  | 'evidence'
  | 'tone'
  | 'grammar'
  | 'style';

/** A number as written in the text. */
export interface NumberToken {
  /** In base units: "$2.56M" is 2,560,000. */
  value: number;
  unit: '' | '$' | '%' | 'x' | 'bps';
  /** Decimal places as written — the precision the author claims. */
  decimals: number;
  scale: number;
  suffix: string;
  currency: string;
  raw: string;
  index: number;
  length: number;
  /** For table cells scaled by their header: how to show the value ("1,240 ($M)"). */
  shown?: string;
}

export interface Finding extends Span {
  kind: string;
  category: Category;
  title: string;
  message: string;
  suggestion?: string;
  /** Another passage this one conflicts with. */
  related?: Span;
}

export interface Cell extends Span {
  text: string;
  num: NumberToken | null;
  blank: boolean;
}

export interface Row extends Span {
  label: string;
  cells: Cell[];
}

export interface Table extends Span {
  header: string[];
  rows: Row[];
}

export interface Section extends Span {
  title: string;
  level: number;
  headingFrom: number;
  headingTo: number;
}

interface Correction {
  wrong: string;
  right: string;
  label: string;
}

/** Everything one run of the checks shares. */
interface Ctx {
  text: string;
  genre: Genre;
  sources: string;
  S: Sentence[];
  T: Table[];
  SEC: Section[];
  out: Finding[];
  facts: string[];
  corrections: Correction[];
}

export interface CheckResult {
  findings: Finding[];
  /** Plain statements of every calculation made — right or wrong — for a model to treat as ground truth. */
  facts: string[];
}

// ─────────────────────────────────────────────────────────── numbers

const SCALE: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mm: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
  t: 1e12,
  tn: 1e12,
  trillion: 1e12,
};
const NUM_RE =
  /(?<![\w.$€£¥])(\()?([−-])?(?:([$€£¥])\s?)?(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(%|x(?![a-z])|×|bps\b|k\b|K\b|mm\b|MM\b|mn\b|m\b|M\b|bn\b|b\b|B\b|tn\b|T\b|thousand\b|million\b|billion\b|trillion\b))?(\))?/g;

function fromMatch(m: RegExpMatchArray): NumberToken {
  const [whole, open, minus, cur, digits, suffixRaw, close] = m;
  // "(" and ")" belong to the number only as a pair (accounting negatives).
  const lead = open && !close ? 1 : 0;
  const trail = close && !open ? 1 : 0;
  const suffix = (suffixRaw || '').toLowerCase();
  const scale = SCALE[suffix] || 1;
  const decimals = (digits.split('.')[1] || '').length;
  let value = Number(digits.replace(/,/g, '')) * scale;
  if (minus || (open && close)) value = -value;
  const unit = cur
    ? '$'
    : suffix === '%'
      ? '%'
      : suffix === 'x' || suffix === '×'
        ? 'x'
        : suffix === 'bps'
          ? 'bps'
          : '';
  const raw = whole.slice(lead, whole.length - trail);
  return {
    value,
    unit,
    decimals,
    scale,
    suffix: suffixRaw || '',
    currency: cur || '',
    raw,
    index: m.index! + lead,
    length: raw.length,
  };
}

/** A number as written: value in base units, its unit, and how precisely it was stated. */
// The first number only: a non-global copy, so no call leaves state behind
// in the shared pattern (matchAll starts from a global regex's lastIndex).
const NUM_ONE = new RegExp(NUM_RE.source);

export function parseNumber(raw: string): NumberToken | null {
  const m = String(raw).match(NUM_ONE);
  return m ? fromMatch(m) : null;
}

/** All numbers in a string with their offsets. */
export function numbersIn(s: string): NumberToken[] {
  return [...s.matchAll(NUM_RE)].map(fromMatch);
}

/** Equal within the precision the author stated `stated` to (plus a hair for rounding). */
export function matches(computed: number, stated: NumberToken): boolean {
  const tol = 0.5 * 10 ** -stated.decimals * stated.scale * 1.05 + Math.abs(stated.value) * 0.0015;
  return Math.abs(computed - stated.value) <= tol;
}

/** Formats a value the way `like` was written: same currency, scale and precision. */
export function formatLike(value: number, like: NumberToken): string {
  const v = Math.abs(value) / (like.scale || 1);
  const dec = Math.min(4, Math.max(like.decimals, v !== 0 && v < 1 && like.scale === 1 && like.unit !== '%' ? 2 : 0));
  let s = v.toFixed(dec);
  if (/,/.test(like.raw))
    s = Number(s).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const suffix = like.suffix ? (like.suffix.length > 2 ? ` ${like.suffix}` : like.suffix) : '';
  return `${value < 0 ? '−' : ''}${like.currency}${s}${suffix}`;
}

const money = (v: number) => {
  const a = Math.abs(v);
  const trim = (x: number) =>
    x
      .toFixed(2)
      .replace(/\.00$/, '')
      .replace(/(\.\d)0$/, '$1');
  const s =
    a >= 1e9
      ? `$${trim(a / 1e9)}B`
      : a >= 1e6
        ? `$${trim(a / 1e6)}M`
        : a >= 1e3
          ? `$${(a / 1e3).toFixed(0)}K`
          : `$${a.toFixed(2)}`;
  return v < 0 ? `−${s}` : s;
};
const pct = (v: number) => `${v.toFixed(1)}%`;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const isYear = (n: NumberToken) =>
  n.unit === '' && n.decimals === 0 && n.value >= 1900 && n.value <= 2100 && !/,/.test(n.raw);
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n - 2)}…` : s);

// Words that put a sentence in a hypothetical — its figures aren't the author's claims.
const HYPOTHETICAL =
  /\b(?:bull|bear|upside|downside|base|best|worst)[- ]case\b|\bscenarios?\b|\bif\b|\bwould\b|\bcould\b|\bunless\b|\bsensitivity\b|\bstress(?:ed)? case\b/i;

// ─────────────────────────────────────────────────────────── document structure

const TABLE_SEP = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** Splits a table row into cells with their absolute offsets (honouring \| escapes). */
function rowCells(line: string, lineFrom: number): Cell[] {
  const cells = [];
  let start = 0;
  for (let i = 0; i <= line.length; i++) {
    if (i === line.length || (line[i] === '|' && line[i - 1] !== '\\')) {
      cells.push({ text: line.slice(start, i), from: lineFrom + start });
      start = i + 1;
    }
  }
  if (cells.length && !cells[0].text.trim()) cells.shift();
  if (cells.length && !cells[cells.length - 1].text.trim()) cells.pop();
  return cells.map((c) => {
    const lead = c.text.length - c.text.trimStart().length;
    const text = c.text.trim();
    const n = numbersIn(text.replace(/\*\*/g, '  '));
    const num = n.length === 1 ? { ...n[0] } : null;
    return {
      text,
      from: c.from + lead,
      to: c.from + lead + text.length,
      num,
      blank: /^(—|–|-|n\/a|)$/i.test(text.replace(/\*/g, '').trim()),
    };
  });
}

export function tables(text: string): Table[] {
  const lines = text.split('\n');
  const starts = [];
  let pos = 0;
  for (const l of lines) {
    starts.push(pos);
    pos += l.length + 1;
  }
  const out = [];
  let fence = false;
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^\s*(```|~~~)/.test(lines[i])) fence = !fence;
    if (fence || !lines[i].includes('|') || !TABLE_SEP.test(lines[i + 1])) continue;
    const header = rowCells(lines[i], starts[i]).map((c) => c.text.replace(/\*\*/g, ''));
    // "Revenue ($M)" — the scale lives in the header, not the cells.
    const scales = header.map((h) => {
      const m = h.match(
        /\(\s*\$?\s?(k|m|mm|mn|bn|b|000s?|thousands?|millions?|billions?)\s*\)|\bin \$?(thousands|millions|billions)\b/i,
      );
      if (!m) return null;
      const w = (m[1] || m[2]).toLowerCase();
      return {
        scale: /^(k|000s?|thousand)/.test(w) ? 1e3 : /^(b|bn|billion)/.test(w) ? 1e9 : 1e6,
        money: /\$/.test(h),
      };
    });
    const rows = [];
    let j = i + 2;
    for (; j < lines.length && lines[j].includes('|') && lines[j].trim(); j++) {
      const cells = rowCells(lines[j], starts[j]);
      cells.forEach((c, k) => {
        const sc = scales[k];
        if (c.num && sc && c.num.unit === '' && c.num.scale === 1) {
          c.num = {
            ...c.num,
            value: c.num.value * sc.scale,
            unit: sc.money ? '$' : '',
            shown: `${c.text} (${header[k].match(/\(([^)]*)\)/)?.[1] || ''})`,
          };
        }
      });
      rows.push({
        label: (cells[0]?.text || '').replace(/\*\*/g, '').trim(),
        cells,
        from: starts[j],
        to: starts[j] + lines[j].length,
      });
    }
    out.push({ header, rows, from: starts[i], to: starts[j - 1] + lines[j - 1].length });
    i = j - 1;
  }
  return out;
}

export function sections(text: string): Section[] {
  const out: Section[] = [];
  let prev = { title: '', level: 0, from: 0, headingFrom: 0, headingTo: 0 };
  for (const m of text.matchAll(/^(#{1,6})\s+(.*)$/gm)) {
    out.push({ ...prev, to: m.index! });
    prev = {
      title: m[2].trim(),
      level: m[1].length,
      from: m.index! + m[0].length,
      headingFrom: m.index! + m[1].length + 1,
      headingTo: m.index! + m[0].length,
    };
  }
  out.push({ ...prev, to: text.length });
  return out.filter((s) => s.to > s.from || s.title);
}

// ─────────────────────────────────────────────────────────── findings

function add(c: Ctx, f: Finding): void {
  if (f.from == null || f.to == null || f.to <= f.from) return;
  c.out.push(f);
}

/** The line a position sits on. */
function lineAt(text: string, pos: number): string {
  const a = text.lastIndexOf('\n', pos - 1) + 1;
  const b = text.indexOf('\n', pos);
  return text.slice(a, b === -1 ? undefined : b);
}

// ═══════════════════════════════════════════════════════════ NUMBERS

/** Inline arithmetic — "A − B = C", "A ÷ B = C%" — recomputed exactly, with earlier corrections carried forward. */
function checkEquations(c: Ctx): void {
  const OP = /^\s*([+\-−–×*÷/]|x(?=\s))\s*$/;
  for (const s of c.S) {
    const src = s.masked;
    const nums = numbersIn(src);
    for (let k = src.indexOf('='); k !== -1; k = src.indexOf('=', k + 1)) {
      const after = nums.find((n) => n.index! > k);
      if (!after || src.slice(k + 1, after.index!).trim()) continue;
      const before = nums.filter((n) => n.index! + n.length <= k);
      if (!before.length || src.slice(before.at(-1)!.index! + before.at(-1)!.length, k).trim()) continue;
      const operands = [{ ...before.at(-1)! }];
      const ops: string[] = [];
      for (let i = before.length - 2; i >= 0; i--) {
        const gap = src.slice(before[i].index! + before[i].length, operands[0].index!);
        let op = gap.match(OP)?.[1];
        if (!op && !gap.trim() && /^[−-]/.test(operands[0].raw)) {
          op = '-';
          operands[0].value = Math.abs(operands[0].value);
        }
        if (!op) break;
        operands.unshift({ ...before[i] });
        ops.unshift(op);
      }
      if (!ops.length) continue;
      // A figure already shown to be wrong is replaced by its corrected value.
      const used: Correction[] = [];
      for (const o of operands) {
        const fix = c.corrections.find((x) => x.wrong === o.raw);
        if (fix) {
          o.value = parseNumber(fix.right)?.value ?? o.value;
          used.push(fix);
        }
      }
      const asFraction = after.unit !== '%';
      const vals = operands.map((o) => (o.unit === '%' && asFraction ? o.value / 100 : o.value));
      const opsN = ops.map((o) => ({ '−': '-', '–': '-', '×': '*', x: '*', '÷': '/' })[o] || o);
      for (let i = 0; i < opsN.length; ) {
        if (opsN[i] === '*' || opsN[i] === '/') {
          vals.splice(i, 2, opsN[i] === '*' ? vals[i] * vals[i + 1] : vals[i] / vals[i + 1]);
          opsN.splice(i, 1);
        } else i++;
      }
      let result = vals[0];
      for (let i = 0; i < opsN.length; i++) result = opsN[i] === '+' ? result + vals[i + 1] : result - vals[i + 1];
      if (after.unit === '%' && !operands.some((o) => o.unit === '%')) result *= 100;
      if (!Number.isFinite(result)) continue;
      const expr = operands
        .map((o, i) => `${used.find((u) => u.wrong === o.raw)?.right || o.raw}${ops[i] ? ` ${ops[i]} ` : ''}`)
        .join('');
      const label = s.text
        .slice(0, operands[0]!.index!)
        .replace(/[=:]\s*$/, '')
        .split(/[.;,]|\band\b/)
        .pop()!
        .trim();
      if (matches(result, after)) {
        c.facts.push(`VERIFIED: ${expr} = ${after.raw}.`);
        continue;
      }
      const right = formatLike(result, after);
      c.facts.push(`WRONG: ${expr} = ${right}, not ${after.raw} as the draft says.`);
      c.corrections.push({ wrong: after.raw, right, label });
      const carried = used.length
        ? `With the corrected ${used.map((u) => `${u.label || 'figure'} (${u.right})`).join(' and ')}, `
        : '';
      add(c, {
        from: s.from + after.index!,
        to: s.from + after.index! + after.length,
        kind: 'equation',
        category: 'numbers',
        title: 'Arithmetic',
        message: `${carried}${expr} = ${right}, not ${after.raw}.`,
        suggestion: right,
      });
    }
  }
}

/** A wrong result that turns up again elsewhere — in the summary, say. */
function checkRepeats(c: Ctx): void {
  for (const x of c.corrections) {
    if (!/[$%.]/.test(x.wrong)) continue; // too generic to chase
    for (let i = c.text.indexOf(x.wrong); i !== -1; i = c.text.indexOf(x.wrong, i + x.wrong.length)) {
      const before = c.text[i - 1];
      const after = c.text[i + x.wrong.length];
      if ((before && /[\d.]/.test(before)) || (after && /\d/.test(after))) continue;
      add(c, {
        from: i,
        to: i + x.wrong.length,
        kind: 'repeat',
        category: 'numbers',
        title: 'Carries a wrong figure',
        message: `${x.wrong} comes from a calculation that actually gives ${x.right}${x.label ? ` (${x.label})` : ''}.`,
        suggestion: x.right,
      });
    }
  }
}

/** Column totals ("Total costs") and row totals ("3-Year Total") in every table. */
function checkTables(c: Ctx): void {
  const isTotal = (label: string) => /\b(total|subtotal|sum)\b/i.test(label) && !/cumulative/i.test(label);
  const skipRow = (label: string) =>
    /^(net|cumulative)\b/i.test(label) ||
    /%|\b(growth|average|avg|yoy|cagr|per ?cent)\b/i.test(label) ||
    /\bmargin$/i.test(label);
  const ratioCol = (h: string) => /%|growth|margin|cagr|yoy|change|ratio|multiple|per share|eps\b/i.test(h);
  for (const t of c.T) {
    let blockStart = 0;
    t.rows.forEach((row, r) => {
      if (!isTotal(row.label)) return;
      for (let col = 1; col < t.header.length; col++) {
        const cell = row.cells[col];
        if (!cell?.num || ratioCol(t.header[col])) continue;
        let sum = 0;
        let used = 0;
        for (let k = blockStart; k < r; k++) {
          const x = t.rows[k];
          if (isTotal(x.label) || skipRow(x.label)) continue;
          const v = x.cells[col];
          if (v?.num) {
            sum += v.num.value;
            used++;
          } else if (!v?.blank) used = -999;
        }
        if (used < 2) continue;
        if (matches(sum, cell.num)) {
          c.facts.push(
            `VERIFIED: table "${row.label}" / "${t.header[col]}" = ${cell.num.raw} (sum of the rows above).`,
          );
          continue;
        }
        const right = formatLike(sum, cell.num);
        c.facts.push(
          `WRONG: table "${row.label}" / "${t.header[col]}" should be ${right} (sum of the rows above), not ${cell.num.raw}.`,
        );
        add(c, {
          from: cell.from,
          to: cell.to,
          kind: 'table-total',
          category: 'numbers',
          title: 'Table total',
          message: `The rows above add up to ${right}, not ${cell.num.raw}.`,
          suggestion: cell.text.replace(cell.num.raw, right),
        });
      }
      blockStart = r + 1;
    });
    t.header.forEach((h, col) => {
      if (col === 0 || !/\btotal\b/i.test(h)) return;
      const parts = t.header
        .map((_, k) => k)
        .filter((k) => k !== 0 && k !== col && !/total|growth|margin|%|cagr|yoy|change/i.test(t.header[k]));
      if (parts.length < 2) return;
      for (const row of t.rows) {
        const cell = row.cells[col];
        if (!cell?.num || skipRow(row.label)) continue;
        let sum = 0;
        let ok = true;
        for (const k of parts) {
          const v = row.cells[k];
          if (v?.num) sum += v.num.value;
          else if (!v?.blank) ok = false;
        }
        if (!ok || matches(sum, cell.num)) continue;
        const right = formatLike(sum, cell.num);
        c.facts.push(`WRONG: table row "${row.label}" ${h} should be ${right}, not ${cell.num.raw}.`);
        add(c, {
          from: cell.from,
          to: cell.to,
          kind: 'table-total',
          category: 'numbers',
          title: 'Row total',
          message: `${row.label}: the other columns add up to ${right}, not ${cell.num.raw}.`,
          suggestion: cell.text.replace(cell.num.raw, right),
        });
      }
    });
  }
}

const LINK = String.raw`\s*(?:of|is|was|would be|will be|totals?|totalling|totaling|comes to|amounts to|at|:|=)?\s*(?:about|roughly|approximately|around|~|nearly|almost|just over|just under|over|under)?\s*`;
const MONEY = String.raw`[$€£¥]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:[kKmMbB]n?|MM|thousand|million|billion))?`;
const OPERATOR_NEXT = /^\s*[+\-−–×*÷/]/;

/** Net benefit, ROI, payback and NPV stated in the text, against the cost/benefit table. */
function checkBusinessCase(c: Ctx): void {
  for (const t of c.T) {
    const years = t.header
      .map((h, i) => ({ h, i }))
      .filter(
        ({ h, i }) => i > 0 && /^(year|yr|y)\s*\d+|^fy\s*'?\d{2,4}|^20\d\d\b/i.test(h.trim()) && !/total/i.test(h),
      );
    const costRow = t.rows.find((r) => /\btotal\s+(costs?|investment|spend|outlay)\b/i.test(r.label));
    const benefitRow = t.rows.find((r) => /\btotal\s+(benefits?|savings|returns?|value)\b/i.test(r.label));
    if (!costRow || !benefitRow || years.length < 2) continue;
    const yearly = years.map(({ i }) => ({
      cost: costRow.cells[i]?.num?.value ?? 0,
      benefit: benefitRow.cells[i]?.num?.value ?? 0,
    }));
    const totalCost = yearly.reduce((a, y) => a + y.cost, 0);
    const totalBenefit = yearly.reduce((a, y) => a + y.benefit, 0);
    const net = totalBenefit - totalCost;
    const roi = (net / totalCost) * 100;
    c.facts.push(
      `COMPUTED from the table: total benefits ${money(totalBenefit)} − total costs ${money(totalCost)} = net benefit ${money(net)}; ROI = net ÷ costs = ${pct(roi)}.`,
    );
    let cum = 0;
    let payback: number | null = null;
    yearly.forEach((y, k) => {
      const flow = y.benefit - y.cost;
      if (payback == null && cum + flow >= 0 && flow > 0) payback = k * 12 + (-cum / flow) * 12;
      cum += flow;
    });
    if (payback != null)
      c.facts.push(
        `COMPUTED from the table: payback after about ${Math.round(payback)} months (net flows: ${yearly.map((y, k) => `${years[k].h} ${money(y.benefit - y.cost)}`).join(', ')}).`,
      );

    const stated = (s: Sentence, re: RegExp) => {
      const m = s.masked.match(re);
      if (!m) return null;
      const at = m.index! + m[0].length - m[1].length;
      if (OPERATOR_NEXT.test(s.masked.slice(at + m[1].length))) return null; // part of an equation
      const n = parseNumber(m[1]);
      return n ? { ...n, from: s.from + at, to: s.from + at + m[1].length } : null;
    };
    for (const s of c.S) {
      const hypothetical = HYPOTHETICAL.test(s.text);
      const nb =
        !hypothetical &&
        stated(s, new RegExp(String.raw`\bnet (?:benefit|gain|return|value)s?\b${LINK}(${MONEY})`, 'i'));
      if (nb && !matches(net, nb))
        add(c, {
          from: nb.from,
          to: nb.to,
          kind: 'net',
          category: 'numbers',
          title: 'Net benefit',
          message: `The table gives a net benefit of ${formatLike(net, nb)} (${money(totalBenefit)} − ${money(totalCost)}), not ${nb.raw}.`,
          suggestion: formatLike(net, nb),
        });
      const r =
        !hypothetical &&
        stated(s, new RegExp(String.raw`\b(?:ROI|return on investment)\b${LINK}(\d[\d,]*(?:\.\d+)?\s?%)`, 'i'));
      if (r && !matches(roi, r))
        add(c, {
          from: r.from,
          to: r.to,
          kind: 'roi',
          category: 'numbers',
          title: 'ROI',
          message: `From the table, ROI is ${formatLike(roi, r)} (net ${money(net)} ÷ costs ${money(totalCost)}), not ${r.raw}.`,
          suggestion: formatLike(roi, r),
        });
      const pb = s.masked.match(/\bpay\s?back\b(?:(?!\bby\b)[^.]){0,40}?(\d+(?:\.\d+)?)\s*(months?|years?)/i);
      if (pb && !hypothetical && payback != null) {
        const months = Number(pb[1]) * (/year/i.test(pb[2]) ? 12 : 1);
        if (Math.abs(months - payback) > 1.5) {
          const idx = s.masked.indexOf(pb[1], pb.index! + 6);
          add(c, {
            from: s.from + idx,
            to: s.from + idx + pb[1].length + 1 + pb[2].length,
            kind: 'payback',
            category: 'numbers',
            title: 'Payback',
            message: `The table pays back in about ${Math.round(payback)} months — the cumulative position is ${money(yearly[0].benefit - yearly[0].cost)} after ${years[0].h} — not ${pb[1]} ${pb[2]}.`,
            suggestion: `${Math.round(payback)} months`,
          });
        }
      }
      // "a 10% discount rate would reduce the net benefit by about $0.4M" — tried under three timing conventions.
      const d = s.masked.match(
        new RegExp(
          String.raw`(\d+(?:\.\d+)?)%\s+discount rate[^.]{0,60}?\b(?:reduce|lower|cut|take)\w*\s+(?:the\s+)?net (?:benefit|value|gain)\s+(by|to)\s+(?:about|roughly|approximately|around|~|nearly)?\s*(${MONEY})`,
          'i',
        ),
      );
      if (d) {
        const rate = Number(d[1]) / 100;
        const by = d[2].toLowerCase() === 'by';
        const npv = (shift: number) =>
          yearly.reduce((a, y, k) => a + (y.benefit - y.cost) / (1 + rate) ** (k + shift), 0);
        const options = [0, 0.5, 1].map((sh) => (by ? net - npv(sh) : npv(sh)));
        const st = parseNumber(d[3]!)!;
        const ok = options.some(
          (v) => Math.abs(v - st.value) <= Math.max(0.12 * Math.abs(v), 0.5 * 10 ** -st.decimals * st.scale),
        );
        const range = `${money(Math.min(...options))}–${money(Math.max(...options))}`;
        c.facts.push(
          `COMPUTED: at a ${d[1]}% discount rate the net benefit ${by ? 'falls by' : 'is'} ${range}, depending on whether year 1 is discounted 0, ½ or 1 year.`,
        );
        if (!ok) {
          const idx = s.masked.indexOf(d[3], d.index!);
          add(c, {
            from: s.from + idx,
            to: s.from + idx + d[3].length,
            kind: 'npv',
            category: 'numbers',
            title: 'Discounting',
            message: `At ${d[1]}%, discounting ${by ? 'reduces the net benefit by' : 'gives a net present value of'} ${range} (depending on timing), not ${d[3]}.`,
          });
        }
      }
    }
  }
}

/** Price target, multiples, upside, market cap, EV, leverage and PEG in an investment note. */
function checkValuation(c: Ctx): void {
  const { text } = c;
  const first = (res: RegExp[]) => {
    for (const re of res) {
      const m = text.match(re);
      if (m) return { value: Number(m[1].replace(/,/g, '')), raw: m[0] };
    }
    return null;
  };
  const big = (re: RegExp) => {
    const m = text.match(re);
    return m ? (parseNumber(`$${m[1]}`)?.value ?? null) : null;
  };
  const target = first([
    /price target(?:\s+of|:|\s+is|\s+to)?\s*\$\s?([\d,]+(?:\.\d+)?)/i,
    /\$\s?([\d,]+(?:\.\d+)?)\s*(?:12-month\s+)?(?:price\s+)?target/i,
    /target(?: price)?(?: of|:)\s*\$\s?([\d,]+(?:\.\d+)?)/i,
  ]);
  const price = first([
    /current(?:ly)?(?: share)? price(?:\s+of|:|\s+is)?\s*\$\s?([\d,]+(?:\.\d+)?)/i,
    /(?:trades|trading|traded|closed) at \$\s?([\d,]+(?:\.\d+)?)/i,
    /from the current \$\s?([\d,]+(?:\.\d+)?)/i,
    /(?:^|\n)At \$\s?([\d,]+(?:\.\d+)?),/,
  ]);
  const shares = first([/([\d,]+(?:\.\d+)?)\s*million (?:diluted |basic )?shares/i]);
  const mcap = big(
    /market cap(?:itali[sz]ation)?\s*(?:of|:|is)?\s*\$\s?([\d,]+(?:\.\d+)?\s*(?:billion|million|bn|m|b))\b/i,
  );
  const ev = big(/enterprise value\s*(?:of|:|is)?\s*\$\s?([\d,]+(?:\.\d+)?\s*(?:billion|million|bn|m|b))\b/i);
  const netDebt = big(/net debt\s*(?:of|:|is)?\s*\$\s?([\d,]+(?:\.\d+)?\s*(?:billion|million|bn|m|b))\b/i);
  const usd = (v: number) => `$${v.toFixed(2).replace(/\.00$/, '')}`;
  if (target) c.facts.push(`STATED: price target ${usd(target.value)}.`);
  if (price) c.facts.push(`STATED: current price ${usd(price.value)}.`);
  if (price && shares && mcap) {
    const calc = price.value * shares.value * 1e6;
    c.facts.push(
      Math.abs(calc - mcap) / mcap < 0.01
        ? `VERIFIED: ${shares.value}M shares × ${usd(price.value)} = ${money(calc)} ≈ the stated market cap.`
        : `WRONG: ${shares.value}M shares × ${usd(price.value)} = ${money(calc)}, but the draft gives a market cap of ${money(mcap)}.`,
    );
  }
  if (mcap && netDebt && ev) {
    const calc = mcap + netDebt;
    c.facts.push(
      Math.abs(calc - ev) / ev < 0.01
        ? `VERIFIED: market cap ${money(mcap)} + net debt ${money(netDebt)} = enterprise value ${money(ev)}.`
        : `WRONG: market cap ${money(mcap)} + net debt ${money(netDebt)} = ${money(calc)}, not the stated enterprise value ${money(ev)}.`,
    );
  }
  let pe = null;
  let ebitda = null;

  for (const s of c.S) {
    const t = s.masked;
    if (HYPOTHETICAL.test(t)) continue;
    const up = t.match(/(\d+(?:\.\d+)?)%\s*(upside|downside)/i);
    if (up && target && price) {
      const calc = (target.value / price.value - 1) * 100 * (/down/i.test(up[2]) ? -1 : 1);
      if (matches(calc, parseNumber(`${up[1]}%`)!))
        c.facts.push(`VERIFIED: ${usd(target.value)} ÷ ${usd(price.value)} − 1 = ${up[1]}% ${up[2]}.`);
      else {
        const idx = t.indexOf(up[0]);
        c.facts.push(`WRONG: ${usd(target.value)} ÷ ${usd(price.value)} − 1 = ${pct(calc)} ${up[2]}, not ${up[1]}%.`);
        add(c, {
          from: s.from + idx,
          to: s.from + idx + up[1].length + 1,
          kind: 'upside',
          category: 'numbers',
          title: 'Upside',
          message: `${usd(target.value)} against ${usd(price.value)} is ${pct(calc)} ${up[2]}, not ${up[1]}%.`,
          suggestion: `${calc.toFixed(1)}%`,
        });
      }
    }
    const isTarget = /price target|target price|\bour target\b/i.test(t);
    for (const m of t.matchAll(
      /(\d+(?:\.\d+)?)\s?[x×](?![a-z])(?:\s+multiple)?(?:\s+(?:to|on|of))?\s+(?:(?:FY|CY|F)?'?\d{2,4}[AEF]?\s+)?(EPS|earnings per share|earnings|FCF per share|book value per share|BVPS)(?:\s+(?:of|at|estimate of))?\s*\$\s?(\d+(?:\.\d+)?)/gi,
    )) {
      const n = Number(m[1]);
      const v = Number(m[3]);
      if (isTarget && target) {
        const product = n * v;
        if (Math.abs(product - target.value) / target.value <= 0.015) {
          c.facts.push(`VERIFIED: ${n}x × $${v} = $${product.toFixed(2)}, the ${usd(target.value)} target.`);
          continue;
        }
        c.facts.push(
          `WRONG: ${n}x × ${m[2]} of $${v} = $${product.toFixed(2)}, which does not give the ${usd(target.value)} price target (that needs ${(target.value / v).toFixed(1)}x, or ${m[2]} of $${(target.value / n).toFixed(2)}).`,
        );
        add(c, {
          from: s.from + m.index!,
          to: s.from + m.index! + m[0].length,
          kind: 'target',
          category: 'numbers',
          title: 'Price target',
          message: `${n}x × $${v} = $${product.toFixed(2)}, not the ${usd(target.value)} target. ${usd(target.value)} needs ${(target.value / v).toFixed(1)}x, or ${m[2]} of $${(target.value / n).toFixed(2)}.`,
        });
      } else if (price && !isTarget) {
        const implied = price.value / v;
        if (/EPS|earnings/i.test(m[2])) pe = { value: implied, eps: v };
        if (Math.abs(implied - n) <= 0.5 * 10 ** -(m[1].split('.')[1] || '').length + 0.01 * n) {
          c.facts.push(`VERIFIED: ${usd(price.value)} ÷ $${v} = ${implied.toFixed(1)}x ${m[2]}.`);
          continue;
        }
        c.facts.push(`WRONG: ${usd(price.value)} ÷ $${v} = ${implied.toFixed(1)}x, not ${n}x.`);
        add(c, {
          from: s.from + m.index!,
          to: s.from + m.index! + m[1].length + 1,
          kind: 'multiple',
          category: 'numbers',
          title: 'Multiple',
          message: `At ${usd(price.value)}, ${m[2]} of $${v} is ${implied.toFixed(1)}x, not ${n}x.`,
          suggestion: `${implied.toFixed(1)}x`,
        });
      }
    }
    const evm = t.match(
      /(\d+(?:\.\d+)?)\s?[x×](?![a-z])\s+(?:(?:FY|CY)?'?\d{2,4}[AEF]?\s+)?EV\/EBITDA(?:\s+(?:of|at))?\s*\$\s?([\d,]+(?:\.\d+)?)\s*(million|billion|m|bn|b)\b/i,
    );
    if (evm) {
      ebitda = parseNumber(`$${evm[2]} ${evm[3]}`)!.value;
      if (ev) {
        const implied = ev / ebitda;
        const n = Number(evm[1]);
        if (Math.abs(implied - n) <= 0.06 + 0.01 * n)
          c.facts.push(`VERIFIED: EV ${money(ev)} ÷ EBITDA ${money(ebitda)} = ${implied.toFixed(1)}x.`);
        else {
          c.facts.push(`WRONG: EV ${money(ev)} ÷ EBITDA ${money(ebitda)} = ${implied.toFixed(1)}x, not ${n}x.`);
          add(c, {
            from: s.from + evm.index!,
            to: s.from + evm.index! + evm[1].length + 1,
            kind: 'multiple',
            category: 'numbers',
            title: 'Multiple',
            message: `Enterprise value ${money(ev)} ÷ EBITDA ${money(ebitda)} is ${implied.toFixed(1)}x, not ${n}x.`,
            suggestion: `${implied.toFixed(1)}x`,
          });
        }
      }
    }
    const fy = t.match(
      /(\d+(?:\.\d+)?)%\s*(?:free[- ]cash[- ]flow|FCF)\s+yield[^.;$]{0,40}?\$\s?([\d,]+(?:\.\d+)?)\s*(million|billion|m|bn|b)\b/i,
    );
    if (fy && mcap) {
      const y = (parseNumber(`$${fy[2]} ${fy[3]}`)!.value / mcap) * 100;
      if (Math.abs(y - Number(fy[1])) <= 0.06 + 0.01 * y)
        c.facts.push(`VERIFIED: FCF ÷ market cap = ${pct(y)} free-cash-flow yield.`);
      else {
        c.facts.push(`WRONG: FCF ÷ market cap = ${pct(y)}, not ${fy[1]}%.`);
        const idx = t.indexOf(fy[0]);
        add(c, {
          from: s.from + idx,
          to: s.from + idx + fy[1].length + 1,
          kind: 'yield',
          category: 'numbers',
          title: 'FCF yield',
          message: `FCF of $${fy[2]} ${fy[3]} on a ${money(mcap)} market cap is a ${pct(y)} yield, not ${fy[1]}%.`,
          suggestion: pct(y),
        });
      }
    }
    const lev = t.match(/net leverage (?:of |at |is )?(?:just |only |about |roughly )?(\d+(?:\.\d+)?)\s?x/i);
    if (lev && netDebt && ebitda) {
      const x = netDebt / ebitda;
      const n = Number(lev[1]);
      if (Math.abs(x - n) <= 0.06 + 0.02 * n)
        c.facts.push(`VERIFIED: net debt ${money(netDebt)} ÷ EBITDA ${money(ebitda)} = ${x.toFixed(2)}x net leverage.`);
      else {
        const idx = t.indexOf(lev[1], lev.index!);
        add(c, {
          from: s.from + idx,
          to: s.from + idx + lev[1].length + 1,
          kind: 'leverage',
          category: 'numbers',
          title: 'Leverage',
          message: `Net debt ${money(netDebt)} ÷ EBITDA ${money(ebitda)} is ${x.toFixed(1)}x, not ${n}x.`,
          suggestion: `${x.toFixed(1)}x`,
        });
      }
    }
  }

  // PEG = P/E ÷ EPS growth, against the growth in the estimates table.
  const peg = text.match(/(\d+(?:\.\d+)?)\s+PEG\b|\bPEG(?: ratio)?(?: of| at| is)?\s+(\d+(?:\.\d+)?)/i);
  const eps = epsSeries(c.T);
  if (peg && pe && eps.length >= 2) {
    const stated = Number(peg[1] || peg[2]);
    const growth = [];
    for (let i = 1; i < eps.length; i++) growth.push((eps[i] / eps[i - 1] - 1) * 100);
    const from = eps.indexOf(pe.eps);
    if (from !== -1 && from < eps.length - 1)
      growth.push(((eps.at(-1)! / eps[from]) ** (1 / (eps.length - 1 - from)) - 1) * 100);
    const positive = growth.filter((g) => g > 0);
    if (positive.length) {
      const pegs = positive.map((g) => pe.value / g);
      const lo = Math.min(...pegs);
      const hi = Math.max(...pegs);
      const gLo = Math.min(...positive);
      const gHi = Math.max(...positive);
      c.facts.push(
        `COMPUTED: P/E ${pe.value.toFixed(1)}x ÷ EPS growth of ${gLo.toFixed(1)}–${gHi.toFixed(1)}% a year (from the estimates table) = PEG ${lo.toFixed(2)}–${hi.toFixed(2)}.`,
      );
      if (stated < lo - 0.1 || stated > hi + 0.1) {
        const at = peg.index! + peg[0].indexOf(peg[1] || peg[2]);
        add(c, {
          from: at,
          to: at + (peg[1] || peg[2]).length,
          kind: 'peg',
          category: 'numbers',
          title: 'PEG ratio',
          message: `A ${pe.value.toFixed(1)}x P/E with the ${gLo.toFixed(0)}–${gHi.toFixed(0)}% EPS growth in your estimates gives a PEG of ${lo.toFixed(1)}–${hi.toFixed(1)}. ${stated} would need about ${(pe.value / stated).toFixed(0)}% growth.`,
        });
      }
    }
  }
}

/** EPS by year from an estimates table, in table order. */
function epsSeries(T: Table[]): number[] {
  for (const t of T) {
    const col = t.header.findIndex((h, i) => i > 0 && /^\s*(diluted |adj\.? |adjusted )?eps\b/i.test(h));
    if (col !== -1) {
      const v = t.rows
        .filter((r) => /fy|20\d\d|cy/i.test(r.label))
        .map((r) => r.cells[col]?.num?.value)
        .filter((x): x is number => x !== undefined && x > 0);
      if (v.length >= 2) return v;
    }
    const row = t.rows.find((r) => /^\s*(diluted |adj\.? |adjusted )?eps\b/i.test(r.label));
    if (row) {
      const v = row.cells
        .slice(1)
        .map((x) => x?.num?.value)
        .filter((x): x is number => x !== undefined && x > 0);
      if (v.length >= 2) return v;
    }
  }
  return [];
}

/** Scenario probabilities in a section must add up to 100%. */
function checkProbabilities(c: Ctx): void {
  for (const sec of c.SEC) {
    const body = c.text.slice(sec.from, sec.to);
    const items: { p: number; from: number; to: number; price: number | null }[] = [];
    const re =
      /(\d+(?:\.\d+)?)%\s*(?:probability|chance|likelihood|weight(?:ing)?|odds)|(?:probability|chance|likelihood|weight(?:ing)?|odds)\s*(?:of|:|=|at)?\s*(\d+(?:\.\d+)?)%/gi;
    for (const m of body.matchAll(re)) {
      const raw = m[1] || m[2];
      const at = sec.from + m.index! + m[0].indexOf(raw);
      const price = lineAt(c.text, at).match(/\$\s?(\d[\d,]*(?:\.\d+)?)/);
      items.push({
        p: Number(raw),
        from: at,
        to: at + raw.length + 1,
        price: price ? Number(price[1].replace(/,/g, '')) : null,
      });
    }
    if (items.length < 2) continue;
    const sum = items.reduce((a, x) => a + x.p, 0);
    const list = items.map((x) => `${x.p}%`).join(' + ');
    const priced = items.every((x) => x.price != null);
    // Only used when every scenario has a price (`priced`).
    const weighted = items.reduce((a, x) => a + (x.p / 100) * (x.price ?? 0), 0);
    const normalised = weighted / (sum / 100);
    const where = sec.title || 'the opening';
    const off = Math.abs(sum - 100) > 0.5;
    if (!off)
      c.facts.push(
        `VERIFIED: probabilities in "${where}" sum to 100% (${list})${priced ? `; probability-weighted value $${weighted.toFixed(2)}` : ''}.`,
      );
    else {
      c.facts.push(
        `WRONG: probabilities in "${where}" sum to ${sum}% (${list}), not 100%.${priced ? ` Weighted with them: $${weighted.toFixed(2)}; rescaled to 100%: $${normalised.toFixed(2)}.` : ''}`,
      );
      const last = items.at(-1)!;
      add(c, {
        from: last.from,
        to: last.to,
        kind: 'probabilities',
        category: 'numbers',
        title: 'Probabilities',
        message: `The scenario probabilities add up to ${sum}% (${list}), not 100%.${priced ? ` Rescaled to 100%, the probability-weighted value is $${normalised.toFixed(2)}.` : ''}`,
      });
    }
    const pw = body.match(
      /probability[- ]weighted (?:value|price|target|fair value)[^$]{0,20}\$\s?(\d[\d,]*(?:\.\d+)?)/i,
    );
    if (pw && priced && (off || !matches(weighted, parseNumber(`$${pw[1]}`)!))) {
      const at = sec.from + pw.index! + pw[0].lastIndexOf('$');
      add(c, {
        from: at,
        to: at + pw[1].length + 1,
        kind: 'weighted',
        category: 'numbers',
        title: 'Weighted value',
        message: off
          ? `This uses probabilities that add up to ${sum}%. With weights that sum to 100%, it is $${normalised.toFixed(2)}.`
          : `The probability-weighted value is $${weighted.toFixed(2)}, not $${pw[1]}.`,
        suggestion: `$${(off ? normalised : weighted).toFixed(2)}`,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════ CONSISTENCY

// "FY2027E" in a table is "FY2027" in prose; blank the suffix without moving anything.
const unsuffix = (s: string) => s.replace(/\b((?:FY|CY)?'?\d{2,4})[AEFPB]\b/gi, (_m, a: string) => `${a} `);
const keyOf = (s: string) =>
  unsuffix(s)
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\*+/g, ' ')
    .replace(/[^a-z0-9/&% ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
// "recurring revenue" or "consensus EPS" is a different figure from the table's "Revenue" or "EPS".
const QUALIFIER =
  /(?:recurring|software|hardware|subscription|services?|product|segment|organic|adjusted|underlying|quarterly|monthly|international|domestic|online|store|cloud|core|consensus|street|guided|guidance|peer|peers|industry|market|sector|regional|new|existing|target|implied|bull|bear|base)\s+$/i;

/** A sentence quoting a table cell with a different number than the table. */
function checkTextAgainstTables(c: Ctx): void {
  for (const t of c.T) {
    const cols = t.header
      .map((h, i) => ({ i, key: keyOf(h) }))
      .filter((h) => h.i > 0 && h.key.length >= 3 && !/^\d+$/.test(h.key));
    const rows = t.rows.map((r) => ({ r, key: keyOf(r.label) })).filter((x) => x.key.length >= 3);
    for (const s of c.S) {
      if (HYPOTHETICAL.test(lineAt(c.text, s.from))) continue;
      const plain = unsuffix(s.masked);
      const mention = (key: string) => {
        const re = new RegExp(`(?<![a-z0-9])${esc(key).replace(/ /g, '\\s+')}(?:s|es)?(?![a-z0-9])`, 'gi');
        for (const m of plain.matchAll(re)) {
          if (QUALIFIER.test(plain.slice(Math.max(0, m.index! - 24), m.index!))) continue;
          if (/^\s*(?:growth|margin|mix|share|per\b|multiple)/i.test(plain.slice(m.index! + m[0].length))) continue;
          return m.index!;
        }
        return -1;
      };
      const nums = numbersIn(s.masked).filter((n) => !isYear(n));
      if (!nums.length) continue;
      for (const col of cols) {
        if (mention(col.key) === -1) continue;
        for (const { r, key } of rows) {
          const at = mention(key);
          if (at === -1) continue;
          const cell = r.cells[col.i]?.num;
          if (!cell) continue;
          const same = nums.filter((n) => n.unit === cell.unit);
          if (!same.length || same.some((n) => matches(cell.value, n) || matches(n.value, cell))) continue;
          const n = same.sort((a, b) => Math.abs(a.index! - at) - Math.abs(b.index! - at))[0];
          const shown = cell.shown || cell.raw;
          c.facts.push(
            `MISMATCH: the text gives ${n.raw} for ${t.header[col.i]} in ${r.label}; the table says ${shown}.`,
          );
          add(c, {
            from: s.from + n.index!,
            to: s.from + n.index! + n.length,
            kind: 'table-text',
            category: 'consistency',
            title: 'Doesn’t match the table',
            message: `The table gives ${shown} for ${t.header[col.i]} in ${r.label}, but this says ${n.raw}.`,
            suggestion: cell.shown ? '' : cell.raw,
          });
        }
      }
    }
  }
}

// The same named figure stated twice with different values. [name, pattern, needs a period?]
const METRICS: [name: string, pattern: RegExp, needsPeriod?: boolean][] = [
  ['price target', /\b(?:12-month |twelve-month )?(?:price target|target price)\b/i],
  ['upside', /\b(?:implied )?upside\b/i],
  ['ROI', /\bROI\b|\breturn on investment\b/i],
  ['IRR', /\bIRR\b/],
  ['NPV', /\bNPV\b|\bnet present value\b/i],
  ['payback', /\bpay\s?back(?: period)?\b/i],
  ['net benefit', /\bnet benefits?\b/i],
  ['total cost', /\btotal (?:project )?costs?\b/i],
  ['market cap', /\bmarket cap(?:itali[sz]ation)?\b/i],
  ['enterprise value', /\benterprise value\b/i],
  ['churn', /\bchurn(?: rate)?\b/i],
  ['grace period', /\bgrace period\b/i],
  ['EBITDA margin', /\bEBITDA margins?\b/i, true],
  ['gross margin', /\bgross margins?\b/i, true],
  ['operating margin', /\boperating margins?\b/i, true],
  ['revenue', /\brevenues?\b/i, true],
  ['EPS', /\bEPS\b/, true],
];
const VALUE = String.raw`(?:[$€£¥]\s?)?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|x(?![a-z])|×|[kKmMbB]n?\b|million\b|billion\b|thousand\b))?(?:\s?(?:months?|years?|days?|hours?|weeks?)\b)?`;
const PERIOD = /\b(?:FY|CY)\s?'?\d{2,4}[AEF]?\b|\b(?:19|20)\d\d\b|\bQ[1-4]\b|\byear \d\b/gi;

function checkStatedValues(c: Ctx): void {
  const seen = new Map(); // metric|period → first mention
  for (const s of c.S) {
    const t = s.masked;
    if (HYPOTHETICAL.test(lineAt(c.text, s.from))) continue;
    const periods = [...t.matchAll(PERIOD)].map((m) => ({
      at: m.index!,
      key: m[0]
        .toUpperCase()
        .replace(/[AEF]$/, '')
        .replace(/\s/g, ''),
    }));
    for (const [name, re, needsPeriod] of METRICS) {
      for (const m of t.matchAll(new RegExp(re.source, `${re.flags}g`))) {
        if (QUALIFIER.test(t.slice(Math.max(0, m.index! - 24), m.index!))) continue;
        const rest = t.slice(m.index! + m[0].length);
        const after = rest.match(
          new RegExp(
            `^(?:\\s*\\([^)]*\\))?\\s*(?:of|is|was|at|to|from|:|=|stands at|sits at|comes to|totals?|reached|hits?|of just|of only)?\\s*(?:about|roughly|approximately|around|~|nearly|just|only|within)?\\s*(${VALUE})`,
            'i',
          ),
        );
        const beforeM = t.slice(0, m.index!).match(new RegExp(`(${VALUE})\\s+(?:[\\w-]+\\s+){0,1}$`, 'i'));
        let raw: string;
        let at: number;
        if (after && !OPERATOR_NEXT.test(rest.slice(after[0].length))) {
          raw = after[1];
          at = m.index! + m[0].length + after[0].length - after[1].length;
        } else if (beforeM) {
          raw = beforeM[1];
          at = beforeM.index!;
        } else continue;
        raw = raw.trim();
        const n = parseNumber(raw);
        if (!n || isYear(n)) continue;
        const period = periods.length
          ? [...periods].sort((a, b) => Math.abs(a.at - at) - Math.abs(b.at - at))[0].key
          : '';
        if (needsPeriod && !period) continue;
        const key = `${name}|${period}`;
        const unitKey = `${n.unit}${raw.match(/(month|year|day|hour|week)/i)?.[1].toLowerCase() || ''}`;
        const here = { n, raw, unitKey, from: s.from + at, to: s.from + at + raw.length, sentence: s.text };
        const prev = seen.get(key);
        if (!prev) {
          seen.set(key, here);
          continue;
        }
        if (prev.unitKey !== unitKey || matches(prev.n.value, n) || matches(n.value, prev.n)) continue;
        add(c, {
          from: here.from,
          to: here.to,
          kind: 'values',
          category: 'consistency',
          title: 'Says two things',
          message: `Earlier the ${name}${period ? ` for ${period}` : ''} is ${prev.raw} (“${clip(prev.sentence, 90)}”); here it is ${raw}. Which is right?`,
          related: { from: prev.from, to: prev.to },
        });
      }
    }
  }
}

const RATING_CLASS: Record<string, 'positive' | 'neutral' | 'negative'> = {
  'strong buy': 'positive',
  buy: 'positive',
  outperform: 'positive',
  overweight: 'positive',
  accumulate: 'positive',
  hold: 'neutral',
  neutral: 'neutral',
  'equal weight': 'neutral',
  'market perform': 'neutral',
  sell: 'negative',
  underperform: 'negative',
  underweight: 'negative',
  reduce: 'negative',
};

/** A Buy in the summary and a Hold in the conclusion; Option A here, Option B there. */
function checkRecommendations(c: Ctx): void {
  const ratings = [];
  const WORDS =
    'strong buy|buy|outperform|overweight|accumulate|hold|neutral|equal[- ]weight|market perform|sell|underperform|underweight|reduce';
  const re = new RegExp(
    String.raw`\b(?:rating[:\s]+\**|rated?\s+(?:it\s+|the stock\s+|the shares\s+)?(?:as\s+|at\s+|a\s+|an\s+)?\**|(?:initiat\w+|reiterat\w+|maintain\w*|upgrad\w+|downgrad\w+)\b[^.]{0,60}?\bwith an?\s+\**|\bto\s+an?\s+\**)(${WORDS})\b|\b(${WORDS})\**\s+rating\b|(?:^|[.!]\s+)(Buy|Sell)\s+(?:[A-Z]{2,5}\b|the shares|the stock)`,
    'gim',
  );
  for (const m of c.text.matchAll(re)) {
    const word = (m[1] || m[2] || m[3]).toLowerCase();
    const at = m.index! + m[0].toLowerCase().lastIndexOf(word);
    ratings.push({ word, cls: RATING_CLASS[word.replace(/-/g, ' ')], from: at, to: at + word.length });
  }
  if (new Set(ratings.map((r) => r.cls)).size > 1) {
    const main = ratings[0];
    for (const r of ratings.filter((x) => x.cls !== main.cls))
      add(c, {
        from: r.from,
        to: r.to,
        kind: 'rating',
        category: 'consistency',
        title: 'Two ratings',
        message: `The note opens with a “${main.word}” rating; this says “${r.word}”. A reader — or compliance — will ask which it is.`,
        related: { from: main.from, to: main.to },
      });
  }
  const opts = [
    ...c.text.matchAll(
      /\brecommend\w*\b[^.]{0,60}?\b(option|alternative|scenario|approach|vendor)\s+([A-Z0-9]{1,2})\b/gi,
    ),
  ];
  if (new Set(opts.map((m) => `${m[1].toLowerCase()} ${m[2]}`)).size > 1) {
    const first = opts[0];
    for (const m of opts.slice(1).filter((x) => x[2] !== first[2])) {
      const at = m.index! + m[0].lastIndexOf(m[2]);
      add(c, {
        from: at - m[1].length - 1,
        to: at + m[2].length,
        kind: 'option',
        category: 'consistency',
        title: 'Two recommendations',
        message: `Earlier you recommend ${first[1]} ${first[2]}; here it is ${m[1]} ${m[2]}.`,
      });
    }
  }
}

function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}

/** "Corvane" and "Corvaine", "InvenTrack" and "Inventrack" — one name spelled two ways. */
function checkNames(c: Ctx): void {
  const names = new Map(); // spelling → { n, mid, first }
  for (const s of c.S) {
    for (const m of s.masked.matchAll(/(?<![\w’'-])([A-Z][a-z]*[A-Z]?[a-z]+(?:[A-Z][a-z]+)?)(?![\w’'-])/g)) {
      const w = m[1];
      if (w.length < 5) continue;
      const e = names.get(w) || { n: 0, mid: 0, first: s.from + m.index! };
      e.n++;
      // Capitalised mid-sentence is a name; at the start of a sentence it might be any word.
      if (!/(?:^|[.!?:]\s+)[*_“"‘(\s]*$/.test(s.masked.slice(0, m.index!))) e.mid++;
      names.set(w, e);
    }
  }
  const list = [...names].filter(([, e]) => e.mid > 0);
  const flagged = new Set();
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const [a, ea] = list[i];
      const [b, eb] = list[j];
      if (a[0] !== b[0]) continue;
      const la = a.toLowerCase();
      const lb = b.toLowerCase();
      if ([`${la}s`, `${la}es`].includes(lb) || [`${lb}s`, `${lb}es`].includes(la)) continue;
      if (la !== lb && (Math.min(a.length, b.length) < 6 || distance(la, lb) > 1)) continue;
      const [main, odd] =
        ea.n >= eb.n
          ? [
              [a, ea],
              [b, eb],
            ]
          : [
              [b, eb],
              [a, ea],
            ];
      if (flagged.has(odd[0]) || odd[1].n > 2 || main[1].n < 2) continue;
      flagged.add(odd[0]);
      add(c, {
        from: odd[1].first,
        to: odd[1].first + odd[0].length,
        kind: 'name',
        category: 'consistency',
        title: 'Spelled two ways',
        message: `Elsewhere this is “${main[0]}” (${main[1].n}×). A misspelt name is the first thing readers notice.`,
        suggestion: main[0],
      });
    }
  }
}

// British and American spelling, in two independent dimensions — Oxford
// spelling legitimately pairs "-ize" with "colour".
const IZE_STEMS =
  'organ real recogn priorit optim modern standard minim maxim final util categor summar custom central digit monet capital character author apolog critic special visual normal synchron stabil mobil memor emphas general industrial local global rational legal familiar harmon item subsid symbol theor initial personal commercial energ sympath patron neutral human civil fertil steril jeopard fantas galvan'.split(
    ' ',
  );
const IZE_RE = new RegExp(`\\b(?:${IZE_STEMS.join('|')})i([sz])(?:e|es|ed|ing|ation|ations|er|ers)\\b`, 'g');
const YSE_RE = /\b(?:anal|paral|catal)y([sz])(?:e|ed|ing|er|ers)\b/g;
const UK_US: [uk: string, us: string][] = [
  ['colour', 'color'],
  ['colours', 'colors'],
  ['coloured', 'colored'],
  ['behaviour', 'behavior'],
  ['behaviours', 'behaviors'],
  ['behavioural', 'behavioral'],
  ['favour', 'favor'],
  ['favourite', 'favorite'],
  ['favourable', 'favorable'],
  ['honour', 'honor'],
  ['labour', 'labor'],
  ['neighbour', 'neighbor'],
  ['flavour', 'flavor'],
  ['humour', 'humor'],
  ['harbour', 'harbor'],
  ['rumour', 'rumor'],
  ['endeavour', 'endeavor'],
  ['centre', 'center'],
  ['centres', 'centers'],
  ['centred', 'centered'],
  ['theatre', 'theater'],
  ['fibre', 'fiber'],
  ['litre', 'liter'],
  ['calibre', 'caliber'],
  ['defence', 'defense'],
  ['offence', 'offense'],
  ['travelled', 'traveled'],
  ['travelling', 'traveling'],
  ['traveller', 'traveler'],
  ['modelling', 'modeling'],
  ['modelled', 'modeled'],
  ['labelled', 'labeled'],
  ['labelling', 'labeling'],
  ['fuelled', 'fueled'],
  ['signalled', 'signaled'],
  ['totalled', 'totaled'],
  ['jewellery', 'jewelry'],
  ['catalogue', 'catalog'],
  ['grey', 'gray'],
  ['ageing', 'aging'],
  ['enrolment', 'enrollment'],
  ['fulfilment', 'fulfillment'],
  ['instalment', 'installment'],
  ['skilful', 'skillful'],
  ['wilful', 'willful'],
  ['aluminium', 'aluminum'],
  ['manoeuvre', 'maneuver'],
  ['mould', 'mold'],
  ['sceptical', 'skeptical'],
  ['sceptic', 'skeptic'],
];
const UK_WORD = new Map(UK_US);
const US_WORD = new Map(UK_US.map(([uk, us]): [string, string] => [us, uk]));
const REGIONAL_RE = new RegExp(`\\b(?:${[...UK_WORD.keys(), ...US_WORD.keys()].join('|')})\\b`, 'g');

// Variants with no regional excuse.
const VARIANTS = [
  ['email', 'e-mail'],
  ['website', 'web site'],
  ['online', 'on-line'],
  ['ecommerce', 'e-commerce'],
  ['dataset', 'data set'],
  ['startup', 'start-up'],
  ['healthcare', 'health care'],
  ['percent', 'per cent'],
  ['cybersecurity', 'cyber security', 'cyber-security'],
  ['onboarding', 'on-boarding'],
  ['nonprofit', 'non-profit'],
  ['coworker', 'co-worker'],
  ['Wi-Fi', 'WiFi', 'wifi'],
];

function checkSpellingVariants(c: Ctx): void {
  // Lowercase only: a capitalised "Harbor" may be a name ("Harbor & Pine").
  type Hit = { word: string; from: number; to: number };
  const tally = (re: RegExp, side: (m: RegExpExecArray) => 'a' | 'b' | null) => {
    const out: { a: Hit[]; b: Hit[] } = { a: [], b: [] };
    for (const s of c.S) {
      for (const m of s.masked.matchAll(re)) {
        if (m[0][0] !== m[0][0].toLowerCase()) continue;
        const k = side(m);
        if (k) out[k].push({ word: m[0], from: s.from + m.index!, to: s.from + m.index! + m[0].length });
      }
    }
    return out;
  };
  const report = (
    found: { a: Hit[]; b: Hit[] },
    labelA: string,
    labelB: string,
    convert: (word: string) => string | undefined,
  ) => {
    if (!found.a.length || !found.b.length) return;
    const [main, odd, label] =
      found.a.length >= found.b.length ? [found.a, found.b, labelA] : [found.b, found.a, labelB];
    const examples = [...new Set(main.map((x) => x.word))].slice(0, 3).join(', ');
    for (const x of odd.slice(0, 3))
      add(c, {
        from: x.from,
        to: x.to,
        kind: 'spelling-variant',
        category: 'consistency',
        title: 'Mixed spelling',
        message: `Elsewhere you use ${label} spelling (${examples}). Pick one and stick to it.`,
        suggestion: convert(x.word),
      });
  };
  const flip = (w: string, re: RegExp) =>
    w.replace(re, (y: string) => (y.endsWith('s') ? `${y.slice(0, -1)}z` : `${y.slice(0, -1)}s`));
  report(
    tally(IZE_RE, (m) => (m[1] === 's' ? 'a' : 'b')),
    '-ise',
    '-ize',
    (w) => flip(w, /i[sz](?=e|ation|er|ing)/),
  );
  report(
    tally(YSE_RE, (m) => (m[1] === 's' ? 'a' : 'b')),
    'British',
    'American',
    (w) => flip(w, /y[sz]/),
  );
  report(
    tally(REGIONAL_RE, (m) => (UK_WORD.has(m[0]) ? 'a' : US_WORD.has(m[0]) ? 'b' : null)),
    'British',
    'American',
    (w) => UK_WORD.get(w) || US_WORD.get(w),
  );
  for (const group of VARIANTS) {
    const counts = group
      .map((v) => {
        const re = new RegExp(`(?<![\\w-])${esc(v).replace(/ /g, '\\s')}(?![\\w-])`, 'gi');
        const hits = c.S.flatMap((s) =>
          [...s.masked.matchAll(re)]
            .filter((m) => m[0].toLowerCase() === v.toLowerCase() && (v !== v.toLowerCase() ? m[0] === v : true))
            .map((m) => ({ from: s.from + m.index!, to: s.from + m.index! + m[0].length, word: m[0] })),
        );
        return { v, hits };
      })
      .filter((x) => x.hits.length);
    if (counts.length < 2) continue;
    counts.sort((a, b) => b.hits.length - a.hits.length);
    for (const other of counts.slice(1)) {
      const x = other.hits[0];
      const fix =
        x.word[0] === x.word[0].toUpperCase() ? counts[0].v[0].toUpperCase() + counts[0].v.slice(1) : counts[0].v;
      add(c, {
        from: x.from,
        to: x.to,
        kind: 'spelling-variant',
        category: 'consistency',
        title: 'Spelled two ways',
        message: `You write “${counts[0].v}” ${counts[0].hits.length}× and “${other.v}” ${other.hits.length}×. Pick one.`,
        suggestion: fix,
      });
    }
  }
}

const TERM_GROUPS = [
  ['key', 'token', 'secret', 'credential'],
  ['sign in', 'log in', 'login', 'signin'],
  ['directory', 'folder'],
];

/** In docs, different words mean different things — "key" and "token" for one thing confuses. */
function checkTerminology(c: Ctx): void {
  const plain = c.text
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  const lower = plain.toLowerCase();
  for (const group of TERM_GROUPS) {
    const counts = group
      .map((term) => {
        let n = 0;
        let first = -1;
        for (const m of lower.matchAll(new RegExp(`\\b${term.replace(/ /g, '\\s')}s?\\b`, 'g'))) {
          const next = lower.slice(m.index! + m[0].length, m.index! + m[0].length + 9);
          if (term === 'secret' && /^\s*manager/.test(next)) continue;
          if (/^\s*(?:value|name|word|board|stroke|chain|pair)/.test(next)) continue;
          n++;
          if (first === -1) first = m.index!;
        }
        return { term, n, first };
      })
      .filter((x) => x.n);
    const merged = counts;
    if (merged.length < 2) continue;
    merged.sort((a, b) => b.n - a.n);
    const main = merged[0];
    for (const other of merged.slice(1)) {
      const original = c.text.slice(other.first, other.first + other.term.length);
      const fix =
        original[0] === original[0].toUpperCase() ? main.term[0].toUpperCase() + main.term.slice(1) : main.term;
      add(c, {
        from: other.first,
        to: other.first + other.term.length,
        kind: 'terminology',
        category: 'consistency',
        title: 'Terminology',
        message: `You call the same thing “${main.term}” (${main.n}×) and “${other.term}” (${other.n}×). In docs, readers assume different words mean different things — pick one.`,
        suggestion: other.n === 1 ? fix : '',
      });
    }
  }
}

/** "24 hours" here and "48 hours by default" there, for the same setting. */
function checkDurations(c: Ctx): void {
  const plain = c.text.replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length));
  const DUR =
    /\b(default|grace period|timeout|time-out|expir\w*|ttl|retention|revoked after|valid for)\b[^.\n]{0,60}?(\d+(?:\.\d+)?)\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?)\b|(\d+(?:\.\d+)?)\s*(seconds?|minutes?|hours?|days?|weeks?)\s+(?:by default|grace period)/gi;
  const toSec = (n: number, u: string) =>
    n * (/^s/i.test(u) ? 1 : /^m/i.test(u) ? 60 : /^h/i.test(u) ? 3600 : /^d/i.test(u) ? 86400 : 604800);
  const byTopic = new Map<string, { secs: number; raw: string; from: number; to: number }[]>();
  for (const m of plain.matchAll(DUR)) {
    const num = m[2] || m[4];
    const u = m[3] || m[5];
    const around = plain.slice(Math.max(0, m.index! - 80), m.index! + m[0].length + 40).toLowerCase();
    const topic = /grace|old (?:key|token|secret|one)|keeps? working|revok/.test(around)
      ? 'grace period'
      : /session/.test(around)
        ? 'session'
        : /expir|valid/.test(around)
          ? 'expiry'
          : (m[1] || 'default').toLowerCase();
    const at = m.index! + m[0].lastIndexOf(num);
    const raw = plain.slice(at, at + m[0].length).match(/^\d+(?:\.\d+)?\s*\w+/)![0];
    if (!byTopic.has(topic)) byTopic.set(topic, []);
    byTopic.get(topic)!.push({ secs: toSec(Number(num), u), raw, from: at, to: at + raw.length });
  }
  for (const [topic, list] of byTopic) {
    const a = list[0];
    const b = list.find((x) => x.secs !== a.secs);
    if (!b) continue;
    c.facts.push(`CONFLICT: the draft gives both ${a.raw} and ${b.raw} for the ${topic}.`);
    add(c, {
      from: b.from,
      to: b.to,
      kind: 'conflict',
      category: 'consistency',
      title: 'Contradiction',
      message: `Earlier the draft gives ${a.raw} for the ${topic}; here it says ${b.raw}. Readers will follow whichever they read last.`,
      related: { from: a.from, to: a.to },
    });
  }
}

/** Something material mentioned elsewhere that the risks section never covers. */
function checkRiskCoverage(c: Ctx): void {
  const risk = c.SEC.find((s) => /\brisks?\b/i.test(s.title) && !/mitigat|appetite/i.test(s.title));
  if (!risk) return;
  const riskText = c.text.slice(risk.from, risk.to).toLowerCase();
  const CUES = [
    {
      re: /\b(?:largest|biggest|top|single|one|main|key) (?:customer|client)s?\b|\bcustomer concentration\b|\baccounted for (?:about |roughly |~)?\d+(?:\.\d+)?% of (?:\w+ )?(?:revenue|sales)\b/i,
      covered:
        /concentration|largest customer|biggest customer|top customers?|single customer|key customer|main customer/,
      label: 'customer concentration',
    },
    {
      re: /\b(?:single[- ]sourc\w*|sole[- ]sourc\w*|sole supplier|one supplier|single supplier)\b/i,
      covered: /suppl|sourc/,
      label: 'supplier concentration',
    },
    {
      re: /\b(?:up for renewal|renewal|renews?|expires?|expiry)\b[^.]*\b(?:20\d\d|January|February|March|April|May|June|July|August|September|October|November|December)\b/i,
      covered: /renew|expir/,
      label: 'the contract renewal',
    },
    {
      re: /\b(?:litigation|lawsuit|class action|antitrust|investigation by)\b/i,
      covered: /litigation|lawsuit|legal|regulat|investigation/,
      label: 'the legal exposure',
    },
    {
      re: /\b(?:debt|notes|loan|facility|bonds?) (?:matur\w+|due|comes? due)\b/i,
      covered: /debt|refinanc|maturit|liquidity/,
      label: 'the debt maturity',
    },
  ];
  const gaps: { label: string; quote: string; from: number; to: number }[] = [];
  for (const s of c.S) {
    if (s.from >= risk.headingFrom && s.to <= risk.to) continue;
    for (const cue of CUES) {
      if (gaps.some((g) => g.label === cue.label) || !cue.re.test(s.text)) continue;
      // A name from the sentence ("Halberd Logistics") that the risks section uses counts as covered.
      const names = [...s.text.matchAll(/(?<=\s)([A-Z][a-z]{3,})(?=(?:\s+[A-Z][a-z]+)+)/g)].map((m) =>
        m[1].toLowerCase(),
      );
      if (cue.covered.test(riskText) || names.some((n) => riskText.includes(n))) continue;
      gaps.push({ label: cue.label, quote: s.text, from: s.from, to: s.to });
    }
  }
  if (!gaps.length) return;
  const labels = gaps.map((g) => g.label);
  const what = labels.length > 1 ? `${labels.slice(0, -1).join(', ')} or ${labels.at(-1)!}` : labels[0];
  add(c, {
    from: risk.headingFrom,
    to: risk.headingTo,
    kind: 'risk-gap',
    category: 'consistency',
    title: 'Missing risk',
    message: `“${risk.title}” doesn’t cover ${what}, though the draft says: “${clip(gaps[0].quote)}”`,
    related: { from: gaps[0].from, to: gaps[0].to },
  });
}

// ═══════════════════════════════════════════════════════════ FACT-CHECK

const SOURCE_CUE =
  /\b(?:(?:industry|recent|many|several|independent|academic|scientific)\s+)?(?:studies|research|data|surveys?|experts?|analysts?|reports?|scientists|economists)\s+(?:show|shows|suggest|suggests|prove|proves|agree|say|says|found|find|indicate|indicates|confirm|confirms|have shown)\b|\bindustry (?:studies|research|data|benchmarks)\b|\bit is (?:well[- ])?known\b|\baccording to (?:industry|experts|research|studies|analysts)\b|\bevidence (?:shows|suggests)\b|\bresearch has (?:shown|found)\b/i;
const SHARE_CUE =
  /\b\d+(?:\.\d+)?%\s+(?:of|share of)\s+(?:the\s+)?(?:[\w-]+\s+){0,6}market\b|\bmarket share of\s+(?:about |roughly |~)?\d+/i;
const CITED = /\]\(|\[\d+\]|\[\^|\(source|\bsource:|\bper\s+[A-Z]|according to [A-Z][\w&]+|\(\d{4}\)/;
const SUPERLATIVE =
  /\b(?:is|was|are|were|became|becomes|remains|remained)\s+(?:now\s+|still\s+)?(?:the\s+|(?:the\s+)?(?:world|country|nation|industry|market|europe|america|britain)(?:'|’)s\s+)(?:first|only|largest|biggest|smallest|fastest[- ]growing|fastest|oldest|cheapest|highest|lowest|leading|number one|#1|most (?:popular|widely used|valuable|successful|profitable|trusted|downloaded))\b(?!\s+(?:way|option|choice|thing|time|step|one|reason|part|place|person))/i;
const GROUP_STAT =
  /\b\d+(?:\.\d+)?%\s+of\s+(?:all\s+)?(?:\w+\s+){0,2}(?:people|adults|americans|britons|users|customers|consumers|employees|workers|managers|developers|companies|businesses|firms|retailers|teams|organi[sz]ations|executives|leaders|ceos|cfos|respondents|shoppers|patients|students|parents|investors|startups|projects)\b|\b(?:one|two|three|four|[1-4]) (?:in|out of) (?:three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:\w+\s+){0,2}(?:people|adults|users|customers|employees|workers|companies|businesses|projects|startups|teams)\b/i;
const COMPARATIVE_STAT =
  /\b\d+(?:\.\d+)?(?:%|x| times)\s+(?:more|less|fewer|higher|lower|faster|slower|better|worse|likelier|cheaper)\b/i;
const QUOTE =
  /[“"]([^”"\n]{30,})[”"]\s*,?\s*(?:said|says|wrote|writes|told|explained|added|noted)\b|\b(?:said|says|wrote|told|according to)\s+(?:[A-Z][\w.'’-]+\s?){1,4}[,:]?\s*[“"][^”"\n]{30,}[”"]/;
const TIMELY =
  /\b(?:currently|right now|at present|as of (?:now|today)|today|this year|so far this year|recently|the latest|nowadays)\b/i;
const STOP = new Set(
  'the a an and or of to in on for with by at from as is are was were be been that this these those it its their our your his her they we you he she which who whom whose what when where why how than then so but not no into over under about after before between during per each every all any some most more less such very just also only'.split(
    ' ',
  ),
);
const DATED =
  /\b\d{1,2} (?:January|February|March|April|May|June|July|August|September|October|November|December) 20\d\d\b|\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2},? 20\d\d\b/;

/** Claims a fact-checker would pull out: unsourced statistics, superlatives, quotes, time-sensitive figures — and figures your own notes contradict. */
function checkFactClaims(c: Ctx): void {
  const article = c.genre === 'article';
  const dated = DATED.test(c.text.slice(0, 400));
  for (const s of c.S) {
    const t = s.masked;
    const sourced = CITED.test(lineAt(c.text, s.from));
    const hit = (re: RegExp) => {
      const m = t.match(re);
      return m ? { from: s.from + m.index!, to: s.from + m.index! + m[0].length, text: m[0] } : null;
    };
    // In order; the first that matches is the one flagged.
    const rules: {
      when: boolean;
      find: () => ReturnType<typeof hit>;
      kind: string;
      title: string;
      message: (quote: string) => string;
    }[] = [
      {
        when: !sourced,
        find: () => hit(SOURCE_CUE),
        kind: 'source',
        title: 'Needs a source',
        message: (q) => `“${q}” — which study, which data? Name and link the source, or cut the claim.`,
      },
      {
        when: !sourced,
        find: () => hit(SHARE_CUE),
        kind: 'share',
        title: 'Needs a source',
        message: () =>
          'A market-share figure is the first number a skeptical reader checks. Say whose estimate it is, and when it was made.',
      },
      {
        when: !sourced,
        find: () => hit(GROUP_STAT) || (article ? hit(COMPARATIVE_STAT) : null),
        kind: 'stat',
        title: 'Unsourced statistic',
        message: (q) => `“${q}” — according to whom, measured how, and when? Link the source.`,
      },
      {
        when: c.genre !== 'technical' && !sourced,
        find: () => hit(SUPERLATIVE),
        kind: 'superlative',
        title: 'Check this superlative',
        message: (q) => `“${q}” can be disproved with one counter-example. Verify it and cite it, or soften it.`,
      },
      {
        when: article && !/\]\(/.test(lineAt(c.text, s.from)),
        find: () => hit(QUOTE),
        kind: 'quote',
        title: 'Check the quote',
        message: () => 'Check this quote word for word against the original, and link to where it was said.',
      },
      {
        when: !dated && article && TIMELY.test(t) && numbersIn(t).some((n) => !isYear(n) && (n.unit || n.value >= 100)),
        find: () => hit(TIMELY),
        kind: 'dated',
        title: 'Will go out of date',
        message: (q) =>
          `“${q}” changes meaning soon after you publish. Say when the figure was true (“as of March 2026”).`,
      },
    ];
    for (const rule of rules) {
      const f = rule.when ? rule.find() : null;
      if (!f) continue;
      add(c, {
        from: f.from,
        to: f.to,
        kind: rule.kind,
        category: 'factcheck',
        title: rule.title,
        message: rule.message(f.text),
      });
      break;
    }
  }
  checkAgainstSources(c);
}

/** Content words near a number — enough to recognise the same figure in the notes. */
function contextWords(str: string, index: number, length: number): Set<string> {
  const before =
    str
      .slice(Math.max(0, index - 60), index)
      .toLowerCase()
      .match(/[a-z][a-z-]{2,}/g) || [];
  const after =
    str
      .slice(index + length, index + length + 60)
      .toLowerCase()
      .match(/[a-z][a-z-]{2,}/g) || [];
  return new Set(
    [...before.slice(-4), ...after.slice(0, 4)].filter((w) => !STOP.has(w)).map((w) => w.replace(/(?:ies|es|s)$/, '')),
  );
}

/** A figure in the draft that the writer's own notes give differently. */
function checkAgainstSources(c: Ctx): void {
  if (!c.sources || !/\d/.test(c.sources)) return;
  const src = c.sources;
  const known = numbersIn(src)
    .filter((n) => !isYear(n))
    .map((n) => ({ n, ctx: contextWords(src, n.index!, n.length) }));
  const exact = new Set(known.map((k) => k.n.raw.replace(/\s/g, '')));
  for (const s of c.S) {
    for (const n of numbersIn(s.masked)) {
      if (isYear(n) || (n.unit === '' && n.value < 10) || exact.has(n.raw.replace(/\s/g, ''))) continue;
      const ctx = contextWords(s.masked, n.index!, n.length);
      let best = null;
      for (const k of known) {
        if (k.n.unit !== n.unit) continue;
        const shared = [...ctx].filter((w) => k.ctx.has(w)).length;
        if (shared >= 2 && (!best || shared > best.shared)) best = { k, shared };
      }
      if (!best) continue;
      if (matches(best.k.n.value, n) || matches(n.value, best.k.n)) {
        c.facts.push(`MATCHES THE WRITER'S NOTES: ${n.raw}.`);
        continue;
      }
      if (best.shared < 3) continue;
      const at = best.k.n.index!;
      const line = src
        .slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at) === -1 ? undefined : src.indexOf('\n', at))
        .trim();
      add(c, {
        from: s.from + n.index!,
        to: s.from + n.index! + n.length,
        kind: 'notes-mismatch',
        category: 'factcheck',
        title: 'Differs from your notes',
        message: `Your notes say ${best.k.n.raw}: “${clip(line, 120)}”`,
        suggestion: best.k.n.raw,
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════ LOGIC

const CORRELATION =
  /\b(?:correlat\w*|associated with|linked (?:to|with)|coincid\w*|at the same time|went hand in hand|goes hand in hand|tend to)\b/i;
const CAUSAL =
  /\b(?:caus\w*|leads? to|led to|drives?|drove|driven by|results? in|resulted in|because|thanks to|due to|responsible for)\b/i;
interface LogicRule {
  kind: string;
  title: string;
  re: RegExp;
  message: (match: string) => string;
  /** Match against the sentence with its leading emphasis removed. */
  start?: boolean;
  /** Flag the whole sentence, not just the match. */
  whole?: boolean;
}

const LOGIC: LogicRule[] = [
  {
    kind: 'generalisation',
    title: 'Sweeping generalisation',
    re: /\b(?:(?:everyone|everybody|nobody|no one)\b(?!\s+(?:on|in|at|who|from|here|else|involved|present|there|I|we)\b)|all (?:of )?(?:the )?(?:customers|users|investors|companies|analysts|experts|people|businesses|retailers|developers|managers|teams|employees|readers|consumers|leaders|founders|engineers|writers|buyers)|every (?:customer|user|investor|company|analyst|expert|business|retailer|developer|manager|team|employee|reader|consumer|leader|founder|engineer|buyer))\b/i,
    message: (m) => `“${m}” — one counter-example breaks it. Say “most” or “many”, or give the number.`,
  },
  {
    kind: 'assertion',
    title: 'Asserted, not argued',
    start: true,
    re: /\b(?:obviously|undeniabl[ey]|unquestionabl[ey]|indisputabl[ey]|it goes without saying|without (?:a|any) doubt|there is no doubt|everyone knows|it is (?:clear|obvious) that|(?:this|which|that|it) (?:proves|proved)|proves that)\b|^clearly,|\bclearly (?:is|are|was|were|shows?|showed|demonstrates?|proves?)\b/i,
    message: () => 'Saying it’s obvious doesn’t make the case — show the evidence or the reasoning instead.',
  },
  {
    kind: 'post-hoc',
    title: 'After, therefore because?',
    start: true,
    whole: true,
    re: /^(?:since|after|following|ever since)\b(?!\s+(?:the\s+)?(?:start|end|beginning|early|late|mid|last|19\d\d|20\d\d|Q[1-4]|january|february|march|april|may|june|july|august|september|october|november|december|\d))[^,]{3,90},[^.]*\b(?:rose|fell|grew|increased|decreased|jumped|dropped|doubled|tripled|halved|improved|declined|soared|climbed|surged|plunged|went up|went down)\b/i,
    message: () => 'One thing following another isn’t proof that it caused it. What else changed at the same time?',
  },
  {
    kind: 'dichotomy',
    title: 'False choice',
    re: /\b(?:the only (?:way|option|choice|alternative|path)|no (?:other )?(?:choice|alternative|option) (?:but|than)|there are (?:only )?two (?:options|choices|ways|paths)|(?:adapt|innovate|change|modernise|modernize|transform|evolve|act) or (?:die|perish|fail|be left behind|fall behind|become irrelevant|disappear))\b|\beither\b[^.]{3,80}\bor\b[^.]{0,60}\b(?:die|perish|fail|left behind|fall behind|irrelevant|obsolete|disappear|go out of business|extinct)\b/i,
    message: () => 'This frames it as the only option. Name the alternatives and say why they lose.',
  },
  {
    kind: 'slope',
    title: 'Slippery slope',
    re: /\b(?:will inevitably|inevitably (?:leads?|lead) to|it(?:'|’)?s only a matter of time|it is only a matter of time|next thing you know|opens? the floodgates|slippery slope)\b/i,
    message: () => 'Each step in this chain needs its own support — why would one lead to the next?',
  },
  {
    kind: 'bandwagon',
    title: 'Everyone-else argument',
    re: /\b(?:everyone is (?:doing|using|switching|moving|adopting)|(?:all|most) (?:the )?(?:top|leading|best|successful|smart) (?:companies|firms|teams|retailers|brands|investors|businesses) (?:are|use|have|do)|best[- ]in[- ]class (?:\w+ )?(?:retailers|companies|firms|operators|teams|businesses|organi[sz]ations) (?:move|do|use|have|are|invest)|industry leaders (?:are|have|already)|(?:our )?competitors (?:are|have) (?:all )?already)\b/i,
    message: () => 'What others do isn’t a reason on its own — say why it is right for you, with your numbers.',
  },
];

function checkLogic(c: Ctx): void {
  if (c.genre === 'technical') return;
  for (const s of c.S) {
    // Ignore leading emphasis so "**Obviously**" still starts the sentence.
    const t = s.masked.replace(/^[*_\s]+/, (m) => ' '.repeat(m.length));
    const lead = t.length - t.trimStart().length;
    let flagged = false;
    for (const rule of LOGIC) {
      const m = (rule.start ? t.trimStart() : t).match(rule.re);
      if (!m) continue;
      const at = s.from + (rule.start ? lead : 0) + m.index!;
      add(c, {
        from: at,
        to: rule.whole ? s.to : at + m[0].length,
        kind: rule.kind,
        category: 'logic',
        title: rule.title,
        message: rule.message(m[0]),
      });
      flagged = true;
      break;
    }
    if (!flagged && CORRELATION.test(t) && CAUSAL.test(t)) {
      const m = t.match(CORRELATION)!;
      add(c, {
        from: s.from + m.index!,
        to: s.from + m.index! + m[0].length,
        kind: 'causation',
        category: 'logic',
        title: 'Correlation or cause?',
        message:
          'This treats two things that move together as cause and effect. What rules out the other explanations?',
      });
    }
  }
}

// ═══════════════════════════════════════════════════════════ LANGUAGE, COMPLIANCE, PROCEDURE

const PROMISES_INVEST =
  /\b(?:guarantee[ds]?|risk[- ]free|can(?:'|’|no)t lose|cannot lose|no[- ]brainer|sure thing|will (?:double|triple|10x)|certain to (?:rise|win|beat|double)|act now|buy now|once[- ]in[- ]a[- ]lifetime|easy money|can only go up|free money|no downside)\b/i;
const PROMISES_BUSINESS =
  /\b(?:guaranteed (?:returns?|upside|savings|roi|results|success|growth|profits?|payback)|risk[- ]free|can(?:'|’|no)t (?:lose|fail)|cannot (?:lose|fail)|no[- ]brainer|sure thing|no downside)\b/i;
const FORWARD =
  /\bwill\s+(?:reach|hit|grow|double|triple|deliver|achieve|expand|return|outperform|rise|climb|re-?rate|beat|exceed|generate|become)\b/i;
const CAVEAT =
  /\b(?:we|I)\s+(?:expect|believe|think|estimate|forecast|project|anticipate)\b|\b(?:could|may|might|likely|should|if|assum\w*|estimat\w*|forecast\w*|expected|projected|base case|bull case|bear case)\b/i;
const VAGUE_REQ =
  /\b(?:fast|quick(?:ly)?|user[- ]friendly|intuitive|seamless(?:ly)?|scalable|robust|flexible|easy to use|simple|modern|efficient|as soon as possible|asap|all (?:of )?(?:our |the )?existing(?: \w+)?|real[- ]time|best[- ]in[- ]class|state[- ]of[- ]the[- ]art|world[- ]class)\b/gi;
const MUST = /\b(?:must|should|shall|needs? to|required to|will need to|has to|have to)\b/i;
const MISSPELLINGS: Record<string, string> = {
  succesful: 'successful',
  successfull: 'successful',
  succesfully: 'successfully',
  recieve: 'receive',
  recieved: 'received',
  seperate: 'separate',
  seperately: 'separately',
  occured: 'occurred',
  occurence: 'occurrence',
  definately: 'definitely',
  accomodate: 'accommodate',
  untill: 'until',
  wich: 'which',
  teh: 'the',
  adn: 'and',
  alot: 'a lot',
  enviroment: 'environment',
  dependancy: 'dependency',
  existance: 'existence',
  independant: 'independent',
  neccessary: 'necessary',
  necesary: 'necessary',
  occassion: 'occasion',
  persistant: 'persistent',
  priviledge: 'privilege',
  refered: 'referred',
  reponse: 'response',
  retreive: 'retrieve',
  sucess: 'success',
  thier: 'their',
  tommorow: 'tomorrow',
  wierd: 'weird',
  publically: 'publicly',
  arguement: 'argument',
  calender: 'calendar',
  concensus: 'consensus',
  guage: 'gauge',
  liason: 'liaison',
  millenium: 'millennium',
  noticable: 'noticeable',
  recomend: 'recommend',
  recommand: 'recommend',
  relevent: 'relevant',
  supercede: 'supersede',
  truely: 'truly',
  begining: 'beginning',
  beleive: 'believe',
  commited: 'committed',
  comming: 'coming',
  completly: 'completely',
  embarass: 'embarrass',
  goverment: 'government',
  immediatly: 'immediately',
  knowlege: 'knowledge',
  maintainance: 'maintenance',
  managment: 'management',
  paramter: 'parameter',
  perfomance: 'performance',
  posession: 'possession',
  reccomend: 'recommend',
  resouce: 'resource',
  similiar: 'similar',
  strenght: 'strength',
  threshhold: 'threshold',
  usefull: 'useful',
  writting: 'writing',
};

function checkLanguage(c: Ctx): void {
  const g = c.genre;
  for (const s of c.S) {
    const t = s.masked;
    const hit = (re: RegExp) => {
      const m = t.match(re);
      return m ? { from: s.from + m.index!, to: s.from + m.index! + m[0].length, text: m[0] } : null;
    };
    const p = g === 'investment' ? hit(PROMISES_INVEST) : g === 'business' ? hit(PROMISES_BUSINESS) : null;
    if (p)
      add(c, {
        ...p,
        kind: 'promise',
        category: 'compliance',
        title: 'Promises an outcome',
        message: `“${p.text}” promises what no one can promise. ${g === 'investment' ? 'In a published note this is a compliance problem.' : 'A careful reader stops trusting the rest.'}`,
      });
    if (g === 'investment') {
      const f = hit(FORWARD);
      if (f && !CAVEAT.test(t))
        add(c, {
          ...f,
          kind: 'forward',
          category: 'compliance',
          title: 'Forecast stated as fact',
          message:
            'A forecast stated as certain. Frame it as your expectation (“we expect…”) and say what it depends on.',
        });
    }
    if ((g === 'business' || g === 'technical') && MUST.test(t)) {
      const vague = [...t.matchAll(VAGUE_REQ)];
      if (vague.length) {
        const last = vague.at(-1)!;
        add(c, {
          from: s.from + vague[0].index!,
          to: s.from + last.index! + last[0].length,
          kind: 'vague',
          category: 'clarity',
          title: 'Can’t be tested',
          message: `${vague.map((m) => `“${m[0]}”`).join(', ')} can’t be signed off. Give each a measure — a response time, a task completion rate, the list of systems.`,
        });
      }
    }
    for (const m of t.matchAll(/[A-Za-z]+/g)) {
      const right = MISSPELLINGS[m[0].toLowerCase()];
      if (right)
        add(c, {
          from: s.from + m.index!,
          to: s.from + m.index! + m[0].length,
          kind: 'spelling',
          category: 'grammar',
          title: 'Spelling',
          message: `Did you mean “${right}”?`,
          suggestion: m[0][0] === m[0][0].toUpperCase() ? right[0].toUpperCase() + right.slice(1) : right,
        });
    }
  }
}

const SHELL_BUILTINS = new Set(
  'cd ls echo export cat grep sudo mkdir cp mv rm source set unset sed awk chmod touch printf read test true false which env pwd head tail sort uniq wc tee xargs find exit then fi do done else if for while'.split(
    ' ',
  ),
);
const VAGUE_STEP =
  /\b(?:everywhere(?: it is used)?|as needed|as required|as necessary|appropriately|properly|accordingly|where relevant|if needed)\b|\b(?:restart|redeploy|reload|update|configure)\s+(?:the|your)\s+(?:service|app|application|server|config|settings)s?(?=\s*\.?\s*$)/i;
const SECRET =
  /\b(?:(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{6,}|[a-z]{2,6}_live_[A-Za-z0-9]{6,}|ghp_[A-Za-z0-9]{20,}|xox[abp]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g;

function checkProcedure(c: Ctx): void {
  const { text } = c;
  const plain = text
    .replace(/```[\s\S]*?```/g, (m) => ' '.repeat(m.length))
    .replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  // Numbered lists: a new list starts when numbering restarts or a heading intervenes.
  type Item = { n: number; at: number };
  const lists: { items: Item[] }[] = [];
  let cur: { items: Item[] } | null = null;
  let prevAt = 0;
  for (const m of text.matchAll(/^([ \t]*)(\d+)[.)]\s/gm)) {
    const n = Number(m[2]);
    if (!cur || n !== cur.items.length + 1 || /^#{1,6}\s/m.test(text.slice(prevAt, m.index!))) {
      cur = { items: [] };
      lists.push(cur);
    }
    cur.items.push({ n, at: m.index! });
    prevAt = m.index!;
  }
  for (const m of plain.matchAll(/\bstep\s+(\d+)(\s+(?:above|below|earlier|later))?/gi)) {
    const n = Number(m[1]);
    const dir = (m[2] || '').trim().toLowerCase();
    const li = lists.findIndex(
      (l, i) => m.index! >= l.items[0].at && (lists[i + 1]?.items[0]?.at ?? Infinity) > m.index!,
    );
    if (li === -1) continue;
    const list = lists[li];
    const own = list.items.filter((it) => it.at <= m.index!).pop();
    if (!list.items.some((it) => it.n === n))
      add(c, {
        from: m.index!,
        to: m.index! + m[0].length,
        kind: 'step-ref',
        category: 'procedure',
        title: 'Broken step reference',
        message: `This list has no step ${n}.`,
      });
    else if (
      own &&
      (((dir === 'above' || dir === 'earlier') && n >= own.n) || ((dir === 'below' || dir === 'later') && n <= own.n))
    ) {
      // The step the writer probably meant: the same number in an earlier list.
      const meant = lists
        .slice(0, li)
        .reverse()
        .find((l) => l.items.some((it) => it.n === n));
      const heading = meant && [...text.slice(0, meant.items[0].at).matchAll(/^#{1,6}\s+(.*)$/gm)].pop()?.[1];
      add(c, {
        from: m.index!,
        to: m.index! + m[0].length,
        kind: 'step-ref',
        category: 'procedure',
        title: 'Points the wrong way',
        message: `In this list, step ${n} comes ${n >= own.n ? 'after' : 'before'} this one, so readers will look in the wrong place. Name what you mean instead${heading ? ` (e.g. “the check in ${heading}”)` : ''}.`,
      });
    }
  }
  for (const l of lists) {
    for (const it of l.items) {
      const line = lineAt(text, it.at + 1);
      const v = line.match(VAGUE_STEP);
      if (v)
        add(c, {
          from: it.at + v.index!,
          to: it.at + v.index! + v[0].length,
          kind: 'vague-step',
          category: 'procedure',
          title: 'Vague step',
          message: `“${v[0]}” — ${/service|app|server|config|settings/i.test(v[0]) ? 'which one, and with what command' : 'where exactly'}? A reader can’t do this step without guessing.`,
        });
    }
  }
  for (const m of text.matchAll(SECRET))
    add(c, {
      from: m.index!,
      to: m.index! + m[0].length,
      kind: 'secret',
      category: 'compliance',
      title: 'Looks like a real credential',
      message:
        'Readers copy examples verbatim, and secret scanners flag strings like this. Use an obvious placeholder.',
      suggestion: '<YOUR_API_KEY>',
    });
  const pre = c.SEC.find((s) =>
    /before you begin|prerequisites?|requirements|you(?:'|’)ll need|you will need/i.test(s.title),
  );
  if (pre) {
    const preText = text.slice(pre.from, pre.to).toLowerCase();
    const seen = new Set();
    for (const m of text.matchAll(/```([\w-]*)\n([\s\S]*?)```/g)) {
      if (!/^(?:bash|sh|shell|zsh|console|terminal|)$/i.test(m[1])) continue;
      for (const line of m[2].split('\n')) {
        const tool = line
          .trim()
          .replace(/^\$\s*/, '')
          .split(/\s+/)[0];
        if (!tool || !/^[a-z][\w.-]*$/.test(tool) || SHELL_BUILTINS.has(tool) || seen.has(tool)) continue;
        seen.add(tool);
        if (
          !new RegExp(
            `\`${esc(tool)}\`|\\b${esc(tool)}\\s+(?:cli|command[- ]line|tool|sdk|v?\\d)|install\\w*\\s+(?:the\\s+)?${esc(tool)}\\b`,
            'i',
          ).test(preText)
        )
          add(c, {
            from: pre.headingFrom,
            to: pre.headingTo,
            kind: 'prereq',
            category: 'procedure',
            title: 'Missing prerequisite',
            message: `The steps run \`${tool}\`, but “${pre.title}” doesn’t say to install it, or which version.`,
          });
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════ entry point

export const CATEGORY_LABELS = {
  /** The review's note on a paragraph that has not yet made its point (notes.ts). */
  argument: 'Argument',
  numbers: 'Numbers',
  factcheck: 'Fact-check',
  logic: 'Logic',
  consistency: 'Consistency',
  compliance: 'Compliance',
  procedure: 'Procedure',
  clarity: 'Clarity',
  concision: 'Concision',
  structure: 'Structure',
  evidence: 'Needs support',
  tone: 'Tone',
  grammar: 'Grammar',
  style: 'Style',
};

/** One finding per passage per category, and never two on the identical span. */
function dedupe(list: Finding[]): Finding[] {
  const kept: Finding[] = [];
  for (const f of list) {
    if (
      !kept.some(
        (k) => (k.from === f.from && k.to === f.to) || (k.category === f.category && f.from < k.to && k.from < f.to),
      )
    )
      kept.push(f);
  }
  return kept.sort((a, b) => a.from - b.from || a.to - b.to);
}

/**
 * Runs every check that applies to `genre`.
 * @param {string} text  the draft (Markdown)
 * @param {{ genre?: string, sources?: string }} opts  `sources`: the writer's own notes
 * @returns {{ findings: Array<{from,to,kind,category,title,message,suggestion?,related?}>, facts: string[] }}
 *   `facts` state every calculation made — right or wrong — for a model to treat as ground truth.
 */
export function runChecks(
  text: string,
  { genre = 'article', sources = '' }: { genre?: string; sources?: string } = {},
): CheckResult {
  const c: Ctx = {
    text,
    genre: (GENRES as readonly string[]).includes(genre) ? (genre as Genre) : 'article',
    sources,
    S: sentences(text),
    T: tables(text),
    SEC: sections(text),
    out: [],
    facts: [],
    corrections: [],
  };
  const finance = c.genre === 'business' || c.genre === 'investment';
  // Order is priority: when two checks flag the same passage, the first wins.
  checkEquations(c);
  checkRepeats(c);
  checkTables(c);
  if (c.genre !== 'technical') checkBusinessCase(c);
  if (c.genre === 'investment' || /price target|EV\/EBITDA|\bP\/E\b/i.test(text)) checkValuation(c);
  checkProbabilities(c);
  checkTextAgainstTables(c);
  checkStatedValues(c);
  if (finance) checkRecommendations(c);
  checkDurations(c);
  if (finance) checkRiskCoverage(c);
  checkLanguage(c);
  if (c.genre === 'technical') {
    checkProcedure(c);
    checkTerminology(c);
  }
  checkFactClaims(c);
  checkLogic(c);
  checkNames(c);
  checkSpellingVariants(c);
  // The terms registry: used before defined, derived forms, several names for one thing, back after a gap.
  c.out.push(...termFindings(c.text, c.S));
  // Signposts for the reader who skims — technical and scientific only; the module decides.
  // The piece's structure before its sentences: a section with no opening outranks a paragraph note on the same words.
  c.out.push(...signpostFindings(c.text, c.genre, c.S));
  // How it reads comes last: a wrong figure outranks a weak sentence ending on the same words.
  c.out.push(...styleFindings(c.text, c.genre, c.S));
  return { findings: dedupe(c.out), facts: [...new Set(c.facts)] };
}

/** The block a model is given before it reviews or answers. */
export function factsBlock({ findings = [], facts = [] }: Partial<CheckResult>, { limit = 40 } = {}): string {
  const lines = [];
  if (facts.length)
    lines.push(
      'CALCULATIONS CHECKED BY SOFTWARE — exact; treat them as ground truth and do not redo them:',
      ...facts.slice(0, limit).map((f) => `- ${f}`),
    );
  if (findings.length)
    lines.push(
      ...(lines.length ? [''] : []),
      'ALREADY FLAGGED BY SOFTWARE — do not repeat these:',
      ...findings.slice(0, 20).map((f) => `- [${f.category}] ${f.title}: ${clip(f.message, 160)}`),
    );
  return lines.join('\n');
}
