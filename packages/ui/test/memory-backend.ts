// A Backend for tests: the real library on in-memory SQLite, images in a Map,
// saved files recorded instead of written, and a model that's always there.

import { prepareImage } from '@margin/core';
import { openLibrary } from '@margin/db';
import { nodeDriver } from '@margin/db/node';
import type { Backend } from '../src/backend.ts';

export interface TestBackend extends Backend {
  saved: { name: string; contents: string; type: string }[];
  images: Map<string, Uint8Array>;
}

export async function testBackend(): Promise<TestBackend> {
  const library = await openLibrary(nodeDriver());
  const images = new Map<string, Uint8Array>();
  const saved: TestBackend['saved'] = [];
  return {
    where: 'in memory',
    platform: 'mac',
    overlayTitleBar: false,
    library,
    saved,
    images,
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
    ai: {
      async status() {
        return {
          ok: true,
          provider: 'ollama',
          baseUrl: 'http://127.0.0.1:11434',
          models: ['qwen3:8b'],
          roles: { quick: 'qwen3:8b', coach: 'qwen3:8b', checker: 'qwen3:8b' },
          error: null,
        };
      },
    },
  };
}
