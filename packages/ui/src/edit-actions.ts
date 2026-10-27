// Edits on a selection: a built-in rewrite (Improve, Shorten, a change of
// tone…) or a free instruction. Either way the result arrives as small
// tracked changes the writer accepts or rejects; the text itself changes only
// when they do. A version is saved first, so any accepted edit can be undone
// from the history too.

import {
  editChanges,
  isWholeRewrite,
  type RewriteAction,
  type RewriteDone,
  streamingRewrite,
  warning,
} from '@clearpen/core';
import type { ClearpenEditor } from '@clearpen/editor';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useAI } from './ai.tsx';
import { usePage } from './editor-ref.tsx';
import { useLibrary } from './library.tsx';
import { useStatus } from './status.tsx';

export const REWRITE_ACTIONS: Partial<Record<RewriteAction, string>> = {
  improve: 'Improve',
  clarify: 'Clarify',
  shorten: 'Shorten',
  simplify: 'Simplify',
  grammar: 'Fix grammar',
};

export const TONES: Partial<Record<RewriteAction, string>> = {
  formal: 'More formal',
  casual: 'More conversational',
  confident: 'More confident',
  persuasive: 'More persuasive',
  active: 'Active voice',
  hook: 'Make it a hook',
};

const DOING: Partial<Record<RewriteAction, string>> = {
  improve: 'Improving',
  clarify: 'Clarifying',
  shorten: 'Shortening',
  simplify: 'Simplifying',
  grammar: 'Fixing grammar',
  hook: 'Sharpening the hook',
};

const DONE: Record<RewriteAction, string> = {
  improve: 'Improved',
  clarify: 'Clarified',
  shorten: 'Shortened',
  simplify: 'Simplified',
  grammar: 'Corrected',
  formal: 'More formal',
  casual: 'Conversational',
  confident: 'More confident',
  persuasive: 'More persuasive',
  active: 'Active voice',
  hook: 'As a hook',
};

export interface Span {
  from: number;
  to: number;
}

/** The ids of a group's suggestions still waiting for a decision. */
const left = (ed: ClearpenEditor, group: string) =>
  ed
    .suggestions()
    .filter((s) => s.group === group)
    .map((s) => s.id);

/** Text around a passage, so the model edits in keeping with the rest. */
const surroundings = (ed: ClearpenEditor, { from, to }: Span) => ({
  before: ed.slice(Math.max(0, from - 3000), from),
  after: ed.slice(to, Math.min(ed.length(), to + 1000)),
});

/** A Simplify or Shorten whose every change would flatten the writer's voice: nothing to show, and why. */
const heldBack = (reasons: string[]) =>
  reasons.length === 1
    ? `Held back the only change — it ${reasons[0]}.`
    : `Held back ${reasons.length} changes to keep your voice: ${reasons.slice(0, 2).join('; ')}.`;

export function useEditActions(mod: string) {
  const { backend, current, flush } = useLibrary();
  const page = usePage();
  const ai = useAI();
  const status = useStatus();
  const docId = current?.id;
  const notes = current?.brief.notes ?? '';

  // The group of suggestions the pill is about, while any of them is left.
  const pending = useRef<{ ed: ClearpenEditor; group: string; label: string; message: number } | null>(null);

  /** "Shortened: 4 changes · Accept all · Reject all", until they're all decided. */
  const groupStatus = useCallback(
    (ed: ClearpenEditor, group: string, n: number, label: string) => {
      const message = status.show({
        text: `${label}: ${n} change${n === 1 ? '' : 's'}`,
        sticky: true,
        actions: [
          { label: 'Accept all', primary: true, onClick: () => ed.acceptSuggestions(left(ed, group)) },
          { label: 'Reject all', onClick: () => ed.rejectSuggestions(left(ed, group)) },
        ],
        keys: [`${mod}↵`, 'Esc'],
      });
      pending.current = { ed, group, label, message };
    },
    [status, mod],
  );

  /** A version of the article as it is now, before any suggestion is accepted. */
  const keepVersion = useCallback(
    async (label: string) => {
      if (!docId) return;
      await flush();
      await backend.library.versions.save(docId, `Before “${label}”`).catch(() => {});
    },
    [backend, docId, flush],
  );

  const rewrite = useCallback(
    (span: Span, action: RewriteAction) => {
      const ed = page.editor.current;
      if (!ed) return;
      const text = ed.slice(span.from, span.to);
      if (!text.trim()) return;
      const label = DONE[action];
      void ai.run(DOING[action] ?? 'Rewriting', async (signal) => {
        const id = ed.addSuggestion({ ...span, insert: '', label, status: 'streaming' });
        ed.setSelection(span.to, span.to, false);
        let raw = '';
        let done: RewriteDone | null = null;
        try {
          for await (const ev of backend.ai.rewrite(
            { action, text, title: page.title.current, ...surroundings(ed, span) },
            { signal },
          )) {
            // The writer edited the passage meanwhile: the suggestion is gone.
            if (!ed.suggestion(id)) return;
            if (ev.type === 'notice') status.show({ text: ev.text, busy: true, keys: ['Esc'] });
            else if (ev.type === 'token') {
              raw += ev.text;
              ed.updateSuggestion(id, { insert: streamingRewrite(raw, text) });
            } else done = ev;
          }
        } catch (err) {
          if (ed.suggestion(id)) ed.rejectSuggestion(id);
          throw err;
        }
        if (!done || !ed.suggestion(id)) return;
        if (done.text.trim() === text.trim() || !done.changes.length) {
          ed.rejectSuggestion(id);
          status.show(
            done.dropped.length ? { text: heldBack(done.dropped), ms: 6000 } : 'The AI suggested no changes.',
          );
          return;
        }
        await keepVersion(REWRITE_ACTIONS[action] ?? TONES[action] ?? label);
        // Only the spots that changed, each with its own ✓ and ✕.
        if (!isWholeRewrite(text, done.changes)) {
          ed.rejectSuggestion(id);
          const group = `g${id}`;
          for (const c of done.changes) {
            ed.addSuggestion({
              from: span.from + c.from,
              to: span.from + c.to,
              insert: c.insert,
              status: 'ready',
              group,
              compact: true,
              warning: c.warning,
            });
          }
          groupStatus(ed, group, done.changes.length, label);
          return;
        }
        // The one change carries its own warning — the voice guard's as well as the figures'.
        const warn = done.changes[0]?.warning ?? warning(text, done.text);
        ed.updateSuggestion(id, { insert: done.text, status: 'ready', warning: warn });
        status.show(
          warn
            ? { text: `⚠ ${warn} — check before accepting`, ms: 6000, warning: true }
            : { text: 'Accept or reject', ms: 4000, keys: [`${mod}↵`, 'Esc'] },
        );
      });
    },
    [ai, backend, page, status, keepVersion, groupStatus, mod],
  );

  const editWith = useCallback(
    (span: Span, instruction: string) => {
      const ed = page.editor.current;
      if (!ed) return;
      const text = ed.slice(span.from, span.to);
      if (!text.trim()) return;
      const group = `e${Date.now()}`;
      void ai.run('Working out the changes', async (signal) => {
        ed.setSelection(span.to, span.to, false);
        let count = 0;
        let declined = '';
        let kept = false;
        const sources = `${ed.getText()}\n${notes}`;
        try {
          for await (const ev of backend.ai.edit(
            { instruction, text, title: page.title.current, ...surroundings(ed, span) },
            { signal },
          )) {
            if (ev.type === 'notice') status.show({ text: ev.text, busy: true, keys: ['Esc'] });
            if (ev.type === 'done') declined = ev.declined;
            if (ev.type !== 'edit') continue;
            // The writer changed the passage meanwhile: positions no longer hold.
            if (ed.slice(span.from, span.from + text.length) !== text) return;
            if (!kept) {
              kept = true;
              await keepVersion(instruction.length > 40 ? `${instruction.slice(0, 40)}…` : instruction);
            }
            for (const c of editChanges(text, ev, sources)) {
              ed.addSuggestion({
                from: span.from + c.from,
                to: span.from + c.to,
                insert: c.insert,
                status: 'ready',
                group,
                compact: true,
                warning: c.warning,
              });
              count++;
            }
            status.show({ text: `${count} change${count === 1 ? '' : 's'} so far…`, busy: true, keys: ['Esc'] });
          }
        } catch (err) {
          if (count && signal.aborted) {
            status.show({ text: 'Stopped — the changes so far are still there to review', ms: 3000 });
            return;
          }
          throw err;
        }
        if (!count && declined)
          status.show({ text: `${declined} Clearpen edits your writing; it doesn’t write it from scratch.`, ms: 7000 });
        else if (!count) status.show('The AI found nothing to change for that.');
        else groupStatus(ed, group, count, 'Edits');
      });
    },
    [ai, backend, page, status, notes, keepVersion, groupStatus],
  );

  // What happened to a suggestion, in a word — or, while some of its group is
  // still undecided, how many are left.
  useEffect(() => {
    const stillPending = () => {
      const p = pending.current;
      const n = p ? left(p.ed, p.group).length : 0;
      if (p && n) groupStatus(p.ed, p.group, n, p.label);
      if (p && !n) pending.current = null;
      return n > 0;
    };
    const offAccept = page.on('accept', ({ suggestion }) => {
      if (stillPending()) return;
      const n = suggestion.count ?? 1;
      status.show({ text: n > 1 ? `Accepted ${n} changes` : 'Accepted', ms: 2200, keys: [`${mod}Z to undo`] });
    });
    const offReject = page.on('reject', () => {
      if (!stillPending()) status.show({ text: 'Kept your original', ms: 1600 });
    });
    // Editing over the suggestions removes them; the pill goes with them.
    const offUpdate = page.on('update', ({ docChanged }) => {
      const p = pending.current;
      if (docChanged && p && !left(p.ed, p.group).length) {
        status.clear(p.message);
        pending.current = null;
      }
    });
    return () => {
      offAccept();
      offReject();
      offUpdate();
    };
  }, [page, status, mod, groupStatus]);

  return useMemo(() => ({ rewrite, editWith }), [rewrite, editWith]);
}
