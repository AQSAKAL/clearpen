import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { FileEntry } from '../src/backend.ts';
import { sortEntries } from '../src/lib/files.ts';

const item = (name: string, isDir: boolean, size: number | null, modified: number | null): FileEntry => ({
  name,
  path: `/tmp/${name}`,
  isDir,
  size,
  modified,
});

test('folders stay first, and names sort naturally', () => {
  const entries = [item('file10.txt', false, 10, 1), item('Folder', true, null, 1), item('file2.txt', false, 20, 1)];
  const sorted = sortEntries(entries, { key: 'name', dir: 'asc' }, {});
  assert.deepEqual(
    sorted.map((entry) => entry.name),
    ['Folder', 'file2.txt', 'file10.txt'],
  );
  assert.equal(entries[0]?.name, 'file10.txt', 'the input array is untouched');
});

test('size uses the computed folder size and puts pending folders last', () => {
  const entries = [item('big', true, null, 1), item('small', true, null, 1), item('file', false, 5, 1)];
  const sizes = {
    '/tmp/big': { path: '/tmp/big', bytes: 900, complete: true },
  };
  const sorted = sortEntries(entries, { key: 'size', dir: 'desc' }, sizes);
  assert.deepEqual(
    sorted.map((entry) => entry.name),
    ['big', 'small', 'file'],
  );
  const ascending = sortEntries(entries, { key: 'size', dir: 'asc' }, sizes);
  assert.deepEqual(
    ascending.map((entry) => entry.name),
    ['big', 'small', 'file'],
    'pending folders stay last in either direction',
  );
});

test('modified toggles direction within each group', () => {
  const entries = [item('old', false, 1, 100), item('new', false, 1, 300), item('folder', true, null, 200)];
  const sorted = sortEntries(entries, { key: 'modified', dir: 'desc' }, {});
  assert.deepEqual(
    sorted.map((entry) => entry.name),
    ['folder', 'new', 'old'],
  );
});
