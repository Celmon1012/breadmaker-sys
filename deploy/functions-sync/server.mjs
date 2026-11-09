// The functions-sync service: serves the manifest and the files built into this image, to the edge-functions
// container only (it has no public domain; it listens on the Docker network). Read-only, no secrets: edge function
// source is in git anyway. HTTP/1.0-friendly (Content-Length, no chunking), because the container pulls it with plain bash.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(process.env.SYNC_DIR || './dist');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const allowed = new Set(manifest.files.map((file) => file.path));

const send = (res, status, body, type = 'text/plain; charset=utf-8') => {
  const data = Buffer.isBuffer(body) ? body : Buffer.from(body);
  res.writeHead(status, { 'Content-Type': type, 'Content-Length': data.length, 'Cache-Control': 'no-store', Connection: 'close' });
  res.end(data);
};

http
  .createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    if (req.method !== 'GET') return send(res, 405, 'GET only\n');
    if (url === '/healthz') return send(res, 200, `ok ${manifest.version}\n`);
    if (url === '/manifest.txt') return send(res, 200, fs.readFileSync(path.join(root, 'manifest.txt')));
    if (url === '/manifest.json') return send(res, 200, fs.readFileSync(path.join(root, 'manifest.json')), 'application/json');
    if (url.startsWith('/f/')) {
      const file = decodeURIComponent(url.slice(3));
      if (!allowed.has(file)) return send(res, 404, 'not listed\n');
      return send(res, 200, fs.readFileSync(path.join(root, 'f', file)));
    }
    return send(res, 404, 'not found\n');
  })
  .listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log(`functions-sync ${manifest.version} on :${process.env.PORT || 8080}`));
