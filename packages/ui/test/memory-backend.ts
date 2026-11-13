// A Backend for tests: the real library on in-memory SQLite, images in a Map,
// saved files recorded instead of written, web pages from a Map, and a model
// that's there unless a test says otherwise.

import type { LLMProvider } from '@clearpen/core';
import { prepareImage } from '@clearpen/core';
import { openLibrary } from '@clearpen/db';
import { nodeDriver } from '@clearpen/db/node';
import type { AppEvent, Backend, EventInput } from '../src/backend.ts';
import { localAI } from '../src/local-ai.ts';
import { type FakeMachine, fakeModel, type Reply } from './fake-model.ts';

export interface TestBackend extends Backend {
  saved: { name: string; contents: string; type: string }[];
  images: Map<string, Uint8Array>;
  /** Links the app opened. */
  opened: string[];
  /** Pages the app fetched. */
  fetched: string[];
}

export async function testBackend(
  replies: Reply[] = [],
  {
    machine,
    memory = null,
    pages = {},
    openRouter,
  }: {
    machine?: FakeMachine;
    memory?: number | null;
    /** The web, as far as the test goes: each page's content type and text. */
    pages?: Record<string, { type?: string; text: string }>;
    /** Makes OpenRouter, with whatever fetch the test wants. Absent: this build has no cloud models. */
    openRouter?: (apiKey: string) => LLMProvider;
  } = {},
): Promise<TestBackend> {
  const library = await openLibrary(nodeDriver());
  const images = new Map<string, Uint8Array>();
  const saved: TestBackend['saved'] = [];
  const opened: string[] = [];
  const fetched: string[] = [];
  const keys = new Map<string, string>();
  const listeners = new Set<(event: AppEvent) => void>();
  let seq = 0;
  return {
    where: 'in memory',
    platform: 'mac',
    overlayTitleBar: false,
    library,
    events: {
      onEvent(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      emit(input: EventInput) {
        const at = Date.now();
        const event: AppEvent = {
          id: `ev_test_${seq++}`,
          kind: input.kind,
          source: input.source ?? 'test',
          at,
          data: input.data ?? null,
        };
        for (const listener of listeners) listener(event);
      },
    },
    saved,
    images,
    opened,
    fetched,
    async fetchPage(url) {
      fetched.push(url);
      const page = pages[url];
      if (!page) throw new Error('The page answered 404 Not Found.');
      return { url, type: page.type ?? 'text/html; charset=utf-8', text: page.text };
    },
    media: {
      async add(file) {
        const img = await prepareImage(file);
        images.set(img.src, img.bytes);
        await library.media.record({ sha256: img.sha256, type: img.type, size: img.bytes.length, name: img.name });
        return { src: img.src, type: img.type, bytes: img.bytes.length };
      },
      url: (src) => (images.has(src) ? `blob:test/${src}` : null),
      async dataUrl(src) {
        return images.has(src) ? 'data:image/png;base64,AAAA' : null;
      },
    },
    files: {
      async save(name, contents, type) {
        saved.push({ name, contents, type });
        return true;
      },
    },
    ai: localAI(fakeModel(replies, machine).llm, openRouter ? { openRouter } : undefined),
    secrets: {
      persistent: false,
      get: async (name) => keys.get(name) ?? null,
      set: async (name, value) => {
        keys.set(name, value);
      },
      delete: async (name) => {
        keys.delete(name);
      },
    },
    async openLink(url) {
      opened.push(url);
    },
    memory: async () => memory,
  };
}
