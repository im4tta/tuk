// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import JSZip from 'jszip';
import { exportShotsAsZip, downloadSingle } from '../src/export.js';

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
