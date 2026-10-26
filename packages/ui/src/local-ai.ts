// The AI features running in the app itself, on a model client the backend
// makes (Ollama on this machine, through whatever fetch it needs).

import { edit, type LLMClient, nextSentence, type Role, rewrite } from '@margin/core';
import type { AI } from './backend.ts';

const ROLES: Role[] = ['quick', 'coach', 'checker'];

export function localAI(llm: LLMClient): AI {
  return {
    status: () => llm.status(),
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
    nextSentence: (input, opts) => nextSentence(llm, input, opts),
  };
}
