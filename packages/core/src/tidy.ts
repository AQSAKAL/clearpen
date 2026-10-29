// What models wrap around an answer — thinking tags, preambles, code fences,
// quotation marks, echoed text — removed so the answer drops into place.

/** Words a full stop follows without ending the sentence: "e.g.", "Dr.", "etc." */
export const ABBREVIATIONS = new Set([
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
    .replace(/^```\w*\n?|```$/g, '')
    // A lead-in ("Three reasons:") draws a list item on a line of its own: it continues this one.
    .replace(/^\s*\n\s*/, '')
    .replace(/^(\s*)(?:[-*+]|\d+[.)])[ \t]+/, '$1');
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

/**
 * A list the model wrote after a lead-in ("Generated examples:"), as it goes
 * at the cursor: each item on a line of its own, as a Markdown list, at most
 * `max`. A line that only introduces the list ("Here are three:") is chatter;
 * an item's quotes are the example's, and stay.
 */
export function tidyList(raw: string, max = 3): string {
  const items = String(raw)
    .replace(THINKING, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/:$/.test(l))
    .map((l) => l.replace(/^(?:[-*+•]|\d+[.)])\s+/, ''))
    .filter(Boolean)
    .slice(0, max);
  return items.map((i) => `\n- ${i}`).join('');
}

/** Whether the model has written `max` items of a list: the last one ended by a line break. */
export const listComplete = (raw: string, max = 3): boolean =>
  (String(raw).match(/^\s*(?:[-*+•]|\d+[.)])\s+\S.*\n/gm) || []).length >= max;

export const PREAMBLE_RE = /^(here(’|')?s|here is)[^:\n]*:\s*/i;

// A command answer, line by line: "Here's the command:" and "Command:" are
// chatter, a fence line or a comment is not the command, and a blank line
// is nothing.
const COMMAND_LABEL_RE = /^(?:the )?(?:command|code)\s*:\s*/i;
const commandLine = (line: string) => line.replace(PREAMBLE_RE, '').replace(COMMAND_LABEL_RE, '').trim();
const isCommandLine = (line: string) => {
  const l = commandLine(line);
  return !!l && !l.startsWith('```') && !l.startsWith('#');
};

/**
 * The one command a model answered with, as the reader would type it: the
 * first line that is one, without the prompt sign or backticks a model copies
 * from a terminal or a Markdown page.
 */
export function tidyCommand(raw: string): string {
  const first = String(raw).replace(THINKING, '').split('\n').find(isCommandLine);
  if (!first) return '';
  const line = commandLine(first).replace(/^(?:\$|>|PS>|PS [^>]*>)\s+/, '');
  // Backticks around the whole line are Markdown; one inside it is the command's.
  return (line.match(/^(`+)\s*(.*?)\s*\1$/)?.[2] ?? line).trim();
}

/** Whether the model has finished its first command line: a newline follows it. */
export function commandComplete(raw: string): boolean {
  const lines = String(raw).replace(THINKING, '').split('\n');
  const at = lines.findIndex(isCommandLine);
  return at !== -1 && at < lines.length - 1;
}

/** A command as it goes at the cursor after a lead-in: inline code, on the same line. */
export function tidyCommandCompletion(raw: string, before: string): string {
  const cmd = tidyCommand(raw);
  if (!cmd) return '';
  // A command with a backtick of its own needs the double-backtick form.
  const code = cmd.includes('`') ? `\`\` ${cmd} \`\`` : `\`${cmd}\``;
  const prev = before.slice(-1);
  return !prev || /\s/.test(prev) ? code : ` ${code}`;
}

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
