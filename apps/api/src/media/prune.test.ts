import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { existsSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { photoFileName, prunePhotoFiles } from './prune';

const DAY = 86_400_000;
const cutoff = new Date(Date.now() - 30 * DAY);
let dir: string;

function file(name: string, ageDays: number, bytes = 10): void {
  const path = join(dir, name);
  writeFileSync(path, new Uint8Array(bytes));
  const t = new Date(Date.now() - ageDays * DAY);
  utimesSync(path, t, t);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'prune-test-'));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('prunePhotoFiles', () => {
  it('deletes old photos, keeps recent and protected ones', async () => {
    file('old.jpg', 40, 100);
    file('old-but-used.jpg', 40);
    file('new.jpg', 5);
    const result = await prunePhotoFiles(dir, cutoff, new Set(['old-but-used.jpg']));
    expect(result).toEqual({ deleted: 1, bytes: 100, kept: 2 });
    expect(existsSync(join(dir, 'old.jpg'))).toBe(false);
    expect(existsSync(join(dir, 'old-but-used.jpg'))).toBe(true);
    expect(existsSync(join(dir, 'new.jpg'))).toBe(true);
  });

  it('never touches files that are not photos', async () => {
    file('notes.txt', 400);
    file('.photo.jpg.123.tmp', 400);
    expect((await prunePhotoFiles(dir, cutoff, new Set())).deleted).toBe(0);
    expect(existsSync(join(dir, 'notes.txt'))).toBe(true);
  });

  it('only counts in a dry run', async () => {
    file('old.jpg', 40, 100);
    expect(await prunePhotoFiles(dir, cutoff, new Set(), true)).toEqual({ deleted: 1, bytes: 100, kept: 0 });
    expect(existsSync(join(dir, 'old.jpg'))).toBe(true);
  });
});

describe('photoFileName', () => {
  it('maps deal local paths to file names', () => {
    expect(photoFileName('media/abc.jpg')).toBe('abc.jpg');
    expect(photoFileName('coupon.png')).toBeNull();
    expect(photoFileName(null)).toBeNull();
  });
});
