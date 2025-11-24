import { promises as fs } from 'fs';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const filename = searchParams.get('file');

  if (!filename) {
    return NextResponse.json(
      { error: 'Missing file parameter' },
      { status: 400 },
    );
  }

  try {
    // Validação de segurança: apenas arquivos em ./public/media/
    if (filename.includes('..') || filename.startsWith('/')) {
      return NextResponse.json({ error: 'Invalid filename' }, { status: 400 });
    }

    // Usar o symlink em public/media
    const filePath = path.join(process.cwd(), 'public', filename);
    const data = await fs.readFile(filePath);

    // Detectar tipo MIME
    const ext = path.extname(filename).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const contentType = mimeTypes[ext] || 'application/octet-stream';

    return new NextResponse(data, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (e) {
    console.error('Error serving media:', e);
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
}
