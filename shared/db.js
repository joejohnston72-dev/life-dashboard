/**
 * Shared storage layer — IndexedDB as the local-first store, Supabase for
 * cross-device sync. All reads come from IndexedDB (fast, works offline).
 * Writes go to IndexedDB immediately then fire-and-forget to Supabase.
 * On module load (when authenticated) a full pull from Supabase merges any
 * changes made on other devices into the local store.
 */

import { supabase } from './supabase.js';

const DB_NAME    = 'life-dashboard';
const DB_VERSION = 1;
const STORES     = ['calories', 'workout', 'habits'];

// ── IndexedDB ─────────────────────────────────────────────────────────────────
function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      for (const name of STORES) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
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

function idbGet(store, key)        { return tx(store, 'readonly',  s => s.get(key)); }
function idbSet(store, key, value) { return tx(store, 'readwrite', s => s.put(value, key)); }
function idbDel(store, key)        { return tx(store, 'readwrite', s => s.delete(key)); }
function idbClear(store)           { return tx(store, 'readwrite', s => s.clear()); }

function idbGetAll(store) {
  return open().then(db => new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readonly');
    const s = t.objectStore(store);
    const results = [];
    const cursor = s.openCursor();
    cursor.onsuccess = e => {
      const c = e.target.result;
      if (c) { results.push({ key: c.key, value: c.value }); c.continue(); }
      else resolve(results);
    };
    cursor.onerror = e => reject(e.target.error);
  }));
}

// ── Supabase remote ───────────────────────────────────────────────────────────
async function getUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function remoteSet(store, key, value) {
  const user_id = await getUserId();
  if (!user_id) return;
  await supabase.from('entries').upsert({ user_id, store, key, value });
}

async function remoteDel(store, key) {
  const user_id = await getUserId();
  if (!user_id) return;
  await supabase.from('entries').delete()
    .eq('user_id', user_id).eq('store', store).eq('key', key);
}

async function syncFromSupabase() {
  const user_id = await getUserId();
  if (!user_id) return 0;
  const { data, error } = await supabase.from('entries')
    .select('store, key, value')
    .eq('user_id', user_id);
  if (error || !data) return 0;
  for (const row of data) {
    await idbSet(row.store, row.key, row.value);
  }
  return data.length;
}

// Initial cloud pull, kicked off at import time but exposed as a PROMISE so the
// app can wait for it before its first render. Critical for reinstalls / cleared
// browsers: iOS wipes a PWA's IndexedDB when its home-screen icon is removed, so
// a fresh launch starts empty — without awaiting this, the UI paints empty and
// looks like all history was lost even though the cloud copy is intact.
// Resolves to the number of rows restored (0 if no session / nothing to pull).
export const initialSync = supabase.auth.getSession()
  .then(({ data: { session } }) => (session ? syncFromSupabase() : 0))
  .catch(() => 0);

// ── Public API (same interface as before) ─────────────────────────────────────
const db = {
  get:    idbGet,
  getAll: idbGetAll,

  async set(store, key, value) {
    await idbSet(store, key, value);
    remoteSet(store, key, value);
  },

  async delete(store, key) {
    await idbDel(store, key);
    remoteDel(store, key);
  },

  clear: idbClear,
  sync:  syncFromSupabase,
};

export default db;
