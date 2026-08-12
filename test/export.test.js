// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { exportShotsAsZip, downloadSingle, readShotsFromZip } from '../src/export.js';

function makeShot(overrides = {}) {
  return {
    id: 'shot_1',
    blob: new Blob(['fake-png-bytes'], { type: 'image/png' }),
    mime: 'image/png',
    caption: 'Test shot',
    notes: 'Some notes',
    width: 800,
    height: 600,
    sizeBytes: 14,
    createdAt: Date.now(),
    ...overrides
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('exportShotsAsZip', () => {
  it('bundles each shot under a numbered, sanitized filename and includes a manifest', async () => {
    // jsdom doesn't implement anchor.click() navigation or URL.createObjectURL;
    // stub just enough so the download side effect doesn't throw.
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const shots = [
      makeShot({ id: 'a', caption: 'First one', mime: 'image/png' }),
      makeShot({ id: 'b', caption: 'Second one', mime: 'image/jpeg' })
    ];

    await exportShotsAsZip(shots);

    expect(clickSpy).toHaveBeenCalledTimes(1);
    const generatedBlob = URL.createObjectURL.mock.calls[0][0];
    const zip = await JSZip.loadAsync(generatedBlob);

    expect(Object.keys(zip.files).sort()).toEqual([
      '001_First-one.png',
      '002_Second-one.jpg',
      'captions-and-notes.txt'
    ]);

    const manifest = await zip.file('captions-and-notes.txt').async('string');
    expect(manifest).toContain('001_First-one.png');
    expect(manifest).toContain('Caption: First one');
    expect(manifest).toContain('002_Second-one.jpg');
  });

  it('falls back to "screenshot" as the filename base when there is no caption', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:fake-url');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const shots = [makeShot({ id: 'a', caption: '' })];
    await exportShotsAsZip(shots);

    const generatedBlob = URL.createObjectURL.mock.calls[0][0];
    const zip = await JSZip.loadAsync(generatedBlob);
    expect(Object.keys(zip.files)).toContain('001_screenshot.png');
  });
});

describe('downloadSingle', () => {
  it('sets the anchor download name from the sanitized caption and extension', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    let capturedAnchor = null;
    const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((el) => {
      if (el instanceof HTMLAnchorElement) capturedAnchor = el;
      return el;
    });

    const shot = makeShot({ url: 'blob:fake-url', caption: 'My Caption', mime: 'image/webp' });
    downloadSingle(shot);

    expect(capturedAnchor).not.toBeNull();
    expect(capturedAnchor.download).toBe('My-Caption.webp');
    expect(capturedAnchor.href).toBe('blob:fake-url');
    appendSpy.mockRestore();
  });
});

describe('readShotsFromZip', () => {
  it('round-trips a ZIP built with the same manifest format exportShotsAsZip writes', async () => {
    const zip = new JSZip();
    zip.file('001_First-one.png', new Blob(['png-bytes'], { type: 'image/png' }));
    zip.file('002_Second-one.jpg', new Blob(['jpg-bytes'], { type: 'image/jpeg' }));
    zip.file(
      'captions-and-notes.txt',
      '001_First-one.png\n' +
      '  Caption: First one\n' +
      '  Notes: (none)\n' +
      '  Size: 800\u00d7600, 14 B\n' +
      '\n' +
      '002_Second-one.jpg\n' +
      '  Caption: Second one\n' +
      '  Notes: with some notes\n' +
      '  Size: 400\u00d7300, 9 B\n'
    );
    const blob = await zip.generateAsync({ type: 'blob' });

    const results = await readShotsFromZip(blob);
    expect(results).toHaveLength(2);

    const first = results.find((r) => r.caption === 'First one');
    expect(first.mime).toBe('image/png');
    expect(first.notes).toBe(''); // "(none)" in the manifest maps back to empty

    const second = results.find((r) => r.caption === 'Second one');
    expect(second.mime).toBe('image/jpeg');
    expect(second.notes).toBe('with some notes');
  });

  it('skips non-image entries and works fine with no manifest at all', async () => {
    const zip = new JSZip();
    zip.file('001_shot.png', new Blob(['png-bytes'], { type: 'image/png' }));
    zip.file('readme.txt', 'not a screenshot');
    const blob = await zip.generateAsync({ type: 'blob' });

    const results = await readShotsFromZip(blob);
    expect(results).toHaveLength(1);
    expect(results[0].caption).toBe('');
    expect(results[0].notes).toBe('');
  });

  it('returns an empty list for a ZIP with no images', async () => {
    const zip = new JSZip();
    zip.file('notes.txt', 'just some text');
    const blob = await zip.generateAsync({ type: 'blob' });
    expect(await readShotsFromZip(blob)).toEqual([]);
  });
});
