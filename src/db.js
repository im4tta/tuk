// ---------- Storage: IndexedDB ----------
// Blobs are stored natively (no base64 bloat). Split into two stores so
// editing a caption/note never has to rewrite the (much larger) image data.

const DB_NAME = 'tuk-db';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  // Some environments (older Safari private-browsing, locked-down webviews)
  // don't expose indexedDB at all — fail predictably instead of throwing a
  // ReferenceError deep inside the IDBRequest machinery.
  if (typeof indexedDB === 'undefined') {
    dbPromise = Promise.reject(new Error('IndexedDB is not available in this browser.'));
    return dbPromise;
  }
  dbPromise = new Promise((resolve, reject) => {
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      reject(e);
      return;
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open was blocked by another open tab.'));
  });
  return dbPromise;
}

async function idbPut(storeName, record) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).put(record);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const req = tx.objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Run several put/delete ops across multiple stores in ONE transaction, so a
 * shot's blob and its metadata are written or removed atomically. Without
 * this, a tab closing between two separate transactions could leave an
 * orphaned blob in IndexedDB forever (metadata gone, blob still taking up
 * space, never reachable again).
 * @param {Array<{store: string, op: 'put'|'delete', record?: object, id?: string}>} ops
 */
async function idbBatch(ops) {
  const db = await openDB();
  const storeNames = [...new Set(ops.map((o) => o.store))];
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    for (const op of ops) {
      const store = tx.objectStore(op.store);
      if (op.op === 'put') store.put(op.record);
      else store.delete(op.id);
    }
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

function metaRecord(shot) {
  return {
    id: shot.id,
    mime: shot.mime,
    width: shot.width,
    height: shot.height,
    sizeBytes: shot.sizeBytes,
    caption: shot.caption,
    notes: shot.notes,
    createdAt: shot.createdAt
  };
}

/** Persist only the editable/lightweight fields — the blob store is untouched. */
export async function persistMeta(shot) {
  try {
    await idbPut('meta', metaRecord(shot));
    return true;
  } catch {
    return false;
  }
}

export async function persistShot(shot) {
  try {
    await idbBatch([
      { store: 'blobs', op: 'put', record: { id: shot.id, blob: shot.blob } },
      { store: 'meta', op: 'put', record: metaRecord(shot) }
    ]);
    return true;
  } catch {
    return false;
  }
}

export async function deleteShotFromStorage(id) {
  try {
    await idbBatch([
      { store: 'meta', op: 'delete', id },
      { store: 'blobs', op: 'delete', id }
    ]);
  } catch {
    /* ignore */
  }
}

/** Load every stored shot, joined and sorted newest-first, with a fresh object URL each. */
export async function loadAll() {
  const [metas, blobs] = await Promise.all([idbGetAll('meta'), idbGetAll('blobs')]);
  const blobById = new Map(blobs.map((b) => [b.id, b.blob]));
  const metaIds = new Set(metas.map((m) => m.id));
  const loaded = [];
  const orphanOps = [];

  for (const m of metas) {
    const blob = blobById.get(m.id);
    if (!blob) { orphanOps.push({ store: 'meta', op: 'delete', id: m.id }); continue; }
    loaded.push({ ...m, blob, url: URL.createObjectURL(blob) });
  }
  for (const b of blobs) {
    if (!metaIds.has(b.id)) orphanOps.push({ store: 'blobs', op: 'delete', id: b.id });
  }
  // Best-effort cleanup of dangling records from any past interrupted write
  // (e.g. a tab closed mid-save before this file's atomic-transaction fix).
  // Never lets a cleanup failure block showing the person their shots.
  if (orphanOps.length > 0) idbBatch(orphanOps).catch(() => {});

  loaded.sort((a, b) => b.createdAt - a.createdAt);
  return loaded;
}
