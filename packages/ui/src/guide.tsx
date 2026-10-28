// Guided writing in the editor. The frame to fill — "I feel ___ today." —
// shows in grey at the end of the text and on a card beside the page; the
// author types the whole sentence. When a frame is filled (decided in code),
// the next one appears at once, and the coach's reply — what the sentence
// leaves unsaid, the next question — lands on the card when it arrives.
// Nothing Clearpen shows ever enters the text: a frame ghost inserts
// nothing, and Tab leaves it be.

import {
  type Brief,
  type Frame,
  frameFilled,
  isTemplateId,
  lastSentence,
  modeOf,
  NEXT_SENTENCE_PAUSE_MS,
  TEMPLATES,
  type Template,
  type TemplateId,
} from '@clearpen/core';
import type { ClearpenEditor } from '@clearpen/editor';
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAI } from './ai.tsx';
import { POINT_MADE } from './autocomplete.tsx';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';

export interface GuideSaid {
  /** One question about what the last sentence leaves unsaid, or ''. */
  missing: string;
  /** The next frame's question in the coach's words, or ''. */
  next: string;
}

export interface GuideValue {
  /** The template in progress, or null. */
  template: Template | null;
  /** The frame to fill next; the number of frames once every one is filled. */
  step: number;
  said: GuideSaid | null;
  /** The coach's reply is on its way. */
  thinking: boolean;
  /** After the last frame of a one-paragraph template: the judge found the point made. */
  complete: boolean;
  /** A template the mode offers on an empty page, not started. */
  offer: Template | null;
  start(id: TemplateId): void;
  /** Moves on to the next frame without filling this one. */
  skip(): void;
  /** Ends the guide: the frames go, the text stays. */
  stop(): void;
  declineOffer(): void;
}

const GuideContext = createContext<GuideValue | null>(null);

/** What the editor shows for `frame` at the end of the text: the frame itself, or a hint to start its paragraph. */
function showFrame(ed: ClearpenEditor, frame: Frame, text: string, pos: number, layout: Template['layout']) {
  const lineStart = text.lastIndexOf('\n', pos - 1) + 1;
  const lineEmpty = !text.slice(lineStart, pos).trim();
  if (layout === 'paragraphs' && !lineEmpty) {
    ed.showGhost(pos, '\n\n', ` ¶ Tab for a new paragraph, then: ${frame.text}`);
    return;
  }
  const lead = !text || lineEmpty || /\s$/.test(text) ? '' : ' ';
  ed.showGhost(pos, '', `${lead}${frame.text}`, 'frame');
}

interface Engine {
  template: Template | null;
  step: number;
  /** Where the current frame's sentence begins: what the author wrote since the frame appeared. */
  from: number;
  seq: number;
  timer: ReturnType<typeof setTimeout> | undefined;
  ctrl: AbortController | null;
  typed: boolean;
}

export function GuideProvider({ children }: { children: ReactNode }) {
  const { backend, current, edit } = useLibrary();
  const page = usePage();
  const ai = useAI();
  const [template, setTemplate] = useState<Template | null>(null);
  const [step, setStep] = useState(0);
  const [said, setSaid] = useState<GuideSaid | null>(null);
  const [thinking, setThinking] = useState(false);
  const [complete, setComplete] = useState(false);
  const [typed, setTyped] = useState(false);
  const [declined, setDeclined] = useState<string | null>(null);
  const [stopped, setStopped] = useState<string | null>(null);

  // The engine's own copy, kept in step at once: the editor doesn't wait for a render.
  const s = useRef<Engine>({ template: null, step: 0, from: 0, seq: 0, timer: undefined, ctrl: null, typed: false });
  const live = useRef({ busy: ai.busy, current, title: '' });
  live.current = { busy: ai.busy, current, title: page.title.current };

  const mode = modeOf(current?.brief);
  const docId = current?.id ?? null;

  /** Sets the guide here and in the brief (the article remembers its place). */
  const place = useCallback(
    (t: Template | null, at: number) => {
      s.current.template = t;
      s.current.step = at;
      setTemplate(t);
      setStep(at);
      const doc = live.current.current;
      if (!doc) return;
      const { guide: _was, ...rest } = doc.brief;
      edit({ brief: t ? { ...rest, guide: { template: t.id, step: at } } : rest });
    },
    [edit],
  );

  useEffect(() => {
    const e = s.current;

    /** Asks the coach about the frame just filled; the next frame is already showing. */
    function ask(t: Template, at: number, text: string) {
      if (live.current.busy) return; // another AI task has the model
      const id = ++e.seq;
      e.ctrl?.abort();
      const ctrl = new AbortController();
      e.ctrl = ctrl;
      setThinking(true);
      const brief: Brief | undefined = live.current.current?.brief;
      backend.ai
        .guide(
          { template: t.id, step: at, before: text, title: live.current.title, ...(brief ? { brief } : {}) },
          { signal: ctrl.signal },
        )
        .then((reply) => {
          if (id !== e.seq) return;
          setSaid({ missing: reply.missing, next: reply.next });
          setComplete(reply.complete);
          // The point made after the last frame: Tab starts a new paragraph, as always.
          const ed = page.editor.current;
          if (!reply.complete || t.frames[at + 1] || !ed) return;
          if (ed.getSelection().empty && ed.cursor() === ed.length()) ed.showGhost(ed.length(), '\n\n', POINT_MADE);
        })
        .catch(() => {
          // The model is away: the frame's own question will do.
        })
        .finally(() => {
          if (id === e.seq) setThinking(false);
        });
    }

    function advance(text: string) {
      const t = e.template;
      if (!t) return;
      const at = e.step;
      e.from = text.length;
      place(t, at + 1);
      setSaid(null);
      setComplete(false);
      const ed = page.editor.current;
      const next = t.frames[at + 1];
      if (ed) {
        if (next) showFrame(ed, next, text, text.length, t.layout);
        else ed.clearGhost();
      }
      ask(t, at, text);
    }

    /** After a pause: a filled frame moves on; otherwise the frame shows at the end of the text. */
    function settle() {
      const ed = page.editor.current;
      const t = e.template;
      const frame = t?.frames[e.step];
      if (!ed || !t || !frame) return;
      if (ed.suggestions().length) return; // one AI thing on screen at a time
      const sel = ed.getSelection();
      if (!sel.empty) return;
      const text = ed.getText();
      if (sel.from !== text.length) return; // frames go at the end of the text
      const written = text.slice(Math.min(e.from, text.length));
      const sentence = lastSentence(written);
      if (sentence && frameFilled(frame, sentence)) advance(text);
      else showFrame(ed, frame, text, sel.from, t.layout);
    }

    const offUpdate = page.on('update', (u) => {
      if (u.corrected) {
        e.from = u.mapPos(e.from, -1);
        return;
      }
      if (!u.docChanged && !u.selectionSet) return;
      if (u.docChanged) e.from = Math.min(u.mapPos(e.from, -1), page.editor.current?.length() ?? 0);
      if ((u.userEdit || u.ghostAccepted) && !e.typed) {
        e.typed = true;
        setTyped(true);
      }
      clearTimeout(e.timer);
      if (e.template) e.timer = setTimeout(settle, NEXT_SENTENCE_PAUSE_MS);
    });
    // A step taken from the card, or a guide started: show its frame.
    const offShow = page.on('guide', () => {
      clearTimeout(e.timer);
      e.timer = setTimeout(settle, 0);
    });
    return () => {
      offUpdate();
      offShow();
      e.seq++;
      clearTimeout(e.timer);
      e.ctrl?.abort();
      e.ctrl = null;
    };
  }, [page, backend, place]);

  // Another article: pick up where its brief says, and start afresh otherwise.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when another article opens.
  useEffect(() => {
    const e = s.current;
    e.seq++;
    e.ctrl?.abort();
    clearTimeout(e.timer);
    e.typed = false;
    setTyped(false);
    setSaid(null);
    setThinking(false);
    setComplete(false);
    const g = live.current.current?.brief.guide;
    const t = g && isTemplateId(g.template) ? TEMPLATES[g.template] : null;
    const at = t && g ? Math.min(Math.max(0, g.step), t.frames.length) : 0;
    e.template = t;
    e.step = at;
    e.from = page.editor.current?.length() ?? 0;
    setTemplate(t);
    setStep(at);
    if (t) page.emit('guide', null);
  }, [docId, page]);

  // The mode starts its template on an empty page, and takes it away when the author leaves the mode.
  const empty = !current?.content && !typed;
  const wanted = mode.template;
  // biome-ignore lint/correctness/useExhaustiveDependencies: decided by the mode and the page, not by the guide's own state.
  useEffect(() => {
    if (!docId) return;
    if (template && (!wanted || wanted.id !== template.id)) {
      place(null, 0);
      page.editor.current?.clearGhost();
      return;
    }
    if (!template && wanted?.start === 'now' && empty && stopped !== docId) {
      s.current.from = page.editor.current?.length() ?? 0;
      place(TEMPLATES[wanted.id], 0);
      page.emit('guide', null);
    }
  }, [docId, wanted?.id, wanted?.start, empty, stopped]);

  const value = useMemo<GuideValue>(() => {
    const offer =
      !template && wanted?.start === 'offer' && empty && declined !== docId && stopped !== docId
        ? TEMPLATES[wanted.id]
        : null;
    const quiet = () => {
      s.current.seq++;
      s.current.ctrl?.abort();
      setThinking(false);
      setSaid(null);
      setComplete(false);
    };
    return {
      template,
      step,
      said,
      thinking,
      complete,
      offer,
      start(id) {
        quiet();
        s.current.from = page.editor.current?.length() ?? 0;
        place(TEMPLATES[id], 0);
        page.emit('guide', null);
        page.editor.current?.focus();
      },
      skip() {
        const t = s.current.template;
        if (!t) return;
        quiet();
        s.current.from = page.editor.current?.length() ?? 0;
        place(t, Math.min(s.current.step + 1, t.frames.length));
        page.editor.current?.clearGhost();
        page.emit('guide', null);
      },
      stop() {
        quiet();
        setStopped(docId);
        place(null, 0);
        page.editor.current?.clearGhost();
      },
      declineOffer: () => setDeclined(docId),
    };
  }, [template, step, said, thinking, complete, wanted, empty, declined, stopped, docId, page, place]);

  return <GuideContext.Provider value={value}>{children}</GuideContext.Provider>;
}

export function useGuide(): GuideValue {
  const v = useContext(GuideContext);
  if (!v) throw new Error('useGuide needs a GuideProvider');
  return v;
}
