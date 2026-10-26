// What models wrap around an answer — thinking tags, preambles, code fences,
// quotation marks, echoed text — removed so the answer drops into place.

const ABBREVIATIONS = new Set([
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'st',
  'sr',
  'jr',
  'vs',
  'etc',
  'e.g',
  'i.e',
  'eg',
  'ie',
  'no',
  'fig',
  'inc',
  'ltd',
  'co',
  'approx',
  'u.s',
  'u.k',
]);

const THINKING = /<think>[\s\S]*?<\/think>/g;

/** Index just past the first sentence ending that is followed by more text, or -1. */
export function firstSentenceEnd(text: string): number {
  for (const m of text.matchAll(/[.!?…]+["”’)]*(?=\s+\S)/g)) {
    if (m[0][0] === '.') {
      const word =
        text
          .slice(0, m.index)
          .match(/([\w.]+)$/)?.[1]
          ?.toLowerCase() || '';
      if (ABBREVIATIONS.has(word) || /^[a-z]$/i.test(word)) continue;
    }
    return m.index + m[0].length;
  }
  return -1;
}

/** Makes a raw completion fit seamlessly at the cursor: one line, one sentence, no echo. */
export function tidyCompletion(raw: string, before: string): string {
  let text = String(raw)
    .replace(THINKING, '')
    .replace(/^```\w*\n?|```$/g, '');
  text = text.replace(/\n[\s\S]*$/, ''); // one line at most
  const end = firstSentenceEnd(text);
  if (end !== -1) text = text.slice(0, end);
  // Models sometimes echo the last words before the cursor; drop the overlap.
  const tail = before.slice(-80);
  for (let n = Math.min(tail.length, text.length); n >= 6; n--) {
    if (tail.endsWith(text.slice(0, n))) {
      text = text.slice(n);
      break;
    }
  }
  if (/^["“].*["”]$/s.test(text.trim()) && !/["“]/.test(before.slice(-3))) text = text.trim().slice(1, -1);
  const prev = before.slice(-1);
  if (!prev || /\s/.test(prev)) text = text.replace(/^[ \t]+/, '');
  else if (/^[A-Za-z0-9(“"']/.test(text) && /[\w.,;:!?)”"']/.test(prev)) text = ` ${text}`;
  return text.replace(/\s+$/, (m) => (m.includes('\n') ? '' : m.slice(0, 1)));
}

export const PREAMBLE_RE = /^(here(’|')?s|here is)[^:\n]*:\s*/i;

/** Strips the wrappers a model sometimes adds around a rewrite. */
export function tidyRewrite(raw: string, original: string): string {
  let text = String(raw).replace(THINKING, '').trim();
  // "Here's the rewrite:" is chatter — unless the author's own passage starts that way.
  if (!PREAMBLE_RE.test(original.trim())) text = text.replace(PREAMBLE_RE, '');
  // Strip a code fence only if the model wrapped its WHOLE answer in one and
  // the passage itself wasn't code — fences inside a passage are content.
  const wrapped = text.match(/^```[\w-]*\n([\s\S]*?)\n?```$/);
  if (wrapped && !/^\s*```/.test(original) && !wrapped[1]!.includes('```')) text = wrapped[1]!;
  if (/^"""[\s\S]*"""$/.test(text)) text = text.slice(3, -3);
  else if (/^["“][\s\S]*["”]$/.test(text) && !/^["“]/.test(original.trim())) text = text.slice(1, -1);
  // Keep the passage's own leading/trailing whitespace so it drops into place.
  const lead = original.match(/^\s*/)![0];
  const trail = original.match(/\s*$/)![0];
  return lead + text.trim() + trail;
}

/** Any model answer as plain text: thinking removed, trimmed. */
export function tidyText(raw: string): string {
  return String(raw).replace(THINKING, '').trim();
}
