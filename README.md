# SCiPNET

A forum packaged as the SCP Foundation's internal personnel terminal — departments hold filed
documents, documents collect addenda, ratings replace likes, and every thread is minted a
sequential `SCP-XXXX` document number. Declassified-document aesthetic: paper substrate, carbon
ink, squared corners, IBM Plex Mono micro-labels, and a single hazard-red accent.

*Unofficial fan project — the SCP Foundation concept is a work of the SCP Wiki community (CC BY-SA 3.0).*

One Cloudflare Worker serves the whole site: the Vite/React SPA as static assets, the Hono JSON
API under `/api`, R2 object storage as the CDN under `/media`, and Web Push delivery.

## Features

- **Documents & addenda** — threads and replies rendered as Foundation documents; sequential
  `SCP-XXXX` numbers; ratings; `pinned`/`locked` flags affect ordering and block addenda
  (`403 thread_locked`); authors and Site Command (admins) may revise or expunge
- **Markdown (GFM)** — headings, lists, tables, code, quotes, task lists; single newlines preserved;
  raw HTML escaped; only `/media/*` URLs embed as images; live preview in both composers
- **Departments & clearance** — five departments; members may file only where `member_post` is set
  (Personnel Commons), Site Command may file anywhere — enforced server-side (`403 post_restricted`)
- **Passkey-gated enrollment** — first-time registration requires a WebAuthn ceremony before the
  personnel record is issued; afterwards sign in with passkey *or* ID + passphrase (PBKDF2)
- **Media pipeline** — in-browser crop (pan/zoom/rotate/aspect) → WebP q85 transcode → R2;
  Safari's missing WebP encoder is covered by a lazy-loaded WASM codec; server sniffs `RIFF…WEBP`
  magic, so the contract can't be bypassed
- **Push uplink** — Web Push with Apple's declarative payload (`web_push: 8030`); Safari/iOS renders
  natively, other browsers via the service-worker fallback; replies notify the filer and prior
  addendum authors, localized per subscription (EN/中文)
- **PWA** — installable ("Deploy terminal"), offline app shell, runtime-cached reads, push-capable
  service worker
- **i18n** — English and 中文 throughout, browser-detected, user-switchable
- **Two API surfaces** — `API.md` + OpenAPI 3.1 (`/api/openapi.json`, Scalar UI at `/api/docs`);
  in-app endpoint index at `/docs`

## Stack

| layer | tech |
|---|---|
| Frontend | Vite · TypeScript · React 19 · React Router · i18next (EN/中文) |
| Rendering | `react-markdown` + `remark-gfm` + `remark-breaks` |
| Media | `react-easy-crop` · `@jsquash/webp` (WASM fallback for WebKit) |
| PWA | `vite-plugin-pwa` (Workbox `generateSW` + `importScripts` push handler) |
| Backend | Hono on Cloudflare Workers (`@hono/zod-openapi`, zod v4) |
| Database | Cloudflare D1 (SQLite) — `migrations/` |
| CDN storage | Cloudflare R2 — avatars & attachments at `/media/*` |
| Push | Web Push — `@block65/webcrypto-web-push` (VAPID + RFC 8291, pure WebCrypto) |
| Auth | `@simplewebauthn/{server,browser}` · PBKDF2 passphrases · HttpOnly session cookie |
| Design | Declassified-document system in `src/index.css` · `DESIGN.md` |

## Configuration

`wrangler.jsonc` wires everything: custom-domain route, static assets (`dist/client` with SPA
fallback; `/api/*` + `/media/*` run the Worker first), the `DB` D1 binding, the `CDN` R2 binding.

| variable | where | purpose |
|---|---|---|
| `VAPID_PUBLIC_KEY` | `vars` | base64url uncompressed P-256 key — served at `GET /api/push/vapid` |
| `VAPID_SUBJECT` | `vars` | VAPID contact (`mailto:`) embedded in push JWTs |
| `VAPID_PRIVATE_KEY` | **secret** | `wrangler secret put VAPID_PRIVATE_KEY` — never committed |

Generate a fresh pair with:

```js
const k = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
// publicKey: 65-byte uncompressed point, base64url  →  vars.VAPID_PUBLIC_KEY
// privateKey: JWK d field, base64url                →  wrangler secret put VAPID_PRIVATE_KEY
```

## Develop

```bash
npm install
npm run db:migrate:local   # schema + baseline departments into local (miniflare) D1
npm run dev                # → http://localhost:5173
```

`npm run dev` runs the frontend and the Worker together via `@cloudflare/vite-plugin`, with
emulated D1/R2 state under `.wrangler/state`. `npm run check` typechecks both projects
(`tsconfig.app` + `tsconfig.worker`).

## Deploy

```bash
wrangler login                    # one-time OAuth
npm run db:create                 # creates agora-db, prints a database_id
npm run bucket:create             # creates the agora-cdn R2 bucket
npm run deploy                    # builds SPA + deploys the Worker
npm run db:migrate                # applies migrations/ to the remote DB
wrangler secret put VAPID_PRIVATE_KEY
```

Production is routed on the custom domain `forum.openhub.today` only (`workers_dev: false`).

## Architecture

```
browser ──► Cloudflare route (custom domain)
            ├─ /api/*, /media/* ──► Worker (Hono)
            │     ├─ /api/auth[/webauthn]  sessions, WebAuthn ceremonies (D1)
            │     ├─ /api/{categories,threads,replies,users,uploads,push}
            │     ├─ /media/{key}          R2 streaming (ETag, immutable, Range)
            │     ├─ /api/openapi.json     generated from route schemas
            │     └─ reply hook            waitUntil → pushToUsers → FCM/APNs/Mozilla
            └─ everything else ──► static assets (dist/client, SPA fallback to /)
```

Request flow notes:

- `attachUser` middleware resolves the `agora_session` cookie → `c.get('user')` for every `/api/*`
- Errors share `{ error: { code, message } }`; validation failures are `400 validation_error`
- Push delivery is fire-and-forget inside `executionCtx.waitUntil` — it can never fail a request;
  dead endpoints (404/410) are pruned from `push_subscriptions`
- The generated Workbox SW (`/sw.js`) imports `/push-handler.js` for `push`,
  `notificationclick`, and self-healing `pushsubscriptionchange` resubscription

## Data model (D1)

| migration | tables |
|---|---|
| `0001_init` | `users` · `sessions` · `categories` · `threads` · `replies` · `likes` |
| `0002_categories` | seeds the five baseline departments |
| `0003_webauthn` | `webauthn_credentials` · `webauthn_challenges` |
| `0004_category_posting` | `categories.member_post` flag |
| `0005_push` | `push_subscriptions` (endpoint UNIQUE, `lang`, user-agent, expiry) |

## Testing

`scripts/` holds Playwright-driven e2e checks (full Chromium, CDP virtual WebAuthn authenticator;
requires `LD_LIBRARY_PATH` pointing at bundled NSS libs in this environment):

| script | covers |
|---|---|
| `test-webauthn.cjs` | passkey registration + login ceremonies |
| `test-upload.cjs` | crop modal → WebP → R2 round-trip (`SAFARI=1` forces the WASM path) |
| `test-perms.cjs` | member vs. admin filing rights |
| `test-md.cjs` | Markdown rendering, preview, XSS escaping |
| `test-pwa.cjs` | SW registration, precache, offline navigation |
| `test-push.cjs` | real FCM subscribe → test/reply push → i18n → unsubscribe |

`dbg-*.cjs` are throwaway debug probes, not regression tests.

## Layout

```
index.html            SPA entry (PWA meta + theme tags)
vite.config.ts        React + cloudflare + VitePWA (manifest, workbox, importScripts)
wrangler.jsonc        Worker config — routes, assets, D1, R2, VAPID vars
shared/api-types.ts   contracts shared by worker and client

src/                  React app
  api.ts              fetch client (typed helpers incl. push)
  auth.tsx            session context
  push.ts             PushManager subscribe/unsubscribe, support detection
  pwa.ts              SW registration + install-prompt plumbing
  image.ts            crop→WebP encode pipeline (native + WASM fallback)
  webauthn.ts         ceremony helpers
  i18n/               en/zh resources — browser-detected, persisted
  pages/              Home Category Thread NewThread Profile SignIn Register Docs NotFound
  components/         Nav Footer PostBody ImageCrop Avatar ThreadRow TimeAgo Ui Pwa

worker/               Hono API
  index.ts            app wiring, OpenAPI doc, /api/docs (Scalar)
  auth.ts             attachUser middleware, sessions, PBKDF2
  push.ts             VAPID + RFC 8291 sender (declarative payload, pruning)
  media.ts            R2 → /media/* streaming
  routes/             auth webauthn categories threads replies users uploads push
  schemas.ts          zod/OpenAPI response shapes
  types.ts            Bindings + AppEnv

public/               icons, favicon, push-handler.js (SW import)
migrations/           D1 schema, applied in order
scripts/              e2e + icon generation + debug probes
```

## API

- `API.md` — human-readable reference
- `/api/openapi.json` — OpenAPI 3.1 spec (generated from route schemas)
- `/api/docs` — interactive reference (Scalar)
- `/docs` — in-app endpoint index (localized)

## License

Source code: [AGPL-3.0-only](LICENSE). The SCP Foundation setting and terminology belong to the
SCP Wiki community and remain under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) —
the license covers this codebase, not the fictional universe it references.
