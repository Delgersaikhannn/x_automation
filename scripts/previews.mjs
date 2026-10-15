// Renders each local portal's embed with headless Chrome/Edge into public/previews/<slug>.png
// at 2x the card size, so twitter:image matches the player's aspect ratio.
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { build } from './build.mjs';
import { startServer } from './dev.mjs';

const run = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function findBrowser() {
  const candidates = [
    process.env.BROWSER_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  const found = candidates.find((p) => p && existsSync(p));
  if (!found) throw new Error('No Chrome/Edge found. Set BROWSER_PATH to a Chromium-based browser.');
  return found;
}

const cfg = await build({ quiet: true });
const browser = findBrowser();
const port = 4100 + Math.floor(Math.random() * 800);
const server = await startServer({ port });
const outDir = join(root, 'public', 'previews');
await mkdir(outDir, { recursive: true });

try {
  for (const p of cfg.portals) {
    if (!p.embed.startsWith('/')) {
      console.log(`skip ${p.slug}: external embed, supply its image yourself`);
      continue;
    }
    const out = join(outDir, `${p.slug}.png`);
    const profile = await mkdtemp(join(tmpdir(), 'portal-shot-'));
    const url = new URL(p.embed, `http://localhost:${port}`);
    url.searchParams.set('preview', '1');
    await run(browser, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--user-data-dir=${profile}`,
      '--force-device-scale-factor=2',
      `--window-size=${p.width},${p.height}`,
      '--virtual-time-budget=4000',
      `--screenshot=${out}`,
      url.href,
    ], { timeout: 60_000 });
    await rm(profile, { recursive: true, force: true }).catch(() => {});
    const { size } = await stat(out);
    console.log(`${p.slug}: ${out} (${Math.round(size / 1024)} KB)`);
  }
} finally {
  server.close();
}

await build({ quiet: true });
