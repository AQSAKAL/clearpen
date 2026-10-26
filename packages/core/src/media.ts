// Images: what their bytes say they are, whatever the upload claimed. SVG is
// never accepted — it can carry script.

export type ImageExt = 'png' | 'jpg' | 'gif' | 'webp';

export const IMAGE_TYPES: Record<ImageExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
};

/** The largest image Margin stores. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const ascii = (b: Uint8Array, from: number, to: number) => String.fromCharCode(...b.subarray(from, to));

/** The image format of `bytes`, or null if it isn't one Margin accepts. */
export function sniffImage(bytes: Uint8Array): ImageExt | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') return 'png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (/^GIF8[79]a$/.test(ascii(bytes, 0, 6))) return 'gif';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** A useful alt text from a file name — not "image" or "Screenshot 2026-…". */
export function altFromFileName(name: string): string {
  const base = (name || '')
    .replace(/\.[a-z0-9]+$/i, '')
    .replace(/[-_]+/g, ' ')
    .trim();
  return !base || /^(image|img|pasted|screenshot|screen shot|clipboard|untitled)\b/i.test(base) || /^\d+$/.test(base)
    ? ''
    : base;
}
