// ---------- Pure formatting helpers ----------

export function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / (1024 * 1024)).toFixed(1) + ' MB';
}

export function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

export function extFromMime(mime) {
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  if (mime === 'image/gif') return 'gif';
  if (mime === 'image/bmp') return 'bmp';
  if (mime === 'image/avif') return 'avif';
  if (mime === 'image/svg+xml') return 'svg';
  return 'png';
}

/** Inverse of extFromMime, keyed off a filename — used when importing a ZIP. */
export function mimeFromExt(filename) {
  const ext = String(filename).split('.').pop().toLowerCase();
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  if (ext === 'bmp') return 'image/bmp';
  if (ext === 'avif') return 'image/avif';
  if (ext === 'svg') return 'image/svg+xml';
  return 'image/png';
}

// Characters that are illegal (or awkward) in filenames on Windows/macOS/Linux.
// eslint-disable-next-line no-control-regex
const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|\x00-\x1F]/g;

/**
 * Turn a caption into a safe filename fragment. Keeps letters/numbers from
 * ANY script (Khmer, Latin, etc.) rather than only a-z0-9 — a plain regex
 * whitelist like /[^a-z0-9]/ silently reduces any Khmer caption to an empty
 * string, which is exactly the kind of caption this app is likely to see.
 */
export function sanitize(str) {
  return (str || '')
    .trim()
    .replace(ILLEGAL_FILENAME_CHARS, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/(^[-.]+|[-.]+$)/g, '') // also trim trailing dots — reserved on Windows
    .slice(0, 60);
}

export function makeId() {
  return 'shot_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
}

/**
 * Case-insensitive caption/notes search. Pulled out as a pure function (no
 * DOM) so the filtering logic can be unit tested directly.
 */
export function filterShotsByQuery(shots, query) {
  if (!query) return shots;
  const q = query.toLowerCase();
  return shots.filter((s) => (s.caption || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q));
}

/**
 * Same sort options the toolbar's `#sortSelect` offers. Pure + pulled out
 * for the same reason as filterShotsByQuery: testable without a DOM.
 * @param {Array} shots
 * @param {'new'|'old'|'largest'|'name'} sortBy
 */
export function sortShots(shots, sortBy) {
  const copy = shots.slice();
  if (sortBy === 'old') copy.sort((a, b) => a.createdAt - b.createdAt);
  else if (sortBy === 'largest') copy.sort((a, b) => b.sizeBytes - a.sizeBytes);
  else if (sortBy === 'name') copy.sort((a, b) => (a.caption || '').localeCompare(b.caption || ''));
  else copy.sort((a, b) => b.createdAt - a.createdAt); // 'new' (default)
  return copy;
}

// ---------- Inline icon SVGs ----------

export const icons = {
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>'
};
