/**
 * Shared storage layer — all modules use this, never localStorage directly.
 * Backed by IndexedDB. Swap the internals for Supabase in v2 without touching callers.
 *
 * Usage:
 *   import db from '../shared/db.js';
 *   await db.set('calories', 'log-2026-06-02', { ... });
 *   const entry = await db.get('calories', 'log-2026-06-02');
 *   const all   = await db.getAll('calories');
 *   await db.delete('calories', 'log-2026-06-02');
 *   await db.clear('calories');
 */

const DB_NAME    = 'life-dashboard';
const DB_VERSION = 1;
const STORES     = ['calories', 'workout', 'finance', 'habits'];

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = e => {
      const db = e.target.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) {
          db.createObjectStore(name);
        }
      }
    };

    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function tx(store, mode, fn) {
  return open().then(db => new Promise((resolve, reject) => {
    const t   = db.transaction(store, mode);
    const s   = t.objectStore(store);
    const req = fn(s);
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  }));
}

const db = {
  get:    (store, key)        => tx(store, 'readonly',  s => s.get(key)),
  set:    (store, key, value) => tx(store, 'readwrite', s => s.put(value, key)),
  delete: (store, key)        => tx(store, 'readwrite', s => s.delete(key)),
  clear:  (store)             => tx(store, 'readwrite', s => s.clear()),

  getAll(store) {
    return open().then(db => new Promise((resolve, reject) => {
      const t       = db.transaction(store, 'readonly');
      const s       = t.objectStore(store);
      const results = [];
      const cursor  = s.openCursor();
      cursor.onsuccess = e => {
        const c = e.target.result;
        if (c) { results.push({ key: c.key, value: c.value }); c.continue(); }
        else resolve(results);
      };
      cursor.onerror = e => reject(e.target.error);
    }));
  },
};

export default db;
