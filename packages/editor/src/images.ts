// Inline images: a Markdown image line keeps its source, with the picture
// shown beneath it. The app says where a source's picture lives
// (resolveImage); this file decides which URLs may load at all.

import { type EditorState, type Range, StateField } from '@codemirror/state';
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view';
import type { EditorOptions } from './types.ts';

const IMAGE_RE = /!\[([^[\]]*)\]\(([^()\s]+)(?:\s+"[^"]*")?\)/g;

// Browsers strip or rewrite these while parsing a URL (" javascript:",
// "java\tscript:", "\\host"), so they could smuggle a scheme past the checks.
const SNEAKY = /[\x00-\x1f\x7f\\]|^\s|\s$/;
const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const isPath = (url: string) => !SCHEME.test(url) && !url.startsWith('//');

/**
 * A Markdown source that may show at all: an https:// URL, or a path with no
 * scheme (media/<hash>.png). Any other scheme — javascript:, data:, file:,
 * http: — never renders, whatever resolveImage would make of it.
 */
export const allowedSource = (src: string): boolean => !SNEAKY.test(src) && (src.startsWith('https://') || isPath(src));

/**
 * A URL an <img> may load: web and object URLs, Tauri's asset protocol
 * (asset://localhost/… on macOS and Linux, http://asset.localhost/… on
 * Windows), or a path on the page's own origin. Never javascript: or data:.
 */
export const loadableUrl = (url: string): boolean =>
  !SNEAKY.test(url) && (/^(?:https?|blob|asset):/i.test(url) || isPath(url));

/** Without a resolveImage option, only https:// images show. */
export const httpsOnly = (src: string): string | null => (/^https:\/\/\S+$/.test(src) ? src : null);

class ImageWidget extends WidgetType {
  readonly url: string;
  readonly alt: string;

  constructor(url: string, alt: string) {
    super();
    this.url = url;
    this.alt = alt;
  }

  override eq(other: ImageWidget): boolean {
    return other.url === this.url && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-image';
    const img = document.createElement('img');
    img.src = this.url;
    img.alt = this.alt;
    img.loading = 'lazy';
    img.draggable = false;
    // A picture that can't load is hidden; its Markdown line stays.
    img.onerror = () => wrap.classList.add('broken');
    wrap.append(img);
    return wrap;
  }

  override get estimatedHeight(): number {
    return 240;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function imageDecorations(state: EditorState, resolve: (src: string) => string | null): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const text = state.doc.toString();
  for (const m of text.matchAll(IMAGE_RE)) {
    const alt = m[1]!;
    const src = m[2]!;
    if (!allowedSource(src)) continue;
    const url = resolve(src);
    if (!url || !loadableUrl(url)) continue;
    ranges.push(
      Decoration.widget({ widget: new ImageWidget(url, alt), block: true, side: 1 }).range(
        state.doc.lineAt(m.index).to,
      ),
    );
  }
  return Decoration.set(ranges, true);
}

/** The pictures, under their lines. Block widgets have to come from a state field. */
export function imageField(opts: EditorOptions): StateField<DecorationSet> {
  const resolve = (src: string) => (opts.resolveImage ?? httpsOnly)(src);
  return StateField.define<DecorationSet>({
    create: (state) => imageDecorations(state, resolve),
    update: (deco, tr) => (tr.docChanged ? imageDecorations(tr.state, resolve) : deco),
    provide: (f) => EditorView.decorations.from(f),
  });
}
