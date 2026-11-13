// Commit SQLite changes inside one IndexedDB transaction. Multiple tabs can
// write different articles without replacing each other's library snapshots.
import { openLibrary, type SqlDriver } from '@clearpen/db';
import initSqlJs, { type BindParams, type Database } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';

function openStore(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('clearpen', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('library');
      request.result.createObjectStore('images');
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function openBrowserStorage() {
  const [store, SQL] = await Promise.all([openStore(), initSqlJs({ locateFile: () => wasmUrl })]);
  function query<T>(write: boolean, execute: (db: Database) => T): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = store.transaction('library', write ? 'readwrite' : 'readonly');
      const table = tx.objectStore('library');
      const snapshot = table.get('sqlite');
      let result: T;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error);
      snapshot.onsuccess = () => {
        let db: Database | undefined;
        try {
          db = new SQL.Database(snapshot.result);
          result = execute(db);
          if (write) table.put(db.export(), 'sqlite');
        } catch (error) {
          failure = error;
          tx.abort();
        } finally {
          db?.close();
        }
      };
    });
  }
  const driver: SqlDriver = {
    run: (sql, params) =>
      query(true, (db) => {
        db.run(sql, params as BindParams);
      }),
    exec: (sql) =>
      query(true, (db) => {
        db.exec(sql);
      }),
    all: (sql, params) =>
      query(false, (db) => {
        const stmt = db.prepare(sql, params as BindParams);
        try {
          const rows = [];
          while (stmt.step()) rows.push(stmt.getAsObject());
          return rows;
        } finally {
          stmt.free();
        }
      }),
  };
  const library = await navigator.locks.request('clearpen-library-migrations', () => openLibrary(driver));
  const images = new Map<string, { blob: Blob; url: string }>();
  const remember = (src: string, blob: Blob) => {
    if (!images.has(src)) images.set(src, { blob, url: URL.createObjectURL(blob) });
  };
  await new Promise<void>((resolve, reject) => {
    const tx = store.transaction('images');
    const request = tx.objectStore('images').openCursor();
    request.onsuccess = () => {
      const cursor = request.result;
      if (cursor) {
        const { bytes, type } = cursor.value;
        remember(String(cursor.key), new Blob([bytes], { type }));
        cursor.continue();
      }
    };
    tx.onabort = () => reject(tx.error);
    tx.oncomplete = () => resolve();
  });
  async function putImage(src: string, bytes: Uint8Array<ArrayBuffer>, type: string) {
    if (images.has(src)) return;
    await new Promise<void>((resolve, reject) => {
      const tx = store.transaction('images', 'readwrite');
      tx.objectStore('images').put({ bytes, type }, src);
      tx.onabort = () => reject(tx.error);
      tx.oncomplete = () => resolve();
    });
    remember(src, new Blob([bytes], { type }));
  }
  return { library, images, putImage };
}
