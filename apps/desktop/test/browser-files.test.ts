import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createBrowserExplorer } from '../src/browser-files.ts';

function selection(...paths: string[]): FileList {
  return paths.map((webkitRelativePath) =>
    Object.assign(new File(['123'], webkitRelativePath.split('/').at(-1)!), { webkitRelativePath }),
  ) as unknown as FileList;
}

test('the selected folder bounds search, sizes and cleanup, including after a change of folder', async () => {
  const explorer = createBrowserExplorer();
  explorer.selectFolder!(selection('Notes/archive/draft.txt', 'Notes/archive/draft-two.txt', 'Notes/.private/log'));
  assert.deepEqual(
    (await explorer.list('/Notes')).map((entry) => entry.name),
    ['archive'],
  );
  assert.equal((await explorer.folderSizes(['/Notes/archive']))[0]?.bytes, 6);
  assert.equal((await explorer.search('/Notes', 'two draft'))[0]?.name, 'draft-two.txt');
  assert.equal((await explorer.largeFiles('/Notes')).files.length, 2);
  explorer.selectFolder!(selection('Next/source.md'));
  assert.equal((await explorer.places()).home, '/Next');
  await assert.rejects(explorer.list('/Notes'));
});
