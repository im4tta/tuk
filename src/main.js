import './style.css';
import { fmtBytes, timeAgo, makeId, icons, filterShotsByQuery, sortShots } from './utils.js';
import { toast } from './toast.js';
import { persistShot, persistMeta, deleteShotFromStorage, loadAll } from './db.js';
import { captureScreen, copyBlobToClipboard, readImagesFromClipboard } from './capture.js';
import { exportShotsAsZip, downloadSingle, readShotsFromZip } from './export.js';

// ---------- DOM references ----------
const grid = document.getElementById('grid');
const dropzone = document.getElementById('dropzone');
const countsEl = document.getElementById('counts');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnExportZip = document.getElementById('btnExportZip');
const btnDelete = document.getElementById('btnDelete');
const btnCapture = document.getElementById('btnCapture');
const captureGroup = document.getElementById('captureGroup');
const scaleSelect = document.getElementById('scaleSelect');
const btnPasteClipboard = document.getElementById('btnPasteClipboard');
const btnAddPhoto = document.getElementById('btnAddPhoto');
const addPhotoInput = document.getElementById('addPhotoInput');
const floatingPaste = document.getElementById('floatingPaste');
const toggleAutoCopy = document.getElementById('toggleAutoCopy');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');
const btnBulkCaption = document.getElementById('btnBulkCaption');
const btnImportZip = document.getElementById('btnImportZip');
const importInput = document.getElementById('importInput');
const storageInfoEl = document.getElementById('storageInfo');

// ---------- State ----------
/** @type {Array<{id:string,url:string,blob:Blob,mime:string,width:number,height:number,sizeBytes:number,caption:string,notes:string,createdAt:number,hash:?string}>} */
let shots = [];
const selected = new Set();
const saveTimers = {};
let searchTerm = '';
let lightboxIndex = -1;
let lightboxList = []; // snapshot of the visible (filtered/sorted) list the lightbox is paging through
let capturing = false;
// Index (within the currently visible list) of the last shot whose checkbox
// was clicked, so a shift+click can select everything in between.
let lastClickedIndex = null;

// ---------- Undo delete ----------
// Deletes are staged for a grace period before they actually touch storage:
// the shot disappears from the grid immediately, but its blob/meta stay in
// IndexedDB until the timer fires, so "Undo" is a real restore rather than
// re-adding a re-encoded copy. If the tab is closed/hidden during the grace
// window the pending deletes are flushed immediately (see pagehide below),
// so a delete still "sticks" in the normal case of navigating away.
const UNDO_DELETE_MS = 6000;
const pendingDeletes = new Map(); // batchId -> { removed: Array<shot>, timer }

// ---------- Feature detection ----------
// getDisplayMedia (screen capture) and clipboard.read() (paste-from-button)
// both simply don't exist on phone browsers today. Rather than leave
// buttons that always fail sitting in the toolbar, hide them and lean on
// the file-picker input instead — every mobile browser can hand a photo
// (screenshot or otherwise) to a plain <input type="file"> and it opens
// straight into the OS photo picker, camera roll included.
const screenCaptureSupported = !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia);
const clipboardReadSupported = !!(navigator.clipboard && navigator.clipboard.read);

function applyFeatureAvailability() {
  captureGroup.classList.toggle('hidden', !screenCaptureSupported);
  toggleAutoCopy.closest('.switch-wrap').classList.toggle('hidden', !screenCaptureSupported);
  btnPasteClipboard.classList.toggle('hidden', !clipboardReadSupported);

  // The floating action button always does *something* useful: paste when
  // the platform supports reading the clipboard, otherwise it opens the
  // same file picker as "Add photo" so there's still a one-tap way in.
  if (!clipboardReadSupported) {
    floatingPaste.title = 'Add a photo';
    floatingPaste.setAttribute('aria-label', 'Add a photo');
  }

  const dropzoneP = dropzone.querySelector('p');
  if (dropzoneP) {
    if (screenCaptureSupported) {
      dropzoneP.innerHTML = 'Press <kbd>Ctrl</kbd>+<kbd>V</kbd> (or <kbd>\u2318</kbd>+<kbd>V</kbd> on Mac) anywhere on this page, drag image files in, or click <strong>Add photo</strong> / <strong>Capture screen</strong> above.';
    } else {
      dropzoneP.innerHTML = 'Tap <strong>Add photo</strong> above to pick screenshots from your camera roll or files.';
    }
  }
}

// ---------- Settings (small, safe for localStorage) ----------
function loadSettings() {
  try {
    const raw = localStorage.getItem('tuk-settings');
    const s = raw ? JSON.parse(raw) : {};
    toggleAutoCopy.checked = s.autoCopy !== false;
    scaleSelect.value = s.scale || '4';
    sortSelect.value = s.sort || 'new';
  } catch { /* defaults stand */ }
}
function saveSettings() {
  try {
    localStorage.setItem('tuk-settings', JSON.stringify({
      autoCopy: toggleAutoCopy.checked,
      scale: scaleSelect.value,
      sort: sortSelect.value
    }));
  } catch { /* non-fatal */ }
}

// ---------- Accessibility helper ----------
// Native <button> elements get Enter/Space activation for free; the compact
// icon controls here are `div`s (for tighter styling control), so wire that
// behavior up manually wherever we set role="button".
function onActivate(el, handler) {
  el.addEventListener('click', handler);
  el.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handler(e); }
  });
}

// ---------- Core actions ----------
function getImageSizeFromBlob(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight, url });
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0, url: null }); };
    img.src = url;
  });
}

/**
 * Content hash used purely for exact-duplicate detection — not a security
 * primitive, so any failure (e.g. crypto.subtle unavailable outside a
 * secure context) just disables the dedupe check rather than blocking adds.
 */
async function computeHash(blob) {
  if (!window.crypto || !window.crypto.subtle) return null;
  try {
    const buf = await blob.arrayBuffer();
    const digest = await window.crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

/** Briefly highlight and scroll to an existing card, e.g. to point out a duplicate. */
function flashCard(id) {
  const el = grid.querySelector('.card[data-id="' + id + '"]');
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}

async function addScreenshotFromBlob(blob, mime, opts) {
  opts = opts || {};
  const { width, height, url } = await getImageSizeFromBlob(blob);
  if (!url) {
    if (!opts.silent) toast('That image could not be read — it may be corrupt or an unsupported format.', 'err');
    return null;
  }

  const hash = await computeHash(blob);
  if (hash && !opts.allowDuplicate) {
    const dup = shots.find((s) => s.hash === hash);
    if (dup) {
      URL.revokeObjectURL(url);
      // opts.silent skips the flash/toast — used by bulk import, where
      // popping a toast per duplicate would bury the summary at the end.
      if (!opts.silent) {
        flashCard(dup.id);
        toast('Looks like you already have this one.', 'warn', {
          action: { label: 'Add anyway', onClick: () => addScreenshotFromBlob(blob, mime, { allowDuplicate: true }) }
        });
      }
      return null;
    }
  }

  const shot = {
    id: makeId(),
    url, blob,
    mime: mime || blob.type || 'image/png',
    width, height,
    sizeBytes: blob.size,
    hash,
    caption: '',
    notes: '',
    createdAt: Date.now()
  };
  shots.unshift(shot);
  render();
  const ok = await persistShot(shot);
  if (!ok) toast('Saved for this session only — could not write to local storage.', 'warn');
  refreshStorageEstimate();
  return shot;
}

async function addScreenshot(file) {
  return addScreenshotFromBlob(file, file.type);
}

function scheduleSave(shot) {
  clearTimeout(saveTimers[shot.id]);
  saveTimers[shot.id] = setTimeout(() => {
    delete saveTimers[shot.id];
    persistMeta(shot);
  }, 500);
}

function deleteShots(ids) {
  const idSet = new Set(ids);
  const removed = shots.filter((s) => idSet.has(s.id));
  if (removed.length === 0) return;

  shots = shots.filter((s) => !idSet.has(s.id));
  ids.forEach((id) => {
    selected.delete(id);
    clearTimeout(saveTimers[id]);
    delete saveTimers[id];
  });
  // If the lightbox was showing one of the deleted shots, close it rather
  // than silently pointing at a now-stale index.
  if (lightboxIndex >= 0 && idSet.has((lightboxList[lightboxIndex] || {}).id)) closeLightbox();
  render();

  const batchId = makeId();
  const timer = setTimeout(() => finalizeDelete(batchId), UNDO_DELETE_MS);
  pendingDeletes.set(batchId, { removed, timer });

  const label = removed.length === 1 ? 'Deleted 1 screenshot.' : 'Deleted ' + removed.length + ' screenshots.';
  toast(label, null, { duration: UNDO_DELETE_MS, action: { label: 'Undo', onClick: () => undoDelete(batchId) } });
}

function undoDelete(batchId) {
  const entry = pendingDeletes.get(batchId);
  if (!entry) return; // grace period already elapsed (or already undone)
  clearTimeout(entry.timer);
  pendingDeletes.delete(batchId);
  shots = shots.concat(entry.removed).sort((a, b) => b.createdAt - a.createdAt);
  render();
  toast(entry.removed.length === 1 ? 'Restored.' : 'Restored ' + entry.removed.length + ' screenshots.');
}

// ---------- Storage usage ----------
// navigator.storage.estimate() gives a browser-reported (not exact) picture
// of the origin's IndexedDB usage vs. the quota the browser is willing to
// grant it. Purely informational + an early warning — Tuk still works fine
// right up to the quota, this just helps someone notice before a save fails.
let storageWarned = false;
async function refreshStorageEstimate() {
  if (!storageInfoEl) return;
  if (!navigator.storage || !navigator.storage.estimate) { storageInfoEl.textContent = ''; return; }
  try {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    if (!quota) { storageInfoEl.textContent = ''; return; }
    const pct = usage / quota;
    storageInfoEl.textContent = fmtBytes(usage) + ' of ' + fmtBytes(quota) + ' used';
    storageInfoEl.classList.toggle('storage-warn', pct > 0.85);
    if (pct > 0.9 && !storageWarned) {
      storageWarned = true;
      toast('Local storage is almost full. Export and delete some shots to free up space.', 'warn');
    } else if (pct <= 0.9) {
      storageWarned = false;
    }
  } catch {
    storageInfoEl.textContent = '';
  }
}

async function finalizeDelete(batchId) {
  const entry = pendingDeletes.get(batchId);
  if (!entry) return;
  pendingDeletes.delete(batchId);
  entry.removed.forEach((s) => { if (s.url) URL.revokeObjectURL(s.url); });
  await Promise.all(entry.removed.map((s) => deleteShotFromStorage(s.id)));
  refreshStorageEstimate();
}

// Deletes still "in flight" when the tab is closed/hidden would otherwise
// never actually reach storage (nothing ever calls finalizeDelete), silently
// undoing every recent delete on next load. Flush them here as a best-effort
// commit — the visible grid already dropped these shots, so this just makes
// storage agree with what's on screen.
window.addEventListener('pagehide', () => {
  pendingDeletes.forEach((entry, batchId) => {
    clearTimeout(entry.timer);
    finalizeDelete(batchId);
  });
});

function toggleSelect(id, evt, index, visibleList) {
  if (evt && evt.shiftKey && lastClickedIndex !== null && visibleList) {
    const from = Math.min(lastClickedIndex, index);
    const to = Math.max(lastClickedIndex, index);
    for (let i = from; i <= to; i++) selected.add(visibleList[i].id);
  } else if (selected.has(id)) {
    selected.delete(id);
  } else {
    selected.add(id);
  }
  lastClickedIndex = index;
  render();
}

async function copyShotToClipboard(shot) {
  try {
    await copyBlobToClipboard(shot.blob);
    toast('Copied to clipboard — paste it anywhere with Ctrl/\u2318+V.');
  } catch (e) {
    toast('Copy failed: ' + e.message, 'err');
  }
}

// ---------- Screen capture ----------
async function handleCapture() {
  if (capturing) return;
  const scale = parseInt(scaleSelect.value, 10) || 1;
  capturing = true;
  const originalLabel = btnCapture.innerHTML;
  btnCapture.disabled = true;
  btnCapture.textContent = 'Choose a screen\u2026';

  try {
    const { blob, scale: effectiveScale } = await captureScreen(scale);
    const shot = await addScreenshotFromBlob(blob, 'image/png');
    if (shot) {
      const roundedScale = Math.round(effectiveScale * 10) / 10;
      const scaleNote = roundedScale < scale
        ? roundedScale + '\u00d7 res \u2014 clamped down from ' + scale + '\u00d7 for a display this large'
        : scale + '\u00d7 res';
      toast('Captured at ' + shot.width + '\u00d7' + shot.height + ' (' + scaleNote + ') and added to your stack.');
    }

    if (shot && toggleAutoCopy.checked) {
      try {
        await copyBlobToClipboard(blob);
        toast('Also copied to clipboard — paste it anywhere.');
      } catch { /* clipboard permission denied — capture itself still succeeded */ }
    }
  } catch (err) {
    if (err && err.name === 'NotAllowedError') toast('Screen capture cancelled.');
    else toast('Screen capture failed: ' + (err && err.message ? err.message : err), 'err');
  } finally {
    capturing = false;
    btnCapture.disabled = false;
    btnCapture.innerHTML = originalLabel;
  }
}

async function handlePasteFromClipboardButton() {
  try {
    const found = await readImagesFromClipboard();
    let added = 0;
    for (const { blob, mime } of found) {
      if (await addScreenshotFromBlob(blob, mime)) added += 1;
    }
    if (added > 0) toast(added + ' image' + (added > 1 ? 's' : '') + ' added from clipboard.');
    else if (found.length === 0) toast('No image found on the clipboard.', 'warn');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---------- Rendering ----------
function totalBytes() {
  return shots.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);
}

function visibleShots() {
  return sortShots(filterShotsByQuery(shots, searchTerm), sortSelect.value);
}

function updateToolbar(visible) {
  let label = shots.length + ' shot' + (shots.length !== 1 ? 's' : '');
  if (searchTerm) label += ' · ' + visible.length + ' match' + (visible.length !== 1 ? 'es' : '');
  if (shots.length) label += ' · ' + fmtBytes(totalBytes());
  if (selected.size) label += ' · ' + selected.size + ' selected';
  countsEl.textContent = label;
  btnExportZip.disabled = selected.size === 0;
  btnDelete.disabled = selected.size === 0;
  btnBulkCaption.disabled = selected.size === 0;
  // "Select all" acts on whatever's currently visible (respects an active
  // search), so its label reflects whether every *visible* shot is selected —
  // not the whole library, which could include shots the user can't even see.
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  btnSelectAll.textContent = allVisibleSelected ? 'Deselect all' : 'Select all';
}

function render() {
  const visible = visibleShots();
  updateToolbar(visible);
  dropzone.classList.toggle('hidden', shots.length > 0);
  grid.classList.toggle('hidden', shots.length === 0);
  grid.innerHTML = '';

  if (shots.length > 0 && visible.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'no-matches';
    empty.textContent = 'No shots match "' + searchTerm + '".';
    grid.appendChild(empty);
    return;
  }

  visible.forEach((shot, i) => {
    const card = document.createElement('div');
    card.className = 'card' + (selected.has(shot.id) ? ' selected' : '');
    card.dataset.id = shot.id;

    const thumbWrap = document.createElement('div');
    thumbWrap.className = 'thumb-wrap';
    const img = document.createElement('img');
    img.src = shot.url;
    img.loading = 'lazy';
    img.alt = shot.caption || 'Screenshot';
    thumbWrap.appendChild(img);
    thumbWrap.setAttribute('role', 'button');
    thumbWrap.setAttribute('tabindex', '0');
    thumbWrap.setAttribute('aria-label', 'View screenshot fullsize' + (shot.caption ? ': ' + shot.caption : ''));
    onActivate(thumbWrap, (e) => { if (e.target === thumbWrap || e.target === img) openLightbox(visible, i, thumbWrap); });

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox' + (selected.has(shot.id) ? ' checked' : '');
    checkbox.innerHTML = icons.check;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('tabindex', '0');
    checkbox.setAttribute('aria-checked', String(selected.has(shot.id)));
    checkbox.setAttribute('aria-label', 'Select screenshot');
    checkbox.title = 'Shift+click to select a range';
    onActivate(checkbox, (e) => { e.stopPropagation(); toggleSelect(shot.id, e, i, visible); });

    const iconRow = document.createElement('div');
    iconRow.className = 'icon-btn-row';

    const dlBtn = document.createElement('div');
    dlBtn.className = 'icon-btn';
    dlBtn.innerHTML = icons.download;
    dlBtn.title = 'Download PNG';
    dlBtn.setAttribute('role', 'button');
    dlBtn.setAttribute('tabindex', '0');
    dlBtn.setAttribute('aria-label', 'Download PNG');
    onActivate(dlBtn, (e) => { e.stopPropagation(); downloadSingle(shot); });

    const copyBtn = document.createElement('div');
    copyBtn.className = 'icon-btn';
    copyBtn.innerHTML = icons.copy;
    copyBtn.title = 'Copy to clipboard';
    copyBtn.setAttribute('role', 'button');
    copyBtn.setAttribute('tabindex', '0');
    copyBtn.setAttribute('aria-label', 'Copy to clipboard');
    onActivate(copyBtn, (e) => { e.stopPropagation(); copyShotToClipboard(shot); });

    const delBtn = document.createElement('div');
    delBtn.className = 'icon-btn';
    delBtn.innerHTML = icons.trash;
    delBtn.title = 'Delete';
    delBtn.setAttribute('role', 'button');
    delBtn.setAttribute('tabindex', '0');
    delBtn.setAttribute('aria-label', 'Delete screenshot');
    onActivate(delBtn, (e) => { e.stopPropagation(); deleteShots([shot.id]); });

    iconRow.appendChild(dlBtn);
    iconRow.appendChild(copyBtn);
    iconRow.appendChild(delBtn);

    thumbWrap.appendChild(checkbox);
    thumbWrap.appendChild(iconRow);

    const body = document.createElement('div');
    body.className = 'card-body';

    const captionInput = document.createElement('input');
    captionInput.className = 'caption-input';
    captionInput.type = 'text';
    captionInput.placeholder = 'Add a caption\u2026';
    captionInput.value = shot.caption;
    captionInput.addEventListener('input', () => { shot.caption = captionInput.value; scheduleSave(shot); });

    const notesInput = document.createElement('textarea');
    notesInput.className = 'notes-input';
    notesInput.placeholder = 'Notes\u2026';
    notesInput.rows = 2;
    notesInput.value = shot.notes;
    notesInput.addEventListener('input', () => { shot.notes = notesInput.value; scheduleSave(shot); });

    const metaRow = document.createElement('div');
    metaRow.className = 'meta-row';
    metaRow.innerHTML = '<span>' + shot.width + '\u00d7' + shot.height + ' · ' + fmtBytes(shot.sizeBytes) + '</span><span>' + timeAgo(shot.createdAt) + '</span>';

    body.appendChild(captionInput);
    body.appendChild(notesInput);
    body.appendChild(metaRow);

    card.appendChild(thumbWrap);
    card.appendChild(body);
    grid.appendChild(card);
  });
}

// ---------- Lightbox ----------
// Focus handling follows the standard dialog pattern: remember whatever had
// focus before opening (usually the thumbnail that was clicked/activated),
// move focus inside the dialog while it's open, trap Tab/Shift+Tab so focus
// can't silently leak to the (still-present) grid behind it, and restore
// focus to the trigger on close so keyboard/screen-reader users land back
// where they started instead of at the top of the page.
let lightboxTriggerEl = null;

function getLightboxFocusables(overlay) {
  // Every control the lightbox renders is always visible when present (no
  // hidden buttons to filter out), so no offsetParent-based visibility
  // check is needed — and it would misfire anyway, since offsetParent is
  // null for position:fixed elements (which these all are) in most browsers.
  return Array.from(overlay.querySelectorAll('[role="button"][tabindex], button, [href], input, select, textarea'));
}

function openLightbox(list, index, triggerEl) {
  lightboxTriggerEl = triggerEl || document.activeElement || null;
  lightboxList = list;
  lightboxIndex = index;
  renderLightbox('init');
}
function closeLightbox() {
  const el = document.querySelector('.lightbox');
  if (el) el.remove();
  lightboxIndex = -1;
  lightboxList = [];
  document.body.classList.remove('lightbox-open');
  // Restore focus to whatever opened the lightbox — but only if it's still
  // attached to the page (a re-render or delete could have replaced it).
  if (lightboxTriggerEl && document.contains(lightboxTriggerEl)) lightboxTriggerEl.focus();
  lightboxTriggerEl = null;
}
// focusTarget: 'init' (dialog open — focus the close button), 'prev'/'next'
// (keyboard/click navigation — keep focus on the equivalent nav button
// across the re-render, since renderLightbox rebuilds the DOM each time).
function renderLightbox(focusTarget) {
  const existing = document.querySelector('.lightbox');
  if (existing) existing.remove();
  if (lightboxIndex < 0 || lightboxIndex >= lightboxList.length) return;
  const shot = lightboxList[lightboxIndex];

  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Screenshot viewer' + (shot.caption ? ': ' + shot.caption : ''));
  overlay.tabIndex = -1;
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });

  const inner = document.createElement('div');
  inner.className = 'lightbox-inner';
  const img = document.createElement('img');
  img.src = shot.url;
  img.alt = shot.caption || 'Screenshot';
  inner.appendChild(img);
  const cap = document.createElement('div');
  cap.className = 'lightbox-caption';
  cap.textContent = (shot.caption ? shot.caption + ' — ' : '') + shot.width + '\u00d7' + shot.height + ' · ' + fmtBytes(shot.sizeBytes);
  inner.appendChild(cap);
  overlay.appendChild(inner);

  const closeBtn = document.createElement('div');
  closeBtn.className = 'lightbox-close';
  closeBtn.setAttribute('role', 'button');
  closeBtn.setAttribute('tabindex', '0');
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  onActivate(closeBtn, closeLightbox);
  overlay.appendChild(closeBtn);

  let prev = null, next = null;
  if (lightboxList.length > 1) {
    prev = document.createElement('div');
    prev.className = 'lightbox-nav prev';
    prev.setAttribute('role', 'button');
    prev.setAttribute('tabindex', '0');
    prev.setAttribute('aria-label', 'Previous screenshot');
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    onActivate(prev, (e) => { e.stopPropagation(); lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; renderLightbox('prev'); });
    overlay.appendChild(prev);

    next = document.createElement('div');
    next.className = 'lightbox-nav next';
    next.setAttribute('role', 'button');
    next.setAttribute('tabindex', '0');
    next.setAttribute('aria-label', 'Next screenshot');
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    onActivate(next, (e) => { e.stopPropagation(); lightboxIndex = (lightboxIndex + 1) % lightboxList.length; renderLightbox('next'); });
    overlay.appendChild(next);
  }

  // Swipe left/right to navigate — the side arrows are a reach on a phone,
  // and this is the gesture people already expect from a photo viewer.
  let touchStartX = null, touchStartY = null;
  overlay.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });
  overlay.addEventListener('touchend', (e) => {
    if (touchStartX === null || lightboxList.length < 2) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    const dy = e.changedTouches[0].clientY - touchStartY;
    touchStartX = null;
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy) * 1.5) return; // mostly-vertical or too short: not a swipe
    if (dx > 0) { lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; renderLightbox('prev'); }
    else { lightboxIndex = (lightboxIndex + 1) % lightboxList.length; renderLightbox('next'); }
  });

  document.body.appendChild(overlay);
  document.body.classList.add('lightbox-open'); // background scroll lock (see CSS)

  const toFocus = (focusTarget === 'prev' && prev) || (focusTarget === 'next' && next) || closeBtn;
  toFocus.focus();
}

document.addEventListener('keydown', (e) => {
  if (lightboxIndex < 0) return;
  if (e.key === 'Escape') { closeLightbox(); return; }
  if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; renderLightbox('prev'); return; }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxList.length; renderLightbox('next'); return; }
  if (e.key === 'Tab') {
    const overlay = document.querySelector('.lightbox');
    if (!overlay) return;
    const focusables = getLightboxFocusables(overlay);
    if (focusables.length === 0) { e.preventDefault(); return; }
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    else if (!overlay.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
  }
});

// ---------- Paste & Drag/Drop ----------
document.addEventListener('paste', async (e) => {
  const items = e.clipboardData && e.clipboardData.items;
  if (!items) return;
  let handledImage = false;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      handledImage = true;
      const file = item.getAsFile();
      if (file) {
        try {
          const shot = await addScreenshot(file);
          if (shot) toast('Screenshot added.');
        } catch { toast('Could not read pasted image.', 'err'); }
      }
    }
  }
  if (handledImage) e.preventDefault();
});

['dragover', 'dragenter'].forEach((evt) => {
  document.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add('drag-over'); });
});
['dragleave', 'drop'].forEach((evt) => {
  document.addEventListener(evt, (e) => { if (evt === 'drop') e.preventDefault(); dropzone.classList.remove('drag-over'); });
});
document.addEventListener('drop', async (e) => {
  e.preventDefault();
  const files = Array.from(e.dataTransfer.files || []).filter((f) => f.type.startsWith('image/'));
  if (files.length === 0) return;
  let added = 0;
  for (const file of files) {
    try { if (await addScreenshot(file)) added += 1; } catch { /* skip */ }
  }
  if (added > 0) toast(added + ' image' + (added > 1 ? 's' : '') + ' added.');
});

// ---------- Toolbar events ----------
btnSelectAll.addEventListener('click', () => {
  const visible = visibleShots();
  const allVisibleSelected = visible.length > 0 && visible.every((s) => selected.has(s.id));
  if (allVisibleSelected) visible.forEach((s) => selected.delete(s.id));
  else visible.forEach((s) => selected.add(s.id));
  render();
});

btnExportZip.addEventListener('click', async () => {
  const items = shots.filter((s) => selected.has(s.id));
  if (items.length === 0) return;
  btnExportZip.disabled = true;
  const originalLabel = btnExportZip.innerHTML;
  btnExportZip.textContent = 'Zipping\u2026';
  try {
    await exportShotsAsZip(items);
    toast('Exported ' + items.length + ' screenshot' + (items.length > 1 ? 's' : '') + ' as ZIP.');
  } catch (e) {
    toast('Export failed: ' + e.message, 'err');
  } finally {
    btnExportZip.innerHTML = originalLabel;
    updateToolbar(visibleShots());
  }
});

async function importZip(file) {
  let items;
  try {
    items = await readShotsFromZip(file);
  } catch (e) {
    toast('Import failed: ' + e.message, 'err');
    return;
  }
  if (items.length === 0) {
    toast('No images found in that ZIP.', 'warn');
    return;
  }

  let added = 0;
  for (const item of items) {
    // silent: true — duplicates/unreadable entries are common on a re-import
    // and get folded into one summary toast below instead of one each.
    const shot = await addScreenshotFromBlob(item.blob, item.mime, { silent: true });
    if (shot) {
      if (item.caption || item.notes) {
        shot.caption = item.caption;
        shot.notes = item.notes;
        await persistMeta(shot);
      }
      added += 1;
    }
  }
  render();

  const skipped = items.length - added;
  if (added === 0) {
    toast('Nothing new to import — every image was already in your library.', 'warn');
  } else {
    let msg = 'Imported ' + added + ' screenshot' + (added > 1 ? 's' : '') + '.';
    if (skipped > 0) msg += ' (' + skipped + ' skipped — already had ' + (skipped > 1 ? 'them' : 'it') + ', or unreadable.)';
    toast(msg);
  }
}

btnImportZip.addEventListener('click', () => importInput.click());
importInput.addEventListener('change', async () => {
  const files = Array.from(importInput.files || []);
  importInput.value = ''; // allow re-selecting the same file on a later import
  for (const file of files) await importZip(file);
});

btnDelete.addEventListener('click', () => {
  if (selected.size === 0) return;
  deleteShots(Array.from(selected));
});

btnBulkCaption.addEventListener('click', () => {
  if (selected.size === 0) return;
  const count = selected.size;
  const value = window.prompt('Set caption for ' + count + ' selected screenshot' + (count > 1 ? 's' : '') + ':', '');
  if (value === null) return; // cancelled
  shots.forEach((s) => {
    if (selected.has(s.id)) {
      s.caption = value;
      persistMeta(s);
    }
  });
  render();
  toast('Caption set for ' + count + ' screenshot' + (count > 1 ? 's' : '') + '.');
});

async function handleAddPhotoFiles(fileList) {
  const files = Array.from(fileList || []).filter((f) => f.type.startsWith('image/'));
  if (files.length === 0) return;
  let added = 0;
  for (const file of files) {
    try { if (await addScreenshot(file)) added += 1; } catch { /* skip unreadable file */ }
  }
  if (added > 0) toast(added + ' image' + (added > 1 ? 's' : '') + ' added.');
}

btnAddPhoto.addEventListener('click', () => addPhotoInput.click());
addPhotoInput.addEventListener('change', async () => {
  await handleAddPhotoFiles(addPhotoInput.files);
  addPhotoInput.value = ''; // allow re-picking the same file(s) later
});

btnCapture.addEventListener('click', handleCapture);
btnPasteClipboard.addEventListener('click', handlePasteFromClipboardButton);
floatingPaste.addEventListener('click', () => {
  if (clipboardReadSupported) handlePasteFromClipboardButton();
  else addPhotoInput.click();
});
toggleAutoCopy.addEventListener('change', saveSettings);
scaleSelect.addEventListener('change', saveSettings);
sortSelect.addEventListener('change', () => { saveSettings(); render(); });

// ---------- Floating-paste "clipboard has an image" hint ----------
// style.css already defines a `.has-image` pulse animation on the floating
// paste button, but nothing ever applied the class — the hint was dead.
// This wires it up WITHOUT ever prompting for clipboard permission itself:
// it only checks (and reads) the clipboard when 'clipboard-read' access was
// already granted some other way (e.g. the person already used "Paste from
// clipboard" once), so it can never surprise anyone with a permission popup.
async function refreshClipboardHint() {
  if (!clipboardReadSupported || !navigator.permissions || !navigator.permissions.query || !document.hasFocus()) return;
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' });
    if (status.state !== 'granted') { floatingPaste.classList.remove('has-image'); return; }
    const found = await readImagesFromClipboard();
    floatingPaste.classList.toggle('has-image', found.length > 0);
  } catch {
    // Permission name unsupported (e.g. Firefox) or read rejected — just
    // leave the hint off; this is a background nicety, not core function.
  }
}
window.addEventListener('focus', refreshClipboardHint);
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshClipboardHint(); });

let searchDebounce;
searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => { searchTerm = searchInput.value.trim(); render(); }, 120);
});

// Ctrl/⌘+Shift+S triggers a screen capture from anywhere on the page.
document.addEventListener('keydown', (e) => {
  if (e.shiftKey && (e.ctrlKey || e.metaKey) && (e.key === 'S' || e.key === 's')) {
    e.preventDefault();
    handleCapture();
  }
});

// Selection shortcuts — Delete/Backspace to remove the selection, Escape to
// clear it, Ctrl/⌘+A to select everything visible. Skipped while typing in
// an input/textarea (so normal text editing keeps working) and while the
// lightbox is open (it has its own Escape/Arrow handling above).
document.addEventListener('keydown', (e) => {
  if (lightboxIndex >= 0) return;
  const tag = document.activeElement && document.activeElement.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;

  if ((e.key === 'Delete' || e.key === 'Backspace') && selected.size > 0) {
    e.preventDefault();
    deleteShots(Array.from(selected));
    return;
  }
  if (e.key === 'Escape' && selected.size > 0) {
    selected.clear();
    render();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
    e.preventDefault();
    visibleShots().forEach((s) => selected.add(s.id));
    render();
  }
});

// ---------- Share-target pickup ----------
// Companion to sw.js's handleShareTarget: when the OS share sheet hands
// Tuk an image, the SW redirects here with ?shared=1 after stashing the
// file(s) in a dedicated cache (it can't reach IndexedDB itself, and
// caches are the one storage API available to both a service worker and
// this page). Pull them out, add them the normal way, and clean up.
const SHARE_CACHE = 'tuk-share-target-v1';
const SHARE_MANIFEST_KEY = '/__share-manifest__';

async function pickUpSharedImages() {
  if (!('URLSearchParams' in window) || new URLSearchParams(location.search).get('shared') !== '1') return;
  // Strip the query param immediately so a refresh doesn't re-trigger this.
  history.replaceState(null, '', location.pathname);
  if (!('caches' in window)) return;

  try {
    const cache = await caches.open(SHARE_CACHE);
    const manifestRes = await cache.match(SHARE_MANIFEST_KEY);
    if (!manifestRes) return;
    const keys = await manifestRes.json();

    let added = 0;
    for (const key of keys) {
      const res = await cache.match(key);
      if (!res) continue;
      const blob = await res.blob();
      if (await addScreenshotFromBlob(blob, blob.type)) added += 1;
      await cache.delete(key);
    }
    await cache.delete(SHARE_MANIFEST_KEY);
    if (added > 0) toast(added + ' image' + (added > 1 ? 's' : '') + ' added from share.');
  } catch {
    // Best-effort — a lost share just means nothing new showed up.
  }
}

// ---------- Init ----------
loadSettings();
applyFeatureAvailability();
refreshClipboardHint();
refreshStorageEstimate();
loadAll()
  .then((loaded) => { shots = loaded; render(); return pickUpSharedImages(); })
  .catch(() => { toast('Could not open local storage — screenshots won\u2019t be saved between visits.', 'err'); render(); });

// PWA install/offline support. Skipped in dev so Vite's own dev-server
// caching/HMR isn't fighting a service worker for the same requests.
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* offline support just won't be available */ });
  });
}
