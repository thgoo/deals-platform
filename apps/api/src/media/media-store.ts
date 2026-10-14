import { mkdir, rename, writeFile } from 'fs/promises';
import { join, resolve } from 'path';

/** Telegram photo ids are base64url; anything else is rejected before touching the disk. */
const PHOTO_ID_RE = /^[A-Za-z0-9_-]{1,255}$/;
const FILE_RE = /^[A-Za-z0-9_-]{1,255}\.(jpg|jpeg|png|webp)$/;

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

/**
 * Deal photos on local disk (MEDIA_DIR). The crawler uploads them to the api,
 * the api serves them at /media/<file>; deals keep `local_path = media/<file>`
 * (the format they always had, so existing rows and files need no migration).
 */
export default class MediaStore {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = resolve(dir);
  }

  static isValidPhotoId(photoId: string): boolean {
    return PHOTO_ID_RE.test(photoId);
  }

  /** Writes a deal photo atomically (temp file + rename). Returns the deal's local_path. */
  async savePhoto(photoId: string, bytes: Uint8Array): Promise<string> {
    if (!MediaStore.isValidPhotoId(photoId)) throw new Error(`Invalid photo id: ${photoId}`);
    const file = `${photoId}.jpg`;
    await mkdir(this.dir, { recursive: true });
    const tmp = join(this.dir, `.${file}.${process.pid}.${Date.now()}.tmp`);
    await writeFile(tmp, bytes);
    await rename(tmp, join(this.dir, file));
    return `media/${file}`;
  }

  /** The file for a public /media/<file> request, or null if the name isn't a media file name. */
  resolveFile(file: string): { path: string; contentType: string } | null {
    const ext = FILE_RE.exec(file)?.[1];
    const contentType = ext ? CONTENT_TYPES[ext] : undefined;
    if (!contentType) return null;
    return { path: join(this.dir, file), contentType };
  }
}
