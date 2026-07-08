import JSZip from 'jszip';
import { extFromMime, sanitize, fmtBytes } from './utils.js';

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
  zip.file('captions-and-notes.txt', notesLines.join('\n'));

  const blob = await zip.generateAsync({ type: 'blob' });
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
