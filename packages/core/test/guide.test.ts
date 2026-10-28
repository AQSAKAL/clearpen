// Guided writing: frames are shown, never written; the coach asks, and only
// questions come back.
import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  BLANK,
  frameFilled,
  frameScaffold,
  guideReplyOk,
  isTemplateId,
  lastSentence,
  TEMPLATE_IDS,
  TEMPLATES,
  type TemplateId,
} from '../src/guide.ts';
import { MODE } from '../src/modes.ts';
import { guideMessages } from '../src/prompts.ts';
import { InputError } from '../src/tasks/common.ts';
import { guide } from '../src/tasks/guide.ts';
import { fakeLLM, lastUser } from './fake.ts';

const MODELS = { quick: 'quick-model', coach: 'coach-model' };
const judgeAsked = (req: Parameters<typeof lastUser>[0]) => lastUser(req).includes('sentence by sentence');

test('every template is a list of frames with one blank each, and every mode’s template exists', () => {
  for (const id of TEMPLATE_IDS) {
    const t = TEMPLATES[id];
    assert.equal(t.id, id);
    assert.ok(t.frames.length >= 3 && t.label && t.hint && t.about && t.done, id);
    for (const f of t.frames) {
      assert.equal(f.text.split(BLANK).length, 2, `${f.text} has one blank`);
      assert.match(f.ask, /\?/, `${f.ask} asks a question`);
      assert.ok(f.why.length > 20, `${f.text} says why`);
    }
  }
  for (const m of Object.values(MODE)) if (m.template) assert.ok(isTemplateId(m.template.id), m.id);
  assert.equal(TEMPLATES.reflect.layout, 'paragraph');
  assert.equal(TEMPLATES.scientific.frames.length, 6);
  assert.ok(!isTemplateId('letter'));
});

test('a frame is filled by a finished sentence with more than the frame’s own words, or one in the author’s shape', () => {
  const feel = TEMPLATES.reflect.frames[0]!;
  assert.deepEqual(frameScaffold(feel), ['i', 'feel', 'today']);
  assert.ok(frameFilled(feel, 'I feel tired today.'));
  assert.ok(frameFilled(feel, 'I feel worn thin today, and have for a week.'));
  assert.ok(!frameFilled(feel, 'I feel.'), 'the frame with nothing in the blank');
  assert.ok(!frameFilled(feel, 'I feel today.'));
  assert.ok(!frameFilled(feel, 'I feel tired today'), 'not a finished sentence');
  assert.ok(frameFilled(feel, 'Tired, mostly.'), 'the author’s own shape');
  assert.ok(!frameFilled(feel, 'Tired.'));
  assert.ok(frameFilled(TEMPLATES.problem.frames[0]!, 'I’m working on a build that takes an hour.'));
  assert.equal(lastSentence('I feel tired today. '), 'I feel tired today.');
  assert.equal(lastSentence('Earlier.\n\nI feel tired today.'), 'I feel tired today.');
  assert.equal(lastSentence('I feel tired'), '');
});

test('a coach reply is kept only as a short question that is not the author’s sentence', () => {
  const feel = TEMPLATES.reflect.frames[0]!;
  assert.ok(guideReplyOk(feel, ''));
  assert.ok(guideReplyOk(feel, 'Tired from what, or of what?'));
  assert.ok(guideReplyOk(feel, '  Which part of the day did it start? '));
  assert.ok(!guideReplyOk(feel, 'You are tired because the meeting ran long.'), 'not a question');
  assert.ok(!guideReplyOk(feel, 'I feel tired because of the meeting?'), 'the author’s sentence with a question mark');
  assert.ok(!guideReplyOk(feel, `${'Why that? '.repeat(30)}?`), 'too long');
});

test('the guide prompt shows the frames, marks the one just filled and the next, and never fills a blank', () => {
  const [system, user] = guideMessages({
    template: TEMPLATES.reflect,
    step: 1,
    before: 'I feel tired today. That comes from the meeting. ',
    sentence: 'That comes from the meeting.',
    missing: 'what it means — why it matters or what follows',
    brief: { mode: 'reflect' },
  });
  assert.match(system!.content, /NEVER write the author's prose/);
  assert.match(user!.content, /1\. "I feel ___ today\." — filled/);
  assert.match(user!.content, /2\. "That comes from ___\." — just filled/);
  assert.match(user!.content, /3\. "What I want instead is ___\." — next/);
  assert.match(user!.content, /never fill a blank and never write a sentence for them/);
  assert.match(user!.content, /still missing what it means/);
  assert.match(user!.content, /writing to think, not to publish/);
  assert.match(user!.content, /the question frame 3 asks/);
  const last = guideMessages({ template: TEMPLATES.reflect, step: 2, sentence: 'What I want instead is rest.' });
  assert.match(last[1]!.content, /there is no next frame/);
});

test('guide asks nothing until the frame is filled; then the judge, then the coach, and only questions come back', async () => {
  const judge = JSON.stringify({ point: 1, support: 0, meaning: 0 });
  const coach = JSON.stringify({
    missing: 'Tired from what, or of what?',
    next: 'What happened yesterday that left you this way?',
  });
  const { llm, provider } = fakeLLM({ complete: (req) => (judgeAsked(req) ? judge : coach) }, MODELS);
  assert.deepEqual(await guide(llm, { template: 'reflect', step: 0, before: 'I feel' }), {
    filled: false,
    missing: '',
    next: '',
    complete: false,
  });
  assert.equal(provider.requests.length, 0, 'an unfinished sentence asks the model nothing');

  const reply = await guide(llm, { template: 'reflect', step: 0, before: 'I feel tired today. ' });
  assert.deepEqual(reply, {
    filled: true,
    missing: 'Tired from what, or of what?',
    next: 'What happened yesterday that left you this way?',
    complete: false,
  });
  assert.equal(provider.requests.length, 2);
  assert.equal(provider.requests[0]!.model, 'quick-model');
  assert.ok(judgeAsked(provider.requests[0]!));
  assert.equal(provider.requests[1]!.model, 'coach-model');
  assert.match(lastUser(provider.requests[1]!), /still missing support for its point/);
  assert.match(lastUser(provider.requests[1]!), /just filled frame 1: "I feel tired today\."/);
});

test('guide drops a reply that writes for the author, skips the judge between paragraphs, and ends when the point is made', async () => {
  const written = JSON.stringify({
    missing: 'The build is slow because the cache is cold.',
    next: 'It matters because you lose an hour a day.',
  });
  const { llm, provider } = fakeLLM({ complete: () => written }, MODELS);
  assert.deepEqual(await guide(llm, { template: 'problem', step: 0, before: 'I’m working on a slow build. ' }), {
    filled: true,
    missing: '',
    next: '',
    complete: false,
  });
  assert.equal(provider.requests.length, 1, 'a one-sentence paragraph is not judged');
  assert.equal(provider.requests[0]!.model, 'coach-model');

  const full = JSON.stringify({ point: 1, support: 2, meaning: 3 });
  const done = fakeLLM(
    { complete: (req) => (judgeAsked(req) ? full : JSON.stringify({ missing: '', next: 'Anything else?' })) },
    MODELS,
  );
  assert.deepEqual(
    await guide(done.llm, {
      template: 'reflect',
      step: 2,
      before: 'I feel tired today. That comes from the meeting. What I want instead is a quiet week. ',
    }),
    { filled: true, missing: '', next: '', complete: true },
  );
  await assert.rejects(guide(llm, { template: 'letter' as TemplateId, step: 0, before: '' }), InputError);
  await assert.rejects(guide(llm, { template: 'reflect', step: 9, before: '' }), InputError);
});
