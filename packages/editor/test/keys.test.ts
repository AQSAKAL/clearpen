// Tab keeps the writer in the editor (unless they've just pressed Esc), and
// ⌘B / ⌘I wrap or unwrap the selection.

import { afterEach, describe, expect, test, vi } from 'vitest';
import { wrapSelection } from '../src/keys.ts';
import { mount, press } from './helpers.ts';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Tab', () => {
  test('accepts the ghost text', () => {
    const ed = mount('People who');
    ed.setSelection(10);
    ed.showGhost(10, ' value privacy.');
    expect(press(ed, 'Tab')).toBe(true);
    expect(ed.getText()).toBe('People who value privacy.');
  });

  test('takes the ghost text even in a list item', () => {
    const ed = mount('- People who');
    ed.setSelection(12);
    ed.showGhost(12, ' care.');
    press(ed, 'Tab');
    expect(ed.getText()).toBe('- People who care.');
  });

  test('indents a list item, and Shift-Tab outdents it', () => {
    const ed = mount('Intro\n\n- one\n1. two');
    ed.setSelection(12);
    expect(press(ed, 'Tab')).toBe(true);
    expect(ed.getText()).toBe('Intro\n\n  - one\n1. two');
    expect(press(ed, 'Tab', { shift: true })).toBe(true);
    expect(ed.getText()).toBe('Intro\n\n- one\n1. two');
    ed.setSelection(ed.length());
    press(ed, 'Tab');
    expect(ed.getText()).toBe('Intro\n\n- one\n  1. two');
  });

  test('does nothing on plain text, but keeps focus', () => {
    const ed = mount('Just prose.');
    ed.setSelection(4);
    expect(press(ed, 'Tab')).toBe(true);
    expect(press(ed, 'Tab', { shift: true })).toBe(true);
    expect(ed.getText()).toBe('Just prose.');
  });

  test('lets focus move on within 1.5 s of an Esc', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const ed = mount('Just prose.');
    ed.setSelection(4);
    expect(press(ed, 'Escape')).toBe(false); // nothing to clear, so it reaches the DOM handler
    now.mockReturnValue(1_001_400);
    expect(press(ed, 'Tab')).toBe(false);
    expect(press(ed, 'Tab', { shift: true })).toBe(false);
    now.mockReturnValue(1_001_500);
    expect(press(ed, 'Tab')).toBe(true);
    expect(ed.getText()).toBe('Just prose.');
  });

  test('after an Esc, still takes ghost text shown since', () => {
    const ed = mount('People who');
    ed.setSelection(10);
    press(ed, 'Escape');
    ed.showGhost(10, ' care.');
    expect(press(ed, 'Tab')).toBe(true);
    expect(ed.getText()).toBe('People who care.');
  });
});

describe('wrapSelection', () => {
  test('wraps the selection and keeps it selected', () => {
    const ed = mount('make this bold');
    ed.setSelection(5, 9);
    expect(wrapSelection(ed.view, '**')).toBe(true);
    expect(ed.getText()).toBe('make **this** bold');
    expect(ed.getSelection()).toMatchObject({ from: 5, to: 13, text: '**this**' });
  });

  test('unwraps a selection that is wrapped already', () => {
    const ed = mount('make **this** bold');
    ed.setSelection(5, 13);
    wrapSelection(ed.view, '**');
    expect(ed.getText()).toBe('make this bold');
    expect(ed.getSelection()).toMatchObject({ from: 5, to: 9, text: 'this' });
  });

  test('does nothing without a selection', () => {
    const ed = mount('make this bold');
    ed.setSelection(5);
    expect(wrapSelection(ed.view, '**')).toBe(false);
    expect(ed.getText()).toBe('make this bold');
  });

  test('a lone pair of marks is wrapped, not emptied', () => {
    const ed = mount('**');
    ed.setSelection(0, 2);
    wrapSelection(ed.view, '*');
    expect(ed.getText()).toBe('****');
  });

  test('⌘B bolds and ⌘I italicises', () => {
    const ed = mount('a word here');
    ed.setSelection(2, 6);
    expect(press(ed, 'b', { mod: true })).toBe(true);
    expect(ed.getText()).toBe('a **word** here');
    ed.setSelection(11, 15);
    press(ed, 'i', { mod: true });
    expect(ed.getText()).toBe('a **word** *here*');
  });
});

describe('⌘J', () => {
  test('asks the app for a completion, and is handled only if the app says so', () => {
    const onRequestCompletion = vi.fn(() => true);
    const ed = mount('Text', { onRequestCompletion });
    expect(press(ed, 'j', { mod: true })).toBe(true);
    expect(onRequestCompletion).toHaveBeenCalledTimes(1);
    onRequestCompletion.mockReturnValue(false);
    expect(press(ed, 'j', { mod: true })).toBe(false);
    expect(press(mount('Text'), 'j', { mod: true })).toBe(false);
  });
});
