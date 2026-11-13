// Precache the self-hosted app and its bundled fonts, including lazy routes.
// Old tabs keep their assets until every client of the old worker is closed.
import { createHash } from 'node:crypto';
import type { Plugin } from 'vite';

export function offlineBuild(): Plugin {
  return {
    name: 'clearpen-offline',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      const files = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        .sort();
      const hash = createHash('sha256').update(JSON.stringify(files));
      const entry = bundle['index.html'];
      if (entry?.type === 'asset') hash.update(entry.source);
      const version = hash.digest('hex').slice(0, 16);
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: `
const prefix = 'clearpen:' + self.registration.scope + ':';
const cacheName = prefix + '${version}';
const files = ${JSON.stringify(files)};
const urls = new Set(files.map(name => new URL(name, self.registration.scope).href));
self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll([...urls])));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(prefix) && k !== cacheName).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const entry = new URL('index.html', self.registration.scope);
  const home = new URL(self.registration.scope);
  const navigation = event.request.mode === 'navigate' && url.origin === home.origin && [home.pathname,entry.pathname].includes(url.pathname);
  if (!navigation && !urls.has(url.href)) return;
  event.respondWith(caches.open(cacheName).then(cache => cache.match(navigation ? entry.href : url.href)).then(hit => hit || fetch(event.request)));
});
`,
      });
    },
  };
}
