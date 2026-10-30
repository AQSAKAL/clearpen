import { describe, expect, test } from 'vitest';
import { emphasize } from '../src/tasks/emphasize.ts';
import { fakeLLM } from './fake.ts';

const TEXT = 'The market fell hard. That matters for savers. Prices will drop next year.';

const answer = (emphasis: unknown) => () => JSON.stringify({ emphasis });

describe('emphasize', () => {
  test('marks the phrases the model names, without changing the text', async () => {
    const { llm } = fakeLLM({
      complete: answer([
        { anchor: 'market fell hard', kind: 'bold' },
        { anchor: 'matters for savers', kind: 'italic' },
        { anchor: 'Prices will drop next year', kind: 'underline' },
      ]),
    });

    const { spans } = await emphasize(llm, { text: TEXT });

    expect(spans).toEqual([
      { from: 4, to: 20, kind: 'bold', text: 'market fell hard' },
      { from: 27, to: 45, kind: 'italic', text: 'matters for savers' },
      { from: 47, to: 73, kind: 'underline', text: 'Prices will drop next year' },
    ]);
    // Every span is a slice of the passage; adding marks changes no word.
    for (const s of spans) expect(TEXT.slice(s.from, s.to)).toBe(s.text);
  });

  test('skips headings and labels, keeping the running text', async () => {
    const passage = '# Why markets fall\n\nMarkets fall when buyers outnumber sellers.';
    const { llm } = fakeLLM({
      complete: answer([
        { anchor: 'Why markets fall', kind: 'bold' },
        { anchor: 'buyers outnumber sellers', kind: 'italic' },
      ]),
    });
    const { spans } = await emphasize(llm, { text: passage });
    expect(spans).toHaveLength(1);
    expect(spans[0]?.text).toBe('buyers outnumber sellers');
  });

  test('drops anchors that are not in the passage and unknown kinds', async () => {
    const { llm } = fakeLLM({
      complete: answer([
        { anchor: 'not in the text at all', kind: 'bold' },
        { anchor: 'market fell hard', kind: 'shout' },
        { anchor: 'market fell hard', kind: 'bold' },
      ]),
    });
    const { spans } = await emphasize(llm, { text: TEXT });
    expect(spans).toHaveLength(1);
    expect(spans[0]?.kind).toBe('bold');
  });

  test('an empty passage asks the model nothing', async () => {
    const { llm, provider } = fakeLLM({ complete: answer([]) });
    const { spans } = await emphasize(llm, { text: '   ' });
    expect(spans).toEqual([]);
    expect(provider.requests).toHaveLength(0);
  });
});
