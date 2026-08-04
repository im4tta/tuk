import './style.css';
import { fmtBytes, timeAgo, makeId, icons, filterShotsByQuery, sortShots } from './utils.js';
import { toast } from './toast.js';
import { persistShot, persistMeta, deleteShotFromStorage, loadAll } from './db.js';
import { captureScreen, copyBlobToClipboard, readImagesFromClipboard } from './capture.js';
import { exportShotsAsZip, downloadSingle } from './export.js';

// ---------- DOM references ----------
const grid = document.getElementById('grid');
const dropzone = document.getElementById('dropzone');
const countsEl = document.getElementById('counts');
const btnSelectAll = document.getElementById('btnSelectAll');
const btnExportZip = document.getElementById('btnExportZip');
const btnDelete = document.getElementById('btnDelete');
const btnCapture = document.getElementById('btnCapture');
const scaleSelect = document.getElementById('scaleSelect');
const btnPasteClipboard = document.getElementById('btnPasteClipboard');
const floatingPaste = document.getElementById('floatingPaste');
const toggleAutoCopy = document.getElementById('toggleAutoCopy');
const searchInput = document.getElementById('searchInput');
const sortSelect = document.getElementById('sortSelect');

// ---------- State ----------
/** @type {Array<{id:string,url:string,blob:Blob,mime:string,width:number,height:number,sizeBytes:number,caption:string,notes:string,createdAt:number}>} */
let shots = [];
const selected = new Set();
const saveTimers = {};
let searchTerm = '';
let lightboxIndex = -1;
let lightboxList = []; // snapshot of the visible (filtered/sorted) list the lightbox is paging through
let capturing = false;

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

async function addScreenshotFromBlob(blob, mime) {
  const { width, height, url } = await getImageSizeFromBlob(blob);
  if (!url) {
    toast('That image could not be read — it may be corrupt or an unsupported format.', 'err');
    return null;
  }
  const shot = {
    id: makeId(),
    url, blob,
    mime: mime || blob.type || 'image/png',
    width, height,
    sizeBytes: blob.size,
    caption: '',
    notes: '',
    createdAt: Date.now()
  };
  shots.unshift(shot);
  render();
  const ok = await persistShot(shot);
  if (!ok) toast('Saved for this session only — could not write to local storage.', 'warn');
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

async function deleteShots(ids) {
  const idSet = new Set(ids);
  shots.forEach((s) => { if (idSet.has(s.id) && s.url) URL.revokeObjectURL(s.url); });
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
  await Promise.all(ids.map((id) => deleteShotFromStorage(id)));
}

function toggleSelect(id) {
  if (selected.has(id)) selected.delete(id);
  else selected.add(id);
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
    thumbWrap.addEventListener('click', () => openLightbox(visible, i));

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox' + (selected.has(shot.id) ? ' checked' : '');
    checkbox.innerHTML = icons.check;
    checkbox.setAttribute('role', 'checkbox');
    checkbox.setAttribute('tabindex', '0');
    checkbox.setAttribute('aria-checked', String(selected.has(shot.id)));
    checkbox.setAttribute('aria-label', 'Select screenshot');
    onActivate(checkbox, (e) => { e.stopPropagation(); toggleSelect(shot.id); });

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
function openLightbox(list, index) {
  lightboxList = list;
  lightboxIndex = index;
  renderLightbox();
}
function closeLightbox() {
  const el = document.querySelector('.lightbox');
  if (el) el.remove();
  lightboxIndex = -1;
  lightboxList = [];
}
function renderLightbox() {
  const existing = document.querySelector('.lightbox');
  if (existing) existing.remove();
  if (lightboxIndex < 0 || lightboxIndex >= lightboxList.length) return;
  const shot = lightboxList[lightboxIndex];

  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeLightbox(); });

  const inner = document.createElement('div');
  inner.className = 'lightbox-inner';
  const img = document.createElement('img');
  img.src = shot.url;
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
  closeBtn.addEventListener('click', closeLightbox);
  overlay.appendChild(closeBtn);

  if (lightboxList.length > 1) {
    const prev = document.createElement('div');
    prev.className = 'lightbox-nav prev';
    prev.setAttribute('role', 'button');
    prev.setAttribute('tabindex', '0');
    prev.setAttribute('aria-label', 'Previous screenshot');
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    prev.addEventListener('click', (e) => { e.stopPropagation(); lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; renderLightbox(); });
    overlay.appendChild(prev);

    const next = document.createElement('div');
    next.className = 'lightbox-nav next';
    next.setAttribute('role', 'button');
    next.setAttribute('tabindex', '0');
    next.setAttribute('aria-label', 'Next screenshot');
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    next.addEventListener('click', (e) => { e.stopPropagation(); lightboxIndex = (lightboxIndex + 1) % lightboxList.length; renderLightbox(); });
    overlay.appendChild(next);
  }

  document.body.appendChild(overlay);
}

document.addEventListener('keydown', (e) => {
  if (lightboxIndex < 0) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + lightboxList.length) % lightboxList.length; renderLightbox(); }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % lightboxList.length; renderLightbox(); }
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

btnDelete.addEventListener('click', () => {
  if (selected.size === 0) return;
  deleteShots(Array.from(selected));
});

btnCapture.addEventListener('click', handleCapture);
btnPasteClipboard.addEventListener('click', handlePasteFromClipboardButton);
floatingPaste.addEventListener('click', handlePasteFromClipboardButton);
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
  if (!navigator.permissions || !navigator.permissions.query || !document.hasFocus()) return;
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

// ---------- Init ----------
loadSettings();
refreshClipboardHint();
loadAll()
  .then((loaded) => { shots = loaded; render(); })
  .catch(() => { toast('Could not open local storage — screenshots won\u2019t be saved between visits.', 'err'); render(); });
