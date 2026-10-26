// Writing-analysis highlights: long sentences, passives, adverbs, weak words
// and clichés. The app recomputes them; between times they follow the text.

import { StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView } from '@codemirror/view';
import { fits } from './notes.ts';
import type { AnalysisRange } from './types.ts';

export const setAnalysis = StateEffect.define<readonly AnalysisRange[]>();

export const analysisField = StateField.define<readonly AnalysisRange[]>({
  create: () => [],
  update(list, tr) {
    for (const e of tr.effects) if (e.is(setAnalysis)) return e.value.filter(fits(tr.state.doc));
    if (tr.docChanged && list.length) {
      return list
        .map((r) => ({ ...r, from: tr.changes.mapPos(r.from, 1), to: tr.changes.mapPos(r.to, -1) }))
        .filter((r) => r.to > r.from);
    }
    return list;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (list) =>
      Decoration.set(
        list.map((r) =>
          Decoration.mark({ class: `cm-an cm-an-${r.kind}`, attributes: r.title ? { title: r.title } : {} }).range(
            r.from,
            r.to,
          ),
        ),
        true,
      ),
    ),
});
