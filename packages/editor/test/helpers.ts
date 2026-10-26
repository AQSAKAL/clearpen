// Editors mounted in happy-dom, keys pressed the way a browser delivers them,
// and everything torn down after each test.

import { afterEach } from 'vitest';
import { createEditor, type EditorOptions, type MarginEditor } from '../src/index.ts';

const open: MarginEditor[] = [];

afterEach(() => {
  for (const ed of open.splice(0)) ed.destroy();
  document.body.innerHTML = '';
});

export function mount(doc: string, opts: EditorOptions = {}): MarginEditor {
  const parent = document.createElement('div');
  parent.className = 'editor';
  document.body.append(parent);
  const ed = createEditor(parent, { doc, ...opts });
  open.push(ed);
  return ed;
}

// CodeMirror reads Mod as ⌘ on a Mac and Ctrl elsewhere.
const mac = /Mac/.test(navigator.platform);

/** Presses a key in the editor; true when a binding took it (and so stopped the browser's default). */
export function press(ed: MarginEditor, key: string, { mod = false, shift = false } = {}): boolean {
  const ev = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    shiftKey: shift,
    ctrlKey: mod && !mac,
    metaKey: mod && mac,
  });
  ed.view.contentDOM.dispatchEvent(ev);
  return ev.defaultPrevented;
}

/** Fires a mousedown on an element, as clicking a widget's button does. */
export function mousedown(el: Element): void {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
}

export const all = (ed: MarginEditor, selector: string): Element[] => [
  ...ed.view.contentDOM.querySelectorAll(selector),
];
