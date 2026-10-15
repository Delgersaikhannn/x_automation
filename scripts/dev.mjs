// Local static server for dist/ with the same framing headers production sends.
// `node scripts/dev.mjs` builds, serves, and rebuilds on changes.
import { createServer } from 'node:http';
import { createReadStream, watch } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build, FRAME_HEADERS } from './build.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
};

async function resolveFile(urlPath) {
  const rel = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const file = join(dist, rel);
  if (file !== dist && !file.startsWith(dist + sep)) return null;
  // Clean URLs: /x/slug -> /x/slug/index.html
  for (const candidate of [file, join(file, 'index.html'), `${file}.html`]) {
    const s = await stat(candidate).catch(() => null);
    if (s?.isFile()) return candidate;
  }
  return null;
}

export function startServer({ port = 4173 } = {}) {
  const server = createServer(async (req, res) => {
    const { pathname } = new URL(req.url, 'http://localhost');
    const file = await resolveFile(pathname).catch(() => null);
    for (const [k, v] of Object.entries(FRAME_HEADERS)) res.setHeader(k, v);
    res.setHeader('Cache-Control', 'no-store');
    if (!file) {
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[extname(file).toLowerCase()] || 'application/octet-stream' });
    if (req.method === 'HEAD') return res.end();
    createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT) || 4173;
  await build();
  await startServer({ port });
  console.log(`\nServing http://localhost:${port}  (index lists every portal)`);

  let timer;
  const rebuild = (_, name) => {
    if (name && /(^|[\\/])\./.test(name)) return;
    clearTimeout(timer);
    timer = setTimeout(() => build({ quiet: true }).then(() => console.log('rebuilt'), (e) => console.error(e.message)), 100);
  };
  for (const dir of ['apps', 'public']) watch(join(root, dir), { recursive: true }, rebuild);
  watch(join(root, 'portals.config.mjs'), rebuild);
}
