import JSZip from 'jszip';
import { extFromMime, mimeFromExt, sanitize, fmtBytes } from './utils.js';

// Extensions Tuk itself can add as a screenshot — used to skip stray
// non-image files when importing an arbitrary ZIP.
const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'avif']);

/**
 * Bundle the given shots into a downloadable ZIP, including a
 * captions-and-notes.txt manifest.
 * @param {Array} items
 */
export async function exportShotsAsZip(items) {
  const zip = new JSZip();
  const notesLines = [];

  items.forEach((s, i) => {
    const ext = extFromMime(s.mime);
    const namePart = sanitize(s.caption) || 'screenshot';
    const filename = String(i + 1).padStart(3, '0') + '_' + namePart + '.' + ext;
    zip.file(filename, s.blob);
    notesLines.push(
      filename + '\n' +
      '  Caption: ' + (s.caption || '(none)') + '\n' +
      '  Notes: ' + (s.notes || '(none)') + '\n' +
      '  Size: ' + s.width + '\u00d7' + s.height + ', ' + fmtBytes(s.sizeBytes) + '\n'
    );
  });
  zip.file('captions-and-notes.txt', notesLines.join('\n'), { compression: 'DEFLATE' });

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'tuk-export-' + Date.now() + '.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadSingle(shot) {
  const a = document.createElement('a');
  a.href = shot.url;
  const ext = extFromMime(shot.mime);
  a.download = (sanitize(shot.caption) || 'screenshot') + '.' + ext;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/**
 * Parse a captions-and-notes.txt manifest (the format exportShotsAsZip
 * writes) into { filename: { caption, notes } }. Tolerant of manifests from
 * other tools/hand edits — a file with no manifest, or one that doesn't
 * match this shape, just yields an empty map rather than throwing.
 */
function parseManifest(text) {
  const map = {};
  let current = null;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (!line.trim()) continue;
    if (!line.startsWith(' ')) {
      current = line.trim();
      map[current] = { caption: '', notes: '' };
      continue;
    }
    if (!current) continue;
    const captionMatch = line.match(/^\s*Caption:\s?(.*)$/);
    const notesMatch = line.match(/^\s*Notes:\s?(.*)$/);
    if (captionMatch) map[current].caption = captionMatch[1] === '(none)' ? '' : captionMatch[1];
    if (notesMatch) map[current].notes = notesMatch[1] === '(none)' ? '' : notesMatch[1];
  }
  return map;
}

/**
 * Read a ZIP (typically one Tuk exported earlier) back into a plain list of
 * importable shots: { blob, mime, caption, notes }. Pure data in, data out —
 * the caller decides how to add each one (dedupe, persist, etc).
 * @param {Blob|File} file
 * @returns {Promise<Array<{blob: Blob, mime: string, caption: string, notes: string}>>}
 */
export async function readShotsFromZip(file) {
  const zip = await JSZip.loadAsync(file);
  const manifestFile = zip.file('captions-and-notes.txt');
  const manifestMap = manifestFile ? parseManifest(await manifestFile.async('string')) : {};

  const entries = Object.values(zip.files).filter((f) => {
    if (f.dir || f.name === 'captions-and-notes.txt') return false;
    const ext = f.name.split('.').pop().toLowerCase();
    return IMAGE_EXTENSIONS.has(ext);
  });

  const results = [];
  for (const entry of entries) {
    const buf = await entry.async('arraybuffer');
    const mime = mimeFromExt(entry.name);
    const meta = manifestMap[entry.name.split('/').pop()] || { caption: '', notes: '' };
    results.push({ blob: new Blob([buf], { type: mime }), mime, caption: meta.caption, notes: meta.notes });
  }
  return results;
}
