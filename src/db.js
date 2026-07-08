// ---------- Storage: IndexedDB ----------
// Blobs are stored natively (no base64 bloat). Split into two stores so
// editing a caption/note never has to rewrite the (much larger) image data.

const DB_NAME = 'tuk-db';
const DB_VERSION = 1;
let dbPromise = null;

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs', { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
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

async function idbDelete(storeName, id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    tx.objectStore(storeName).delete(id);
    tx.oncomplete = () => resolve(true);
    tx.onerror = () => reject(tx.error);
  });
}

/** Persist only the editable/lightweight fields — the blob store is untouched. */
export async function persistMeta(shot) {
  try {
    await idbPut('meta', {
      id: shot.id,
      mime: shot.mime,
      width: shot.width,
      height: shot.height,
      sizeBytes: shot.sizeBytes,
      caption: shot.caption,
      notes: shot.notes,
      createdAt: shot.createdAt
    });
    return true;
  } catch (e) {
    return false;
  }
}

export async function persistShot(shot) {
  try {
    await idbPut('blobs', { id: shot.id, blob: shot.blob });
    await persistMeta(shot);
    return true;
  } catch (e) {
    return false;
  }
}

export async function deleteShotFromStorage(id) {
  try {
    await idbDelete('meta', id);
    await idbDelete('blobs', id);
  } catch (e) {
    /* ignore */
  }
}

/** Load every stored shot, joined and sorted newest-first, with a fresh object URL each. */
export async function loadAll() {
  const [metas, blobs] = await Promise.all([idbGetAll('meta'), idbGetAll('blobs')]);
  const blobById = new Map(blobs.map((b) => [b.id, b.blob]));
  const loaded = [];
  for (const m of metas) {
    const blob = blobById.get(m.id);
    if (!blob) continue;
    loaded.push({ ...m, blob, url: URL.createObjectURL(blob) });
  }
  loaded.sort((a, b) => b.createdAt - a.createdAt);
  return loaded;
}
