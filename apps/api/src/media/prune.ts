import { readdir, stat, unlink } from 'fs/promises';
import { join } from 'path';

/** Deal photos are `<telegram photo id>.<ext>`; anything else in the folder is left alone. */
const PHOTO_FILE_RE = /^[A-Za-z0-9_-]{1,255}\.(jpg|jpeg|png|webp)$/;

export interface PruneResult {
  deleted: number;
  bytes: number;
  kept: number;
}

/**
 * Deletes photo files in `dir` last modified before `cutoff`, except the ones in
 * `keep` (file names still used by a recent deal or an in-flight message).
 * Files are written once when the photo arrives, so mtime ≈ when the deal came in.
 * Catches photos of old deals and orphans (photos of messages that never became a deal).
 */
export async function prunePhotoFiles(
  dir: string,
  cutoff: Date,
  keep: ReadonlySet<string>,
  dryRun = false,
): Promise<PruneResult> {
  const result: PruneResult = { deleted: 0, bytes: 0, kept: 0 };
  for (const name of await readdir(dir)) {
    if (!PHOTO_FILE_RE.test(name)) continue;
    const path = join(dir, name);
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) continue;
    if (info.mtime >= cutoff || keep.has(name)) {
      result.kept++;
      continue;
    }
    if (!dryRun) {
      const removed = await unlink(path).then(() => true, () => false);
      if (!removed) continue;
    }
    result.deleted++;
    result.bytes += info.size;
  }
  return result;
}

/** `media/<file>` (a deal's local_path) → `<file>`; null for non-photo paths such as `coupon.png`. */
export function photoFileName(localPath: string | null): string | null {
  return localPath?.startsWith('media/') ? localPath.slice('media/'.length) : null;
}
