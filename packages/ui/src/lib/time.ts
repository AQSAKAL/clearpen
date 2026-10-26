const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
];

const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/** "3 minutes ago", "yesterday", "just now". */
export function timeAgo(ms: number, now = Date.now()): string {
  const secs = Math.round((ms - now) / 1000);
  for (const [unit, size] of UNITS) {
    if (Math.abs(secs) >= size) return relative.format(Math.round(secs / size), unit);
  }
  return 'just now';
}

const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export const formatDateTime = (ms: number) => dateTime.format(ms);
