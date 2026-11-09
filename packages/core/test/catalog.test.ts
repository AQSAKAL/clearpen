// Ollama's library page, read into the models the picker offers: names,
// descriptions, sizes, capabilities, and the tags a model comes in.

import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  defaultTag,
  mainTags,
  parseOllamaLibrary,
  parseOllamaTags,
  searchModels,
  writerModels,
} from '../src/llm/catalog.ts';

const CARD = (name: string, description: string, capabilities: string[], sizes: string[]) => `
    <li class="flex items-baseline border-b border-neutral-200 py-6">
      <a href="/library/${name}" class="group w-full space-y-5">
        <div title="${name}" class="flex flex-col">
          <h2 class="truncate text-xl font-medium underline-offset-2 md:text-2xl">
            <div class="flex space-x-2 items-center"><span class="group-hover:underline truncate">${name}</span></div>
          </h2>
          <p class="max-w-lg break-words text-neutral-800 text-md">${description}</p>
        </div>
        <div class="flex flex-col space-y-2">
          <div class="flex flex-wrap space-x-2">
            ${capabilities
              .map(
                (c) =>
                  `<span class="inline-flex items-center rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600 sm:text-[13px]">${c}</span>`,
              )
              .join('\n')}
            ${sizes
              .map(
                (s) =>
                  `<span class="inline-flex items-center rounded-md bg-[#ddf4ff] px-2 py-0.5 text-xs font-medium text-blue-600 sm:text-[13px]">${s}</span>`,
              )
              .join('\n')}
          </div>
          <p class="flex space-x-5 text-[13px] font-medium">
            <span class="flex items-center"><span>72</span><span class="hidden sm:flex">&nbsp;Tags</span></span>
            <span class="flex items-center"><span>3 weeks ago</span></span>
          </p>
        </div>
      </a>
    </li>`;

const LIBRARY = `<ul>${CARD('qwen3.5', 'Qwen 3.5 is a family of <strong>open-source</strong> multimodal models.', ['vision', 'tools', 'thinking'], ['4b', '9b'])}${CARD(
  'nomic-embed-text',
  'A high-performing open embedding model &amp; friends.',
  ['embedding', 'tools'],
  [],
)}</ul>`;

const TAG = (name: string, size: string, context: string, latest = false) => `
      <div class="group px-4 py-3">
        <a href="/library/qwen3.5:${name}" class="md:hidden flex flex-col space-y-[6px] group">
          <div class="flex items-center font-medium">
            <div class="flex items-center justify-between w-full">
              <div>
                <span class="group-hover:underline">qwen3.5:${name}</span>
                ${latest ? '<span class="ml-2 inline-flex items-center rounded-full px-2 py-px text-xs font-medium border border-blue-500 text-blue-600">latest</span>' : ''}
              </div>
            </div>
          </div>
          <div class="flex flex-col text-neutral-500 text-[13px]">
            <span>
              <span class="font-mono">500a1f067a9f</span> • ${size} • ${context} context window •
              <span class="hidden sm:inline">Text input • 1 year ago</span>
            </span>
          </div>
        </a>
      </div>`;

const TAGS = `<div>${TAG('9b', '6.6GB', '40K', true)}${TAG('4b', '3.4GB', '256K')}${TAG(
  '9b-q4_K_M',
  '6.6GB',
  '40K',
)}${TAG('9b', '6.6GB', '40K', true)}</div>`;

test('the library page becomes models, without the badges’ markup', () => {
  const models = parseOllamaLibrary(LIBRARY);
  assert.deepEqual(models, [
    {
      name: 'qwen3.5',
      description: 'Qwen 3.5 is a family of open-source multimodal models.',
      sizes: ['4b', '9b'],
      capabilities: ['vision', 'tools', 'thinking'],
      updated: '3 weeks ago',
      tags: 72,
    },
    {
      name: 'nomic-embed-text',
      description: 'A high-performing open embedding model & friends.',
      sizes: [],
      capabilities: ['embedding', 'tools'],
      updated: '3 weeks ago',
      tags: 72,
    },
  ]);
});

test('models to write with leave out the embeddings', () => {
  assert.deepEqual(
    writerModels(parseOllamaLibrary(LIBRARY)).map((m) => m.name),
    ['qwen3.5'],
  );
});

test('search matches a name, a size or a word of the description', () => {
  const models = writerModels(parseOllamaLibrary(LIBRARY));
  assert.deepEqual(
    searchModels(models, 'qwen').map((m) => m.name),
    ['qwen3.5'],
  );
  assert.deepEqual(
    searchModels(models, 'qwen 9b').map((m) => m.name),
    ['qwen3.5'],
  );
  assert.deepEqual(
    searchModels(models, 'multimodal').map((m) => m.name),
    ['qwen3.5'],
  );
  assert.deepEqual(searchModels(models, 'embed'), []);
  assert.deepEqual(
    searchModels(models, '').map((m) => m.name),
    ['qwen3.5'],
  );
});

test('a model’s tags: sizes, contexts, the default, and one copy of each', () => {
  const tags = parseOllamaTags(TAGS);
  assert.deepEqual(
    tags.map((t) => [t.name, t.bytes, t.context, t.latest, t.quantized]),
    [
      ['9b', 6.6e9, '40K', true, false],
      ['4b', 3.4e9, '256K', false, false],
      ['9b-q4_K_M', 6.6e9, '40K', false, true],
    ],
  );
  assert.equal(defaultTag(tags)?.name, '9b');
  assert.deepEqual(
    mainTags(tags).map((t) => t.name),
    ['9b', '4b'],
    'the quantisations stay behind the size they quantise',
  );
});
