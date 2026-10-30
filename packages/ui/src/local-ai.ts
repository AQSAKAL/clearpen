// The AI features running in the app itself, on a model client the backend
// makes (Ollama on this machine, through whatever fetch it needs).

import {
  askSources,
  check,
  edit,
  emphasize,
  guide,
  type LLMClient,
  nextSentenceStream,
  proofread,
  type Role,
  review,
  rewrite,
  thoughtTree,
} from '@clearpen/core';
import type { AI } from './backend.ts';

const ROLES: Role[] = ['quick', 'coach', 'checker'];

export function localAI(llm: LLMClient): AI {
  return {
    status: () => llm.status(),
    ...(llm.provider.pull ? { pull: llm.provider.pull.bind(llm.provider) } : {}),
    setModels(models, { preload = false } = {}) {
      for (const role of ROLES) llm.setModel(role, models[role] ?? null);
      if (preload)
        llm
          .modelFor('quick')
          .then((m) => llm.provider.preload(m))
          .catch(() => {});
    },
    rewrite: (input, opts) => rewrite(llm, input, opts),
    edit: (input, opts) => edit(llm, input, opts),
    nextSentence: (input, opts) => nextSentenceStream(llm, input, opts),
    proofread: (input, opts) => proofread(llm, input, opts),
    review: (input, opts) => review(llm, input, opts),
    check: (input, opts) => check(llm, input, opts),
    guide: (input, opts) => guide(llm, input, opts),
    askSources: (input, opts) => askSources(llm, input, opts),
    thoughtTree: (input, opts) => thoughtTree(llm, input.before, opts),
    emphasize: (input, opts) => emphasize(llm, input, opts),
  };
}
