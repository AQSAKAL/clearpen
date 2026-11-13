import type { FileEntry, FilesService } from '@clearpen/ui';

/** Only the file metadata the user granted through the directory picker is indexed. */
export function createBrowserExplorer(): FilesService {
  let root = '';
  const entries = new Map<string, FileEntry>();
  const files = new Map<string, File>();
  const children = new Map<string, FileEntry[]>();
  const sizes = new Map<string, number>();
  function selectFolder(selection: FileList) {
    if (!selection.length) return;
    root = '/' + selection[0]!.webkitRelativePath.split('/')[0];
    entries.clear();
    files.clear();
    children.clear();
    sizes.clear();
    for (const file of Array.from(selection)) {
      const parts = file.webkitRelativePath.split('/');
      let path = root;
      for (const [index, name] of parts.slice(1).entries()) {
        const parent = path;
        path += '/' + name;
        sizes.set(parent, (sizes.get(parent) ?? 0) + file.size);
        if (entries.has(path)) continue;
        const isDir = index < parts.length - 2;
        const entry = { name, path, isDir, size: isDir ? null : file.size, modified: isDir ? null : file.lastModified };
        entries.set(path, entry);
        if (!children.has(parent)) children.set(parent, []);
        children.get(parent)!.push(entry);
        if (!isDir) files.set(path, file);
      }
    }
  }
  function descendants(path: string, hidden = false) {
    const prefix = path + '/';
    return [...entries.values()].filter(
      (entry) =>
        entry.path.startsWith(prefix) &&
        (hidden ||
          !entry.path
            .slice(prefix.length)
            .split('/')
            .some((name) => name.startsWith('.'))),
    );
  }
  return {
    selectFolder,
    async places() {
      return { home: root, places: root ? [{ name: root.slice(1), path: root, kind: 'home' }] : [] };
    },
    async list(path, { showHidden } = {}) {
      if (path !== root && !entries.get(path)?.isDir) throw new Error('Choose a folder inside the selected directory.');
      return (children.get(path) ?? []).filter((entry) => showHidden || !entry.name.startsWith('.'));
    },
    async search(path, query, { limit = 120, showHidden } = {}) {
      const tokens = query.toLowerCase().replaceAll('\\', '/').trim().split(/\s+/);
      return descendants(path, showHidden)
        .filter((entry) => {
          const text = (
            tokens.some((word) => word.includes('/')) ? entry.path.slice(path.length + 1) : entry.name
          ).toLowerCase();
          return tokens.every((word) => text.includes(word));
        })
        .slice(0, limit);
    },
    async folderSizes(paths) {
      return paths.map((path) => ({ path, bytes: sizes.get(path) ?? 0, complete: true }));
    },
    onFolderSize: () => () => {},
    async largeFiles(path, limit = 100) {
      const start = performance.now();
      const largest = descendants(path)
        .filter((entry) => !entry.isDir)
        .sort((a, b) => b.size! - a.size!)
        .slice(0, limit);
      return { files: largest, complete: true, scannedMs: Math.round(performance.now() - start) };
    },
    async open(path) {
      const file = files.get(path);
      if (!file) throw new Error('Select the folder again to download this file.');
      const link = document.createElement('a');
      link.href = URL.createObjectURL(file);
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    },
  };
}
