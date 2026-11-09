// The AI features running in the app itself, on a model client the backend
// makes (Ollama on this machine, WebLLM in the page, or OpenRouter in the
// cloud through the writer's own key).

import {
  askSources,
  check,
  createLLM,
  edit,
  emphasize,
  guide,
  type LLMClient,
  type LLMProvider,
  type ModelInfo,
  nextSentenceStream,
  OPENROUTER_PREFERRED,
  proofread,
  type Role,
  review,
  rewrite,
  thoughtTree,
} from '@clearpen/core';
import type { AI, ModelChoice } from './backend.ts';

const ROLES: Role[] = ['quick', 'coach', 'checker'];

/** How each backend makes the providers the writer can choose between. */
export interface AIProviders {
  /** OpenRouter, with the writer's key. Absent where the build can't reach it. */
  openRouter?: (apiKey: string) => LLMProvider;
}

/**
 * The AI features over a model client that can change provider: from the
 * writer's computer to OpenRouter and back, without restarting the app.
 * `initial` may be a ready client (tests) or a factory.
 */
export function localAI(initial: LLMClient | (() => LLMClient), providers?: AIProviders): AI {
  const local = typeof initial === 'function' ? initial() : initial;
  let llm = local;
  let source: 'local' | 'openrouter' = 'local';

  function apply(models: ModelChoice = {}, { preload = false } = {}) {
    for (const role of ROLES) llm.setModel(role, models[role] ?? null);
    if (preload)
      void llm
        .modelFor('quick')
        .then((m) => llm.provider.preload(m))
        .catch(() => {});
  }

  return {
    status: () => llm.status(),
    openRouter: !!providers?.openRouter,
    setModels: apply,

    async switchToOpenRouter(apiKey, models = {}) {
      const make = providers?.openRouter;
      if (!make) throw new Error('OpenRouter isn’t available in this build.');
      const next = createLLM({
        provider: make(apiKey),
        preferred: OPENROUTER_PREFERRED,
      });
      // Point at the new client before its models are applied.
      llm = next;
      apply(models);
      const status = await next.status();
      if (!status.ok) {
        llm = local;
        source = 'local';
        throw new Error(status.error || 'OpenRouter didn’t answer.');
      }
      // The catalogue may have retired the model the writer chose. Keep the
      // one the client settled on, so the next request doesn't look it up again.
      if (!models.quick && status.roles.quick) next.setModel('quick', status.roles.quick);
      source = 'openrouter';
      return status;
    },

    async switchToLocal(models = {}) {
      llm = local;
      source = 'local';
      apply(models);
      return llm.status();
    },

    async catalogue(): Promise<ModelInfo[]> {
      try {
        if (llm.provider.catalogue) return await llm.provider.catalogue();
        return (await llm.status()).models.map((id) => ({ id }));
      } catch {
        return [];
      }
    },

    localStatus: () => local.status(),

    ...(local.provider.pull
      ? {
          pull: (model: string, opts?: { signal?: AbortSignal }) => {
            if (source !== 'local' || !local.provider.pull)
              throw new Error('Models from OpenRouter aren’t downloaded to this computer.');
            return local.provider.pull(model, opts);
          },
        }
      : {}),

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
