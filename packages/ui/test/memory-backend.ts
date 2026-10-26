// A Backend for tests: the real library on in-memory SQLite, images in a Map,
// saved files recorded instead of written, and a model that's there unless a
// test says otherwise.

import { prepareImage } from '@clearpen/core';
import { openLibrary } from '@clearpen/db';
import { nodeDriver } from '@clearpen/db/node';
import type { Backend } from '../src/backend.ts';
import { localAI } from '../src/local-ai.ts';
import { type FakeMachine, fakeModel, type Reply } from './fake-model.ts';

export interface TestBackend extends Backend {
  saved: { name: string; contents: string; type: string }[];
  images: Map<string, Uint8Array>;
  /** Links the app opened. */
  opened: string[];
}

export async function testBackend(
  replies: Reply[] = [],
  { machine, memory = null }: { machine?: FakeMachine; memory?: number | null } = {},
): Promise<TestBackend> {
  const library = await openLibrary(nodeDriver());
  const images = new Map<string, Uint8Array>();
  const saved: TestBackend['saved'] = [];
  const opened: string[] = [];
  return {
    where: 'in memory',
    platform: 'mac',
    overlayTitleBar: false,
    library,
    saved,
    images,
    opened,
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
    ai: localAI(fakeModel(replies, machine).llm),
    async openLink(url) {
      opened.push(url);
    },
    memory: async () => memory,
  };
}
