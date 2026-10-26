let last = 0;

/**
 * Milliseconds since the epoch, strictly increasing within this process, so
 * rows written in the same millisecond still sort in the order they were made.
 */
export function now(): number {
  last = Math.max(Date.now(), last + 1);
  return last;
}

/** A UUIDv7: 48 bits of time, then random bits, so ids sort by creation time. */
export function uuidv7(ms: number = now()): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | (b[6]! & 0x0f);
  b[8] = 0x80 | (b[8]! & 0x3f);
  const hex = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
