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

/** An image's Markdown source in an article: `media/<first 24 hex of its sha-256>.<ext>`. */
export const MEDIA_SRC = /^media\/([0-9a-f]{24})\.(png|jpg|gif|webp)$/;

export class ImageError extends Error {}

export interface PreparedImage {
  bytes: Uint8Array<ArrayBuffer>;
  ext: ImageExt;
  type: string;
  sha256: string;
  /** The file name to store it under, and the tail of its Markdown source. */
  name: string;
  src: string;
}

/** Checks an image file and works out where it's stored. Throws `ImageError` with a sentence for the writer. */
export async function prepareImage(file: Blob): Promise<PreparedImage> {
  if (file.size > MAX_IMAGE_BYTES) throw new ImageError('Images can be up to 15 MB.');
  const bytes = new Uint8Array(await file.arrayBuffer());
  const ext = sniffImage(bytes);
  if (!ext) throw new ImageError('Only PNG, JPEG, GIF and WebP images can be added.');
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  const sha256 = Array.from(digest, (x) => x.toString(16).padStart(2, '0')).join('');
  const name = `${sha256.slice(0, 24)}.${ext}`;
  return { bytes, ext, type: IMAGE_TYPES[ext], sha256, name, src: `media/${name}` };
}

/**
 * The text to put at [from, to) so `images` (Markdown lines) sit in a
 * paragraph of their own: a blank line before and after, never piled up.
 */
export function imageBlock(text: string, from: number, to: number, images: string[]): string {
  const before = text.slice(0, from);
  const after = text.slice(to);
  const lead = !before.trim() ? '' : /\n\n$/.test(before) ? '' : /\n$/.test(before) ? '\n' : '\n\n';
  const trail = !after.trim() ? '\n' : /^\n\n/.test(after) ? '' : /^\n/.test(after) ? '\n' : '\n\n';
  return `${lead}${images.join('\n\n')}${trail}`;
}
