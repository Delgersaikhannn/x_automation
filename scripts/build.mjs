// Generates dist/: copies apps + public, and writes a card page and a player shell per portal.
import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

// Sent on every response so X (and anything else) may frame the player and apps.
export const FRAME_HEADERS = {
  'Content-Security-Policy': 'frame-ancestors *',
};

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const abs = (siteUrl, path) => new URL(path, siteUrl.replace(/\/?$/, '/')).href;

async function loadConfig() {
  // Cache-bust so the dev server's watcher picks up config edits.
  const url = pathToFileURL(join(root, 'portals.config.mjs')).href + `?t=${Date.now()}`;
  return (await import(url)).default;
}

function cardPage(cfg, p) {
  const cardUrl = abs(cfg.siteUrl, `/x/${p.slug}`);
  const playerUrl = abs(cfg.siteUrl, `/x/${p.slug}/player`);
  const imageUrl = abs(cfg.siteUrl, p.image);
  const embedUrl = abs(cfg.siteUrl, p.embed);
  // Crawlers read the meta tags; people who open the link directly get the app full-page.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(p.title)}</title>
<meta name="description" content="${esc(p.description)}">
<link rel="canonical" href="${esc(cardUrl)}">
<meta name="twitter:card" content="player">
<meta name="twitter:site" content="${esc(cfg.twitterSite)}">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(p.description)}">
<meta name="twitter:player" content="${esc(playerUrl)}">
<meta name="twitter:player:width" content="${p.width}">
<meta name="twitter:player:height" content="${p.height}">
<meta name="twitter:image" content="${esc(imageUrl)}">
<meta name="twitter:image:alt" content="${esc(p.title)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(cardUrl)}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(p.description)}">
<meta property="og:image" content="${esc(imageUrl)}">
<style>html,body{margin:0;height:100%;background:#0b0b0c}iframe{border:0;width:100%;height:100%;display:block}</style>
</head>
<body>
<iframe src="${esc(embedUrl)}" title="${esc(p.title)}" allow="autoplay; fullscreen; clipboard-write; web-share"></iframe>
</body>
</html>
`;
}

function playerPage(cfg, p) {
  const embedUrl = abs(cfg.siteUrl, p.embed);
  const embedOrigin = new URL(embedUrl).origin;
  // The shell stays tiny: full-bleed iframe plus analytics forwarding. Apps report
  // interactions with parent.postMessage({ type: 'portal-event', name, data }).
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="strict-origin-when-cross-origin">
<title>${esc(p.title)}</title>
<style>html,body{margin:0;height:100%;overflow:hidden;background:#0b0b0c}iframe{border:0;width:100%;height:100%;display:block}</style>
</head>
<body>
<iframe src="${esc(embedUrl)}" title="${esc(p.title)}" allow="autoplay; fullscreen; clipboard-write; web-share"></iframe>
<script>
(function () {
  var endpoint = ${JSON.stringify(cfg.analyticsUrl)};
  var base = { portal: ${JSON.stringify(p.slug)}, referrer: document.referrer || null };
  function track(name, data) {
    if (!endpoint) return;
    var body = JSON.stringify(Object.assign({ event: name, data: data || null, ts: Date.now() }, base));
    try {
      if (!navigator.sendBeacon || !navigator.sendBeacon(endpoint, new Blob([body], { type: 'text/plain' }))) {
        fetch(endpoint, { method: 'POST', body: body, keepalive: true, mode: 'no-cors' }).catch(function () {});
      }
    } catch (_) {}
  }
  window.addEventListener('message', function (e) {
    if (e.origin !== ${JSON.stringify(embedOrigin)} || !e.data || e.data.type !== 'portal-event') return;
    track(String(e.data.name), e.data.data);
  });
  track('player_load');
})();
</script>
</body>
</html>
`;
}

function indexPage(cfg) {
  const rows = cfg.portals
    .map((p) => {
      const url = abs(cfg.siteUrl, `/x/${p.slug}`);
      return `<li><a href="/x/${esc(p.slug)}">${esc(p.title)}</a><code>${esc(url)}</code></li>`;
    })
    .join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Portals</title>
<style>
body{margin:0;padding:32px 16px;font:15px/1.5 system-ui,sans-serif;background:#fafaf9;color:#1c1917}
main{max-width:640px;margin:0 auto}ul{padding:0;list-style:none}
li{display:flex;flex-direction:column;gap:4px;padding:12px 0;border-bottom:1px solid #e7e5e4}
code{font-size:13px;color:#57534e;word-break:break-all}
@media (prefers-color-scheme:dark){body{background:#0c0a09;color:#f5f5f4}li{border-color:#292524}code{color:#a8a29e}a{color:#93c5fd}}
</style>
</head>
<body><main><h1>Portals</h1><p>Paste a URL below into a post on X.</p><ul>
${rows}
</ul></main></body>
</html>
`;
}

function headersFile(cfg) {
  // Netlify / Cloudflare Pages format. Vercel uses vercel.json instead.
  const lines = Object.entries(FRAME_HEADERS).map(([k, v]) => `  ${k}: ${v}`);
  return `/*\n${lines.join('\n')}\n`;
}

const exists = (p) => access(p).then(() => true, () => false);

export async function build({ quiet = false } = {}) {
  const cfg = await loadConfig();
  const log = quiet ? () => {} : console.log;
  const warn = (m) => console.warn(`warn: ${m}`);

  if (!cfg.siteUrl.startsWith('https://')) warn(`siteUrl is ${cfg.siteUrl}; X needs a public https:// URL. Set SITE_URL when building for deploy.`);
  if (cfg.twitterSite === '@yourhandle') warn('twitterSite is still @yourhandle (set TWITTER_SITE or edit portals.config.mjs).');

  const slugs = new Set();
  for (const p of cfg.portals) {
    if (!/^[a-z0-9-]+$/.test(p.slug)) throw new Error(`Invalid slug "${p.slug}" (use a-z, 0-9, -)`);
    if (slugs.has(p.slug)) throw new Error(`Duplicate slug "${p.slug}"`);
    slugs.add(p.slug);
    for (const k of ['title', 'description', 'embed', 'width', 'height', 'image']) {
      if (p[k] == null || p[k] === '') throw new Error(`Portal "${p.slug}" is missing "${k}"`);
    }
  }

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });
  if (await exists(join(root, 'public'))) await cp(join(root, 'public'), dist, { recursive: true });
  if (await exists(join(root, 'apps'))) await cp(join(root, 'apps'), join(dist, 'apps'), { recursive: true });

  for (const p of cfg.portals) {
    const dir = join(dist, 'x', p.slug);
    await mkdir(join(dir, 'player'), { recursive: true });
    await writeFile(join(dir, 'index.html'), cardPage(cfg, p));
    await writeFile(join(dir, 'player', 'index.html'), playerPage(cfg, p));
    if (p.image.startsWith('/') && !(await exists(join(dist, p.image)))) {
      warn(`${p.slug}: preview image ${p.image} not found; run \`npm run previews\`.`);
    }
    log(`  /x/${p.slug}  ->  ${p.embed}`);
  }

  await writeFile(join(dist, 'index.html'), indexPage(cfg));
  await writeFile(join(dist, '_headers'), headersFile(cfg));
  log(`Built ${cfg.portals.length} portal(s) into dist/ for ${cfg.siteUrl}`);
  return cfg;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  build().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
