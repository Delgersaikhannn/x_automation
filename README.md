# X Portals

Interactive web apps that play **inside a post on X**, using X's Player Card.

A post links to `https://<site>/x/<slug>`. X's crawler reads the `twitter:card=player` tags on that page
and renders `/x/<slug>/player` as an iframe in the feed. The player is a thin shell that iframes your app
and forwards its analytics events.

```
post ──> /x/<slug>            card page: twitter:player meta tags (people who open it directly get the app full-page)
          └─ /x/<slug>/player  player shell: full-bleed iframe + analytics forwarding (what X embeds)
               └─ /apps/<app>/ your interactive app (or any external https URL)
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Build and serve on http://localhost:4173, rebuilding on changes |
| `npm run build` | Write the static site to `dist/` |
| `npm run previews` | Screenshot each local app into `public/previews/<slug>.png` (uses local Chrome/Edge; set `BROWSER_PATH` to override) |
| `npm run check -- <card-url>` | Fetch a card the way Twitterbot does and check tags, https, framing headers, and image |

No dependencies; Node 20+.

## Add a portal

1. Put a static app in `apps/<name>/` (it must look right at the card size, 720×450 by default, and down to ~360px wide).
2. Add an entry to `portals.config.mjs` with `slug`, `title`, `description`, `embed`, `width`, `height`, and `image`.
3. `npm run previews` to generate the fallback image, then deploy.

Apps can report interactions to the shell:

```js
parent.postMessage({ type: 'portal-event', name: 'swipe', data: { liked: true } }, '*');
```

The shell POSTs `{ event, data, portal, referrer, ts }` to `analyticsUrl` (if set) along with a `player_load` event.

## Deploy

The site is static. On **Vercel**, import the folder or run `npx vercel`; `vercel.json` sets the build, the
output folder, and the `Content-Security-Policy: frame-ancestors *` header X needs in order to frame the player. On **Netlify**
or **Cloudflare Pages**, use build command `npm run build` and output folder `dist`; the generated `dist/_headers` handles the header.

Environment variables:

- `SITE_URL`: the public https origin, e.g. `https://portals.example.com`. Defaults to Vercel's/Netlify's production URL when one is set.
- `TWITTER_SITE`: your handle, e.g. `@you`.
- `ANALYTICS_URL`: optional endpoint for events.

Then:

```sh
npm run check -- https://portals.example.com/x/giftpicker
```

Post the URL on X and check it on desktop web, iOS, and Android.

## Gotchas

- **Domain approval:** X has historically allowlisted player-card domains. If the post only shows a link or summary card even though `check` passes, the domain likely needs approval.
- **Caching:** X caches card data per URL. After changing tags or the image, test with a new slug (or add a `?v=2` query string to the URL in the post).
- **No X session inside the iframe:** third-party cookies are blocked, so viewers are anonymous unless they sign in inside your app.
- **No mic or camera, and autoplay is muted only:** X controls the outer iframe's `allow` permissions.
- **Mobile apps can differ:** some clients show the image and open the player on tap, so make `image` worth tapping.

## Phase 2: live remote browser

To stream a real website the way makeportals does, point a portal's `embed` at a viewer page that:

1. Calls your session API to claim a seat (and queues when none is free),
2. Joins a LiveKit room to receive the remote Chromium's video track,
3. Sends pointer and keyboard input back over a LiveKit data channel, which a worker replays into Chromium via CDP,
4. Releases the seat on idle or close.

Nothing in the card or player layer changes. Only `embed` points somewhere new.
