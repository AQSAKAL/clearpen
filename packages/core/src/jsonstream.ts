// Pulls finished pieces out of a JSON document while it is still being
// written, so review notes can appear in the margin one at a time.

/** The string value of `key` once its closing quote has arrived, or null. */
export function completedString(text: string, key: string): string | null {
  const m = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return null;
  try {
    return JSON.parse(`"${m[1]}"`) as string;
  } catch {
    return null;
  }
}

/** The objects written so far in the array under `key`, and whether its closing bracket has arrived. */
function scanArray(text: string, key: string): { items: unknown[]; closed: boolean } | null {
  const k = text.search(new RegExp(`"${key}"\\s*:\\s*\\[`));
  if (k === -1) return null;
  const items: unknown[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  for (let i = text.indexOf('[', k) + 1; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        try {
          items.push(JSON.parse(text.slice(start, i + 1)));
        } catch {
          // A malformed item is skipped; the rest may still be fine.
        }
        start = -1;
      }
    } else if (ch === ']' && depth === 0) {
      return { items, closed: true };
    }
  }
  return { items, closed: false };
}

/** Every object in the array under `key` that has been completely written so far. */
export function completedItems(text: string, key: string): unknown[] {
  return scanArray(text, key)?.items ?? [];
}

/** The whole array under `key` once its closing bracket has arrived, or null while it is still being written. */
export function completedArray(text: string, key: string): unknown[] | null {
  const a = scanArray(text, key);
  return a?.closed ? a.items : null;
}
