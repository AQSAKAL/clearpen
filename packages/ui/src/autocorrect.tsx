// Autocorrect: Clearpen fixes typos as the writer types. The moment a word ends,
// exact rules — a capital to start a sentence, "i" → "I", "teh" → "the". The
// moment a sentence ends, the model proofreads it, and its small, safe fixes
// land behind the cursor while the writer types on. Each fix is its own undo
// step, and once undone Clearpen leaves those words alone.

import { finishedSentence, looksEnglish, quickFix } from '@clearpen/core';
import { useEffect, useRef } from 'react';
import { useAI } from './ai.tsx';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';
import { useSettings } from './settings.tsx';

/** A finished sentence waiting to be proofread, kept pinned to its place as the text changes. */
interface Waiting {
  from: number;
  to: number;
  sentence: string;
  /** The paragraph before it. */
  before: string;
  curly: boolean;
}

/** The writer's apostrophes: ’ if they use more of those. */
const curlyIn = (text: string) => (text.match(/’/g)?.length ?? 0) > (text.match(/'/g)?.length ?? 0);

export function Autocorrect() {
  const page = usePage();
  const ai = useAI();
  const { backend, current } = useLibrary();
  const { settings } = useSettings();
  const live = useRef({ on: settings.autocorrect, busy: ai.busy });
  live.current = { on: settings.autocorrect, busy: ai.busy };
  const state = useRef({
    queue: [] as Waiting[],
    /** Where each word the writer ended, not yet looked at, ends. */
    typed: [] as number[],
    running: false,
    ctrl: null as AbortController | null,
    article: 0,
  });

  useEffect(() => {
    const s = state.current;

    // One sentence at a time, in the order they were written.
    async function drain() {
      s.running = true;
      const article = s.article;
      try {
        while (s.queue.length && article === s.article) {
          const next = s.queue[0]!;
          const ctrl = new AbortController();
          s.ctrl = ctrl;
          const fixes = await backend.ai
            .proofread({ sentence: next.sentence, before: next.before, curly: next.curly }, { signal: ctrl.signal })
            .catch(() => []); // the model is away: no fixes this time
          if (article !== s.article || ctrl.signal.aborted) return;
          s.queue.shift();
          const ed = page.editor.current;
          // Rewritten since, or another AI change is on screen: leave it be.
          if (!ed || !fixes.length || live.current.busy || ed.suggestions().length) continue;
          if (ed.slice(next.from, next.to) !== next.sentence) continue;
          ed.correct(fixes.map((f) => ({ from: next.from + f.from, to: next.from + f.to, insert: f.insert })));
        }
      } finally {
        s.running = false;
        s.ctrl = null;
      }
    }

    function proofreadSoon(waiting: Waiting) {
      if (s.queue.some((q) => q.from === waiting.from && q.sentence === waiting.sentence)) return;
      s.queue.push(waiting);
      if (!s.running) void drain();
    }

    /** Fixes the word that ended at `pos`, then sends the sentence that ended there, if one did. */
    function wordEnded(pos: number) {
      const ed = page.editor.current;
      if (!ed) return;
      const recent = ed.slice(Math.max(0, pos - 3000), pos);
      const curly = curlyIn(recent);
      // After Enter, the word that ended is on the line above.
      const line = ed.lineAt(Math.max(0, pos - 1));
      const fix = quickFix(ed.slice(line.from, pos), { english: looksEnglish(recent), curly });
      if (fix && ed.correct([{ from: line.from + fix.from, to: line.from + fix.to, insert: fix.insert }])) {
        pos += fix.insert.length - (fix.to - fix.from);
      }
      const start = Math.max(0, pos - 3000);
      const before = ed.slice(start, pos);
      const span = finishedSentence(before);
      if (!span || !ed.isProse(start + span.to - 1, start + span.to)) return;
      const paragraph = before.slice(0, span.from);
      proofreadSoon({
        from: start + span.from,
        to: start + span.to,
        sentence: before.slice(span.from, span.to),
        before: paragraph.slice(paragraph.lastIndexOf('\n\n') + 1),
        curly,
      });
    }

    // Once CodeMirror has finished with the keystrokes, which may be several.
    function afterTyping() {
      const ed = page.editor.current;
      if (!ed || ed.view.composing || !live.current.on || live.current.busy) {
        s.typed = [];
        return;
      }
      for (let pos = s.typed.shift(); pos !== undefined; pos = s.typed.shift()) wordEnded(pos);
    }

    const offUpdate = page.on('update', (u) => {
      if (!u.docChanged) return;
      for (const q of s.queue) {
        q.from = u.mapPos(q.from, 1);
        q.to = u.mapPos(q.to, -1);
      }
      s.typed = s.typed.map((p) => u.mapPos(p));
      if (!u.userEdit || !live.current.on || live.current.busy) return;
      const ed = page.editor.current;
      if (!ed?.getSelection().empty) return;
      // Every word the typing ended: one keystroke's worth, or a phrase from dictation.
      const waiting = s.typed.length;
      for (const r of u.typed) {
        const text = ed.slice(r.from, Math.min(r.to, r.from + 2000));
        for (let i = 0; i < text.length; i++) if (/[\s.,;!?]/.test(text[i]!)) s.typed.push(r.from + i + 1);
      }
      if (!waiting && s.typed.length) queueMicrotask(afterTyping);
    });
    return () => {
      offUpdate();
      s.article++;
      s.queue = [];
      s.ctrl?.abort();
    };
  }, [page, backend]);

  // Another article, autocorrect turned off, or another AI task started: drop what's waiting.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when another article opens.
  useEffect(() => {
    const s = state.current;
    s.article++;
    s.queue = [];
    s.ctrl?.abort();
  }, [current?.id, settings.autocorrect, ai.busy]);

  return null;
}
