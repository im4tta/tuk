import './style.css';
import { fmtBytes, timeAgo, makeId, icons } from './utils.js';
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
let selected = new Set();
let saveTimers = {};
let searchTerm = '';
let lightboxIndex = -1;
let capturing = false;

// ---------- Settings (small, safe for localStorage) ----------
function loadSettings() {
  try {
    const raw = localStorage.getItem('tuk-settings');
    const s = raw ? JSON.parse(raw) : {};
    toggleAutoCopy.checked = s.autoCopy !== false;
    scaleSelect.value = s.scale || '4';
    sortSelect.value = s.sort || 'new';
  } catch (e) { /* defaults stand */ }
}
function saveSettings() {
  try {
    localStorage.setItem('tuk-settings', JSON.stringify({
      autoCopy: toggleAutoCopy.checked,
      scale: scaleSelect.value,
      sort: sortSelect.value
    }));
  } catch (e) { /* non-fatal */ }
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
  saveTimers[shot.id] = setTimeout(() => persistMeta(shot), 500);
}

async function deleteShots(ids) {
  const idSet = new Set(ids);
  shots.forEach((s) => { if (idSet.has(s.id) && s.url) URL.revokeObjectURL(s.url); });
  shots = shots.filter((s) => !idSet.has(s.id));
  ids.forEach((id) => selected.delete(id));
  render();
  for (const id of ids) await deleteShotFromStorage(id);
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
    const { blob, width, height } = await captureScreen(scale);
    const shot = await addScreenshotFromBlob(blob, 'image/png');
    toast('Captured at ' + shot.width + '\u00d7' + shot.height + ' (' + scale + '\u00d7 res) and added to your stack.');

    if (toggleAutoCopy.checked) {
      try {
        await copyBlobToClipboard(blob);
        toast('Also copied to clipboard — paste it anywhere.');
      } catch (e) { /* clipboard permission denied — capture itself still succeeded */ }
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
    for (const { blob, mime } of found) await addScreenshotFromBlob(blob, mime);
    if (found.length > 0) toast(found.length + ' image' + (found.length > 1 ? 's' : '') + ' added from clipboard.');
    else toast('No image found on the clipboard.', 'warn');
  } catch (e) {
    toast(e.message, 'err');
  }
}

// ---------- Rendering ----------
function totalBytes() {
  return shots.reduce((sum, s) => sum + (s.sizeBytes || 0), 0);
}

function visibleShots() {
  let list = shots;
  if (searchTerm) {
    const q = searchTerm.toLowerCase();
    list = list.filter((s) => (s.caption || '').toLowerCase().includes(q) || (s.notes || '').toLowerCase().includes(q));
  }
  const sortBy = sortSelect.value;
  list = list.slice();
  if (sortBy === 'old') list.sort((a, b) => a.createdAt - b.createdAt);
  else if (sortBy === 'largest') list.sort((a, b) => b.sizeBytes - a.sizeBytes);
  else if (sortBy === 'name') list.sort((a, b) => (a.caption || '').localeCompare(b.caption || ''));
  else list.sort((a, b) => b.createdAt - a.createdAt);
  return list;
}

function updateToolbar() {
  const visible = visibleShots();
  let label = shots.length + ' shot' + (shots.length !== 1 ? 's' : '');
  if (searchTerm) label += ' · ' + visible.length + ' match' + (visible.length !== 1 ? 'es' : '');
  if (shots.length) label += ' · ' + fmtBytes(totalBytes());
  if (selected.size) label += ' · ' + selected.size + ' selected';
  countsEl.textContent = label;
  btnExportZip.disabled = selected.size === 0;
  btnDelete.disabled = selected.size === 0;
  btnSelectAll.textContent = (selected.size === shots.length && shots.length > 0) ? 'Deselect all' : 'Select all';
}

function render() {
  updateToolbar();
  const visible = visibleShots();
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

  visible.forEach((shot) => {
    const index = shots.indexOf(shot);
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
    thumbWrap.addEventListener('click', () => openLightbox(index));

    const checkbox = document.createElement('div');
    checkbox.className = 'checkbox' + (selected.has(shot.id) ? ' checked' : '');
    checkbox.innerHTML = icons.check;
    checkbox.addEventListener('click', (e) => { e.stopPropagation(); toggleSelect(shot.id); });

    const iconRow = document.createElement('div');
    iconRow.className = 'icon-btn-row';

    const dlBtn = document.createElement('div');
    dlBtn.className = 'icon-btn';
    dlBtn.innerHTML = icons.download;
    dlBtn.title = 'Download PNG';
    dlBtn.addEventListener('click', (e) => { e.stopPropagation(); downloadSingle(shot); });

    const copyBtn = document.createElement('div');
    copyBtn.className = 'icon-btn';
    copyBtn.innerHTML = icons.copy;
    copyBtn.title = 'Copy to clipboard';
    copyBtn.addEventListener('click', (e) => { e.stopPropagation(); copyShotToClipboard(shot); });

    const delBtn = document.createElement('div');
    delBtn.className = 'icon-btn';
    delBtn.innerHTML = icons.trash;
    delBtn.title = 'Delete';
    delBtn.addEventListener('click', (e) => { e.stopPropagation(); deleteShots([shot.id]); });

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
function openLightbox(index) {
  lightboxIndex = index;
  renderLightbox();
}
function closeLightbox() {
  const el = document.querySelector('.lightbox');
  if (el) el.remove();
  lightboxIndex = -1;
}
function renderLightbox() {
  const existing = document.querySelector('.lightbox');
  if (existing) existing.remove();
  if (lightboxIndex < 0 || lightboxIndex >= shots.length) return;
  const shot = shots[lightboxIndex];

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
  closeBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>';
  closeBtn.addEventListener('click', closeLightbox);
  overlay.appendChild(closeBtn);

  if (shots.length > 1) {
    const prev = document.createElement('div');
    prev.className = 'lightbox-nav prev';
    prev.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>';
    prev.addEventListener('click', (e) => { e.stopPropagation(); lightboxIndex = (lightboxIndex - 1 + shots.length) % shots.length; renderLightbox(); });
    overlay.appendChild(prev);

    const next = document.createElement('div');
    next.className = 'lightbox-nav next';
    next.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';
    next.addEventListener('click', (e) => { e.stopPropagation(); lightboxIndex = (lightboxIndex + 1) % shots.length; renderLightbox(); });
    overlay.appendChild(next);
  }

  document.body.appendChild(overlay);
}

document.addEventListener('keydown', (e) => {
  if (lightboxIndex < 0) return;
  if (e.key === 'Escape') closeLightbox();
  if (e.key === 'ArrowLeft') { lightboxIndex = (lightboxIndex - 1 + shots.length) % shots.length; renderLightbox(); }
  if (e.key === 'ArrowRight') { lightboxIndex = (lightboxIndex + 1) % shots.length; renderLightbox(); }
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
        try { await addScreenshot(file); toast('Screenshot added.'); }
        catch (err) { toast('Could not read pasted image.', 'err'); }
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
  for (const file of files) {
    try { await addScreenshot(file); } catch (err) { /* skip */ }
  }
  toast(files.length + ' image' + (files.length > 1 ? 's' : '') + ' added.');
});

// ---------- Toolbar events ----------
btnSelectAll.addEventListener('click', () => {
  if (selected.size === shots.length && shots.length > 0) selected.clear();
  else selected = new Set(shots.map((s) => s.id));
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
    updateToolbar();
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
loadAll()
  .then((loaded) => { shots = loaded; render(); })
  .catch(() => { toast('Could not open local storage — screenshots won\u2019t be saved between visits.', 'err'); render(); });
