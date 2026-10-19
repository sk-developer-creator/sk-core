/**
 * Local preview server for the built site.
 *
 * Serves dist/ over HTTP so the real deployment can be exercised in a browser,
 * including the custom 404 page (unknown paths return 404 + dist/404.html).
 * Not part of the deployment: the deployable artefact is dist/ itself.
 *
 *   npm run serve            -> http://127.0.0.1:4173
 *   PORT=8080 npm run serve
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const PORT = Number(process.env.PORT || 4173);
const HOST = process.env.HOST || '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.ico': 'image/x-icon',
};

if (!fs.existsSync(DIST)) {
  console.error('dist/ does not exist yet — run: npm run build');
  process.exit(1);
}

function send(res, status, body, type) {
  res.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || HOST}`);
  let pathname = decodeURIComponent(url.pathname);

  // Never allow traversal outside dist/.
  const candidate = path.normalize(path.join(DIST, pathname));
  if (!candidate.startsWith(DIST)) {
    send(res, 403, 'Forbidden', 'text/plain; charset=utf-8');
    return;
  }

  let file = candidate;
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');

  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    send(res, 200, fs.readFileSync(file), type);
    return;
  }

  const notFound = path.join(DIST, '404.html');
  send(res, 404, fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found', 'text/html; charset=utf-8');
});

server.listen(PORT, HOST, () => {
  console.log(`SK CORE preview: http://${HOST}:${PORT}`);
  console.log(`  serving ${path.relative(process.cwd(), DIST).replace(/\\/g, '/')}/  (Ctrl+C to stop)`);
});
