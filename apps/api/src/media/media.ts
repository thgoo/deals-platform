import { Hono } from 'hono';

/**
 * GET /media/<file> — deal photos. Public; file names are Telegram photo ids,
 * which never change content, so browsers and the Next.js image optimizer can
 * cache them for good.
 */
const app = new Hono();

app.get('/:file', async c => {
  const target = c.get('mediaStore').resolveFile(c.req.param('file'));
  if (!target) return c.json({ message: 'Not Found' }, 404);

  const file = Bun.file(target.path);
  if (!(await file.exists())) return c.json({ message: 'Not Found' }, 404);

  return new Response(file, {
    headers: {
      'Content-Type': target.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
});

export default app;
