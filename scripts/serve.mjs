/**
 * Tiny static server for local development — no dependencies.
 *
 *   npm start            → http://localhost:8080
 *   npm start -- 3000    → http://localhost:3000
 *
 * Camera access needs a secure context; localhost counts as one, so this is
 * enough for testing on a laptop. To test on your phone, see README.md.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { networkInterfaces } from 'node:os';

const root = resolve(new URL('..', import.meta.url).pathname);
const port = Number(process.argv[2] || process.env.PORT || 8080);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.wasm': 'application/wasm',
  '.task': 'application/octet-stream',
  '.binarypb': 'application/octet-stream',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    let path = join(root, normalize(decodeURIComponent(url.pathname)));
    if (!path.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
    let info = await stat(path).catch(() => null);
    if (info?.isDirectory()) { path = join(path, 'index.html'); info = await stat(path).catch(() => null); }
    if (!info) { res.writeHead(404).end('Not found'); return; }
    const body = await readFile(path);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(path)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(body);
  } catch (err) {
    res.writeHead(500).end(String(err));
  }
}).listen(port, () => {
  const lan = Object.values(networkInterfaces())
    .flat()
    .filter((n) => n && n.family === 'IPv4' && !n.internal)
    .map((n) => n.address);
  console.log(`Sloth Mode running at http://localhost:${port}`);
  lan.forEach((ip) => console.log(`  on your network: http://${ip}:${port}  (camera needs https — see README)`));
});
