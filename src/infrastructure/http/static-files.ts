import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import type { ServerResponse } from 'node:http';

const MIME_TYPES: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
};

export function serveStaticFile(
  publicDir: string,
  relativePath: string,
  response: ServerResponse,
): boolean {
  const resolvedPublicDir = resolve(publicDir);
  const cleanRelative = relativePath.replace(/^\/public\//, '').replace(/^[\/\\]+/, '');
  const safeRelativePath = normalize(cleanRelative).replace(/^(\.\.[\/\\])+/, '');
  const filePath = join(resolvedPublicDir, safeRelativePath);

  // Prevent path traversal outside publicDir
  if (!filePath.startsWith(resolvedPublicDir)) {
    return false;
  }

  try {
    const data = readFileSync(filePath, 'utf8');
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    response.writeHead(200, {
      'content-type': contentType,
      'content-length': String(Buffer.byteLength(data)),
      'cache-control': 'no-cache',
    });
    response.end(data);
    return true;
  } catch {
    return false;
  }
}
