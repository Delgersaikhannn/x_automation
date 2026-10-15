// Fetches a card URL the way X's crawler does and checks everything a player card needs.
// Usage: node scripts/check-card.mjs https://your.site/x/giftpicker
const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/check-card.mjs <card-url>');
  process.exit(2);
}

const UA = 'Twitterbot/1.0';
let failures = 0;
const ok = (m) => console.log(`  ok    ${m}`);
const bad = (m) => (failures++, console.log(`  FAIL  ${m}`));
const note = (m) => console.log(`  note  ${m}`);

async function get(url, method = 'GET') {
  return fetch(url, { method, redirect: 'follow', headers: { 'User-Agent': UA } });
}

function metaTags(html) {
  const tags = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const key = tag.match(/\b(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1];
    const val = tag.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
    if (key && val != null && !(key.toLowerCase() in tags)) tags[key.toLowerCase()] = val.replace(/&amp;/g, '&');
  }
  return tags;
}

function frameableByX(res) {
  const xfo = res.headers.get('x-frame-options');
  if (xfo) return `X-Frame-Options: ${xfo} blocks framing`;
  const csp = res.headers.get('content-security-policy') || '';
  const fa = csp.split(';').map((d) => d.trim()).find((d) => d.toLowerCase().startsWith('frame-ancestors'));
  if (!fa) return null;
  const sources = fa.split(/\s+/).slice(1);
  const allowed = sources.some((s) => s === '*' || /(^|\.|\/\/|\*\.)(x|twitter)\.com$/i.test(s.replace(/\/$/, '')));
  return allowed ? null : `CSP "${fa}" does not allow x.com`;
}

console.log(`\nChecking ${target}\n`);

const url = new URL(target);
if (url.protocol !== 'https:') bad('Card URL must be https:// (X will not render player cards over http).');

const robots = await get(new URL('/robots.txt', url)).catch(() => null);
if (robots?.ok) {
  const txt = await robots.text();
  const block = txt.split(/\n(?=user-agent:)/i).find((b) => /user-agent:\s*(twitterbot|\*)/i.test(b)) || '';
  if (/^\s*disallow:\s*\/\s*$/im.test(block)) bad('robots.txt disallows Twitterbot');
  else ok('robots.txt allows Twitterbot');
} else note('no robots.txt (fine: crawlers allowed by default)');

const page = await get(url).catch((e) => bad(`Card page fetch failed: ${e.message}`));
if (page && !page.ok) bad(`Card page returned HTTP ${page.status}`);
const tags = page ? metaTags(await page.text()) : {};

const card = tags['twitter:card'];
card === 'player' ? ok('twitter:card = player') : bad(`twitter:card is "${card ?? 'missing'}", expected "player"`);
for (const k of ['twitter:title', 'twitter:site', 'twitter:description']) {
  tags[k] ? ok(`${k} = ${tags[k]}`) : bad(`${k} missing`);
}

const w = Number(tags['twitter:player:width']);
const h = Number(tags['twitter:player:height']);
w > 0 && h > 0 ? ok(`player size ${w}x${h}`) : bad('twitter:player:width / height missing or not numbers');

const playerUrl = tags['twitter:player'];
if (!playerUrl) bad('twitter:player missing');
else if (!playerUrl.startsWith('https://')) bad(`twitter:player must be https: ${playerUrl}`);
else {
  const res = await get(playerUrl).catch(() => null);
  if (!res?.ok) bad(`player URL returned ${res ? `HTTP ${res.status}` : 'network error'}: ${playerUrl}`);
  else {
    ok(`player reachable: ${playerUrl}`);
    const why = frameableByX(res);
    why ? bad(`player not frameable: ${why}`) : ok('player is frameable by x.com');
    const inner = (await res.text()).match(/<iframe\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i)?.[1];
    if (inner) {
      const innerUrl = new URL(inner.replace(/&amp;/g, '&'), playerUrl);
      const innerRes = await get(innerUrl).catch(() => null);
      if (!innerRes?.ok) bad(`embedded app returned ${innerRes ? `HTTP ${innerRes.status}` : 'network error'}: ${innerUrl}`);
      else {
        const why2 = frameableByX(innerRes);
        why2 ? bad(`embedded app not frameable: ${why2}`) : ok(`embedded app reachable and frameable: ${innerUrl}`);
      }
    }
  }
}

const image = tags['twitter:image'];
if (!image) bad('twitter:image missing (required for player cards)');
else {
  const res = await get(image).catch(() => null);
  const type = res?.headers.get('content-type') || '';
  if (!res?.ok) bad(`twitter:image returned ${res ? `HTTP ${res.status}` : 'network error'}`);
  else if (!/^image\/(png|jpe?g|webp|gif)/.test(type)) bad(`twitter:image has content-type "${type}" (use png/jpg/webp/gif)`);
  else {
    const kb = Number(res.headers.get('content-length') || 0) / 1024;
    kb > 5120 ? bad(`twitter:image is ${Math.round(kb)} KB (limit 5 MB)`) : ok(`twitter:image ${type}${kb ? `, ${Math.round(kb)} KB` : ''}`);
  }
}

console.log(failures ? `\n${failures} problem(s) found.\n` : '\nCard looks good. Post the URL on X to test (X caches cards: change the URL if you edit tags).\n');
// exitCode rather than exit(): exiting with fetch sockets still open crashes Node on Windows.
process.exitCode = failures ? 1 : 0;
