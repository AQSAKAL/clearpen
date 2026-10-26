// Tracked suggestions: the AI's changes, shown in the text as a struck-out
// passage and its replacement until the writer accepts or rejects them.

import { Annotation, type Range, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import type { Suggestion } from './types.ts';

/** Marks the transaction that applies an accepted suggestion. */
export const acceptingAnnotation = Annotation.define<boolean>();
export const addSuggestion = StateEffect.define<Suggestion>();
export const updateSuggestion = StateEffect.define<Partial<Suggestion> & { id: string }>();
export const removeSuggestion = StateEffect.define<string>();

/** What the widget's buttons do. */
export interface SuggestionHandlers {
  accept: (id: string) => void;
  reject: (id: string) => void;
}

class InsertWidget extends WidgetType {
  readonly sug: Suggestion;
  readonly handlers: SuggestionHandlers;

  constructor(sug: Suggestion, handlers: SuggestionHandlers) {
    super();
    this.sug = sug;
    this.handlers = handlers;
  }

  // The label isn't compared: the app sets it when it adds a suggestion, and leaves it.
  override eq(other: InsertWidget): boolean {
    const a = other.sug;
    const b = this.sug;
    return (
      a.insert === b.insert &&
      a.status === b.status &&
      a.id === b.id &&
      a.warning === b.warning &&
      a.compact === b.compact
    );
  }

  toDOM(): HTMLElement {
    const sug = this.sug;
    const wrap = document.createElement('span');
    wrap.className = `cm-sug-ins${sug.status === 'streaming' ? ' streaming' : ''}${sug.compact ? ' compact' : ''}`;
    wrap.dataset.sug = sug.id;
    const text = document.createElement('span');
    text.className = 'cm-sug-text';
    // A pinpoint insert that ends in a line break ("## Heading\n\n") gets its
    // ✓ ✕ on the heading's line, not at the start of the next paragraph.
    const trailing = sug.compact ? (sug.insert.match(/\n+$/)?.[0] ?? '') : '';
    // ∅ shows that a full suggestion deletes the passage outright.
    text.textContent =
      (trailing ? sug.insert.slice(0, -trailing.length) : sug.insert) ||
      (sug.status === 'streaming' || sug.compact ? '' : '∅');
    wrap.append(text);
    if (sug.compact && sug.status !== 'streaming') {
      // One of several pinpoint changes: just ✓ and ✕, and any warning.
      const bar = document.createElement('span');
      bar.className = 'cm-sug-mini';
      if (sug.warning) {
        const warn = document.createElement('span');
        warn.className = 'cm-sug-warn';
        warn.textContent = '⚠';
        warn.title = sug.warning;
        bar.append(warn);
      }
      bar.append(
        this.button('✓', 'cm-sug-accept', this.handlers.accept, 'Accept this change'),
        this.button('✕', 'cm-sug-reject', this.handlers.reject, 'Reject this change'),
      );
      wrap.append(bar);
      if (trailing) {
        const rest = document.createElement('span');
        rest.className = 'cm-sug-text';
        rest.textContent = trailing;
        wrap.append(rest);
      }
    } else if (sug.status !== 'streaming') {
      const bar = document.createElement('span');
      bar.className = 'cm-sug-bar';
      if (sug.label) {
        const tag = document.createElement('span');
        tag.className = 'cm-sug-label';
        tag.textContent = sug.label;
        bar.append(tag);
      }
      if (sug.warning) {
        const warn = document.createElement('span');
        warn.className = 'cm-sug-warn';
        warn.textContent = `⚠ ${sug.warning}`;
        warn.title = 'Figures, names or code differ from your original — check before accepting.';
        bar.append(warn);
      }
      bar.append(
        this.button('Accept', 'cm-sug-accept', this.handlers.accept, 'Accept (⌘↵)'),
        this.button('Reject', 'cm-sug-reject', this.handlers.reject, 'Reject (Esc)'),
      );
      wrap.append(bar);
    }
    return wrap;
  }

  // On mousedown, so the click neither moves the cursor nor blurs the editor.
  private button(label: string, cls: string, fn: (id: string) => void, title: string): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = cls;
    b.textContent = label;
    b.title = title;
    b.onmousedown = (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      fn(this.sug.id);
    };
    return b;
  }

  override ignoreEvent(): boolean {
    return true;
  }
}

/** The pending suggestions, with their decorations. One per editor, since the buttons call back into it. */
export function suggestionField(handlers: SuggestionHandlers): StateField<readonly Suggestion[]> {
  return StateField.define<readonly Suggestion[]>({
    create: () => [],
    update(value, tr) {
      let list = value;
      if (tr.docChanged && list.length) {
        // A suggestion is void once its passage is edited — or, when another
        // suggestion is accepted, once that one's replacement touches it.
        const accepting = tr.annotation(acceptingAnnotation);
        list = list
          .filter((s) =>
            accepting
              ? !tr.changes.touchesRange(s.from, s.to)
              : !(s.to > s.from && tr.changes.touchesRange(s.from + 1, s.to - 1)),
          )
          .map((s) => ({ ...s, from: tr.changes.mapPos(s.from, 1), to: tr.changes.mapPos(s.to, -1) }))
          .map((s) => (s.to < s.from ? { ...s, to: s.from } : s));
      }
      for (const e of tr.effects) {
        if (e.is(addSuggestion)) list = [...list.filter((s) => s.id !== e.value.id), e.value];
        else if (e.is(updateSuggestion)) list = list.map((s) => (s.id === e.value.id ? { ...s, ...e.value } : s));
        else if (e.is(removeSuggestion)) list = list.filter((s) => s.id !== e.value);
      }
      return list;
    },
    provide: (f) =>
      EditorView.decorations.from(f, (list) => {
        const ranges: Range<Decoration>[] = [];
        for (const s of list) {
          if (s.to > s.from) {
            ranges.push(Decoration.mark({ class: 'cm-sug-del', attributes: { 'data-sug': s.id } }).range(s.from, s.to));
          }
          ranges.push(Decoration.widget({ widget: new InsertWidget(s, handlers), side: 1 }).range(s.to));
        }
        return Decoration.set(ranges, true);
      }),
  });
}
