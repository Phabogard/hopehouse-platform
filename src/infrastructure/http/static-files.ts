import { readFileSync } from 'node:fs';
import { extname, join, normalize, resolve, sep } from 'node:path';
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
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
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
  const filePath = resolve(resolvedPublicDir, safeRelativePath);

  // Prevent path traversal outside publicDir, including sibling-prefix paths.
  if (filePath !== resolvedPublicDir && !filePath.startsWith(`${resolvedPublicDir}${sep}`)) {
    return false;
  }

  try {
    const data = readFileSync(filePath);
    const ext = extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    response.writeHead(200, {
      'content-type': contentType,
      'content-length': String(data.length),
      'cache-control': 'no-cache',
    });
    response.end(data);
    return true;
  } catch {
    return false;
  }
}
