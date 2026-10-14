import { afterAll, describe, expect, it } from 'bun:test';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createApp } from '~/app';
import MediaStore from './media-store';

const dir = mkdtempSync(join(tmpdir(), 'media-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const store = new MediaStore(dir);
const app = createApp({ mediaStore: store, enableLogger: false });
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

describe('MediaStore', () => {
  it('accepts Telegram-style photo ids and rejects anything path-like', () => {
    expect(MediaStore.isValidPhotoId('AgACAgEAAx0CWXf9zAAC3j1q-zsf_J')).toBe(true);
    for (const bad of ['', '../x', 'a/b', 'a.b', 'x'.repeat(256), 'é']) {
      expect(MediaStore.isValidPhotoId(bad)).toBe(false);
    }
  });

  it('saves a photo and returns the deal local_path', async () => {
    expect(await store.savePhoto('photo1', JPEG)).toBe('media/photo1.jpg');
    expect(new Uint8Array(readFileSync(join(dir, 'photo1.jpg')))).toEqual(JPEG);
  });

  it('only resolves media file names inside the media dir', () => {
    expect(store.resolveFile('photo1.jpg')).toEqual({ path: join(dir, 'photo1.jpg'), contentType: 'image/jpeg' });
    for (const bad of ['../secret.jpg', 'x.exe', '.env', 'a/b.jpg']) {
      expect(store.resolveFile(bad)).toBeNull();
    }
  });
});

describe('GET /media/:file', () => {
  it('serves a stored photo with long-lived caching', async () => {
    await store.savePhoto('served', JPEG);
    const res = await app.request('/media/served.jpg');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/jpeg');
    expect(res.headers.get('cache-control')).toContain('immutable');
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG);
  });

  it('404s on unknown files and on traversal attempts', async () => {
    expect((await app.request('/media/missing.jpg')).status).toBe(404);
    expect((await app.request('/media/..%2F..%2Fpackage.json')).status).toBe(404);
  });
});

describe('PUT /api/deals/photos/:photoId', () => {
  it('requires the webhook secret', async () => {
    const res = await app.request('/api/deals/photos/abc', { method: 'PUT', body: JPEG });
    expect(res.status).toBe(401);
  });

  it('rejects invalid photo ids and empty bodies before touching anything', async () => {
    const headers = { 'X-Webhook-Secret': 'test-webhook-secret' };
    expect((await app.request('/api/deals/photos/a.b', { method: 'PUT', body: JPEG, headers })).status).toBe(400);
    expect((await app.request('/api/deals/photos/abc', { method: 'PUT', body: new Uint8Array(), headers })).status)
      .toBe(400);
  });
});
