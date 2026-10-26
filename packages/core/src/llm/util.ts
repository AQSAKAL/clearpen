// Small pieces every provider needs: combined abort signals, timeouts,
// line-by-line reading of a streamed body, and hiding <think> blocks.

/** Aborts when any of `signals` does. (AbortSignal.any where available.) */
export function anySignal(signals: (AbortSignal | undefined)[]): AbortSignal {
  const list = signals.filter((s): s is AbortSignal => !!s);
  if (list.length === 1) return list[0]!;
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(list);
  const ctrl = new AbortController();
  for (const s of list) {
    if (s.aborted) {
      ctrl.abort(s.reason);
      break;
    }
    s.addEventListener('abort', () => ctrl.abort(s.reason), { once: true });
  }
  return ctrl.signal;
}

/** A signal that aborts after `ms`, combined with `signal`; call `clear` when done. */
export function timeoutSignal(ms: number, signal?: AbortSignal): { signal: AbortSignal; clear: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new Error('timeout')), ms);
  return { signal: anySignal([signal, ctrl.signal]), clear: () => clearTimeout(timer) };
}

/** Reads a streamed response body line by line. */
export async function* lines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const parts = pending.split('\n');
      pending = parts.pop()!;
      for (const line of parts) yield line;
    }
    pending += decoder.decode();
    if (pending) yield pending;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Strips <think>…</think> from a stream, for servers that inline a thinking
 * model's reasoning in its answer. Returns a filter to feed chunks through.
 */
export function thinkFilter(): (chunk: string) => string {
  let inside = false;
  let buf = '';
  return (chunk) => {
    buf += chunk;
    let out = '';
    for (;;) {
      if (inside) {
        const end = buf.indexOf('</think>');
        if (end === -1) {
          buf = buf.slice(-8);
          return out;
        }
        buf = buf.slice(end + 8);
        inside = false;
      } else {
        const start = buf.indexOf('<think>');
        if (start === -1) {
          // Hold back what might be the start of a tag.
          const keep = buf.lastIndexOf('<');
          if (keep !== -1 && buf.length - keep < 7) {
            out += buf.slice(0, keep);
            buf = buf.slice(keep);
          } else {
            out += buf;
            buf = '';
          }
          return out;
        }
        out += buf.slice(0, start);
        buf = buf.slice(start + 7);
        inside = true;
      }
    }
  };
}

/** Parses the first JSON object in a model's answer (after any thinking). */
export function parseJSONAnswer(text: string): unknown {
  const clean = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const match = clean.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : clean);
}

/** True for network failures: refused connections, DNS errors, aborted fetches. */
export function isUnreachable(err: unknown): boolean {
  const e = err as { cause?: { code?: string }; message?: string } | undefined;
  return /ECONNREFUSED|ENOTFOUND|fetch failed|Failed to fetch|NetworkError|Load failed|aborted|timeout/i.test(
    String(e?.cause?.code || e?.message || err),
  );
}
