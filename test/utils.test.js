import { describe, it, expect } from 'vitest';
import { fmtBytes, timeAgo, extFromMime, sanitize, makeId, filterShotsByQuery, sortShots } from '../src/utils.js';

describe('fmtBytes', () => {
  it('formats bytes under 1KB', () => {
    expect(fmtBytes(512)).toBe('512 B');
  });
  it('formats kilobytes', () => {
    expect(fmtBytes(2048)).toBe('2 KB');
  });
  it('formats megabytes with one decimal', () => {
    expect(fmtBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});

describe('timeAgo', () => {
  it('reports "just now" for very recent timestamps', () => {
    expect(timeAgo(Date.now())).toBe('just now');
  });
  it('reports minutes ago', () => {
    expect(timeAgo(Date.now() - 5 * 60 * 1000)).toBe('5m ago');
  });
  it('reports hours ago', () => {
    expect(timeAgo(Date.now() - 3 * 3600 * 1000)).toBe('3h ago');
  });
  it('reports days ago', () => {
    expect(timeAgo(Date.now() - 2 * 86400 * 1000)).toBe('2d ago');
  });
});

describe('extFromMime', () => {
  it('maps known image types to their extensions', () => {
    expect(extFromMime('image/jpeg')).toBe('jpg');
    expect(extFromMime('image/webp')).toBe('webp');
    expect(extFromMime('image/gif')).toBe('gif');
    expect(extFromMime('image/bmp')).toBe('bmp');
    expect(extFromMime('image/avif')).toBe('avif');
    expect(extFromMime('image/svg+xml')).toBe('svg');
  });
  it('falls back to png for unrecognized or missing mime types', () => {
    expect(extFromMime('image/png')).toBe('png');
    expect(extFromMime(undefined)).toBe('png');
  });
});

describe('sanitize', () => {
  it('keeps non-Latin scripts (e.g. Khmer captions) instead of stripping them to nothing', () => {
    expect(sanitize('ការចាប់អារម្មណ៍')).toBe('ការចាប់អារម្មណ៍');
  });
  it('replaces whitespace runs with a single hyphen', () => {
    expect(sanitize('Q3   report   draft')).toBe('Q3-report-draft');
  });
  it('strips filesystem-illegal characters', () => {
    expect(sanitize('a/b\\c:d*e?f"g<h>i|j')).toBe('abcdefghij');
  });
  it('trims leading/trailing hyphens and dots', () => {
    expect(sanitize('  ...leading and trailing...  ')).toBe('leading-and-trailing');
  });
  it('returns an empty string for empty/undefined input', () => {
    expect(sanitize('')).toBe('');
    expect(sanitize(undefined)).toBe('');
  });
  it('caps length at 60 characters', () => {
    expect(sanitize('a'.repeat(200)).length).toBe(60);
  });
});

describe('makeId', () => {
  it('produces unique, shot-prefixed ids', () => {
    const a = makeId();
    const b = makeId();
    expect(a).not.toBe(b);
    expect(a.startsWith('shot_')).toBe(true);
  });
});

describe('filterShotsByQuery', () => {
  const shots = [
    { id: '1', caption: 'Invoice draft', notes: '' },
    { id: '2', caption: '', notes: 'client feedback pending' },
    { id: '3', caption: 'Unrelated', notes: '' }
  ];

  it('returns everything unchanged when the query is empty', () => {
    expect(filterShotsByQuery(shots, '')).toBe(shots);
  });
  it('matches on caption, case-insensitively', () => {
    expect(filterShotsByQuery(shots, 'invoice')).toEqual([shots[0]]);
  });
  it('matches on notes too', () => {
    expect(filterShotsByQuery(shots, 'FEEDBACK')).toEqual([shots[1]]);
  });
  it('returns an empty array when nothing matches', () => {
    expect(filterShotsByQuery(shots, 'nonexistent')).toEqual([]);
  });
});

describe('sortShots', () => {
  const shots = [
    { id: 'a', caption: 'Banana', createdAt: 100, sizeBytes: 500 },
    { id: 'b', caption: 'apple', createdAt: 300, sizeBytes: 2000 },
    { id: 'c', caption: 'Cherry', createdAt: 200, sizeBytes: 1000 }
  ];

  it('sorts newest first by default', () => {
    expect(sortShots(shots, 'new').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
  it('sorts oldest first', () => {
    expect(sortShots(shots, 'old').map((s) => s.id)).toEqual(['a', 'c', 'b']);
  });
  it('sorts largest file first', () => {
    expect(sortShots(shots, 'largest').map((s) => s.id)).toEqual(['b', 'c', 'a']);
  });
  it('sorts by caption A-Z, case-insensitively', () => {
    expect(sortShots(shots, 'name').map((s) => s.id)).toEqual(['b', 'a', 'c']);
  });
  it('does not mutate the input array', () => {
    const original = shots.slice();
    sortShots(shots, 'old');
    expect(shots).toEqual(original);
  });
});
