# SCiPNET API

SCiPNET is a forum packaged after the SCP Foundation's internal personnel terminal — departments hold
filed documents (threads), documents collect addenda (replies), and ratings replace likes.
*Unofficial fan project; the SCP Foundation concept is a work of the SCP Wiki community (CC BY-SA 3.0).*

Base URL: same origin as the site. All endpoints live under `/api`. Media objects live under `/media`.

Machine-readable spec: [`GET /api/openapi.json`](/api/openapi.json) (OpenAPI 3.1).
Interactive reference: [`GET /api/docs`](/api/docs).

## Conventions

- **Auth** — cookie-based. `POST /api/auth/register`, `/api/auth/login`, or `/api/auth/webauthn/login/verify` sets an
  `agora_session` HttpOnly cookie (`SameSite=Lax`, `Secure` on HTTPS, 30-day expiry). Send it on every request.
- **Passkeys** — registration is gated on WebAuthn: a personnel record cannot be created until a clearance
  credential ceremony has been verified. Afterwards members sign in with their passkey **or** their ID + passphrase.
- **Format** — JSON in, JSON out. Uploads are `multipart/form-data`.
- **IDs** — UUID strings. **Timestamps** — unix epoch milliseconds.
- **Errors** — every non-2xx response is:

  ```json
  { "error": { "code": "not_found", "message": "Thread not found." } }
  ```

  | code | status | meaning |
  |---|---|---|
  | `validation_error` | 400 | Request body/query failed schema validation |
  | `unauthorized` | 401 | No valid session |
  | `forbidden` | 403 | Session valid, not permitted (e.g. editing another user's post) |
  | `not_found` | 404 | Resource does not exist |
  | `username_taken` | 409 | Registration conflict |
  | `passkey_required` | 400 | `register` called without a verified WebAuthn ceremony token |
  | `passkey_expired` | 400 | Ceremony token expired (10-minute window) |
  | `passkey_invalid` | 400 | Attestation/assertion failed verification |
  | `thread_locked` | 403 | Replies disabled on the thread |
  | `too_large` | 413 | Upload exceeds 5 MB |
  | `unsupported_media` | 415 | Upload MIME type not in the allowlist |

- **Pagination** — list endpoints accept `?page` (default `1`) and `?limit` (default `20`, max `50`) and return:

  ```json
  { "data": [ … ], "page": 1, "perPage": 20, "total": 137, "totalPages": 7 }
  ```

## Auth

### `POST /api/auth/register`

```json
{ "username": "linus", "displayName": "Linus T.", "password": "correct horse battery", "webauthnToken": "1a2b…" }
```

- `username` — 3–24 chars, `[A-Za-z0-9_-]`, case-insensitive unique. **Required.**
- `displayName` — 1–50 chars; defaults to `username`. Optional.
- `password` — 8–72 chars, stored as PBKDF2-SHA256 (100k iterations). **Required.**
- `webauthnToken` — token from a **verified** passkey ceremony (see below). **Required.**

→ `201 { "user": PublicUser }` + session cookie. `409 username_taken` · `400 passkey_required` / `passkey_expired` /
`passkey_invalid` (e.g. the passkey is already bound to another account).

### Passkey ceremonies (WebAuthn)

All four endpoints return/accept JSON. Ceremony tokens expire after **10 minutes** and are single-use.
The `options` payloads are `PublicKeyCredentialCreationOptions` / `PublicKeyCredentialRequestOptions` — feed them
straight to `navigator.credentials.create()` / `.get()` or `@simplewebauthn/browser`'s `startRegistration()` /
`startAuthentication()`, then POST the resulting credential back as `response`.

#### `POST /api/auth/webauthn/register/options`

_No body._ → `200 { "token", "options" }`. Starts the mandatory pre-signup ceremony.

#### `POST /api/auth/webauthn/register/verify`

```json
{ "token": "…", "response": { "id": "…", "rawId": "…", "type": "public-key", "response": { … } } }
```

Verifies the attestation and holds the credential against the token. → `200 { "ok": true }`.

#### `POST /api/auth/webauthn/login/options`

```json
{ "username": "linus" }
```

`username` optional — with it, the prompt is scoped to that member's passkeys; without it, the browser offers any
discoverable passkey for the site. → `200 { "token", "options" }`.

#### `POST /api/auth/webauthn/login/verify`

```json
{ "token": "…", "response": { "id": "…", "rawId": "…", "type": "public-key", "response": { … } } }
```

Verifies the assertion, bumps the credential counter. → `200 { "user": PublicUser }` + session cookie.

### `POST /api/auth/login`

```json
{ "username": "linus", "password": "correct horse battery" }
```

→ `200 { "user": PublicUser }` + session cookie. `401` `invalid_credentials` on failure.

### `POST /api/auth/logout`

Destroys the session and clears the cookie. → `204`. Safe when signed out.

### `GET /api/auth/me`

→ `200 { "user": PublicUser }` or `401`.

### `PATCH /api/auth/me` *(auth)*

```json
{ "displayName": "Linus Torvalds", "bio": "Benevolent dictator." }
```

→ `200 { "user": PublicUser }`.

## Categories

### `GET /api/categories`

→ `200 { "categories": Category[] }` — ordered by `sort_order`, each with a live `threadCount`.

### `GET /api/categories/{slug}`

→ `200 { "category": Category }` or `404`.

## Threads

### `GET /api/threads`

| param | default | notes |
|---|---|---|
| `category` | — | filter by category slug |
| `q` | — | substring search over title and body |
| `sort` | `new` | `new` = recent activity · `top` = most liked |
| `page`, `limit` | `1`, `20` | pagination |

→ `200 Page<ThreadSummary>`. Pinned threads always sort first. `likedByMe` reflects the session user.

### `POST /api/threads` *(auth)*

```json
{ "categorySlug": "engineering", "title": "SQLite at the edge", "body": "Notes…" }
```

- `title` ≤ 140 chars, `body` ≤ 20 000 chars.
- `body` is rendered as Markdown (GFM: headings, lists, code, quotes, tables, autolinks).
  Single newlines become line breaks. Raw HTML is not rendered — it is escaped.
  A bare `/media/…` URL on its own line embeds an image; `![](/media/…)` works too.
- **Posting permissions:** members may only file in departments where `category.memberPost`
  is `true` (currently `general` — Personnel Commons). Filing elsewhere returns
  `403 post_restricted`. Admins (Site Command) may file anywhere.

→ `201 { "thread": Thread }`. `403` for restricted departments, `404` if the category does not exist.

### `GET /api/threads/{id}`

→ `200 { "thread": Thread }` (summary + `body`).

### `PATCH /api/threads/{id}` *(auth, author or admin)*

```json
{ "title": "…", "body": "…" }
```

Either field optional. Bumps `updated_at`. → `200 { "thread": Thread }`.

### `DELETE /api/threads/{id}` *(auth, author or admin)*

Deletes the thread, its replies and its likes atomically. → `204`.

### `POST /api/threads/{id}/like` *(auth)*

Toggles the caller's like. → `200 { "liked": true, "likeCount": 13 }`.

## Replies

### `GET /api/threads/{id}/replies`

→ `200 Page<Reply>`, oldest first.

### `POST /api/threads/{id}/replies` *(auth)*

```json
{ "body": "Counterpoint worth defending: …" }
```

`body` ≤ 10 000 chars. Increments `reply_count` and bumps the thread's `updated_at` in one transaction.
→ `201 { "reply": Reply }`. `403 thread_locked` if locked.

### `DELETE /api/replies/{id}` *(auth, author or admin)*

→ `204`. Decrements the parent thread's `reply_count`.

## Users

### `GET /api/users/{username}`

→ `200 { "user": UserProfile }` — public profile plus `threadCount`/`replyCount`. `404` otherwise.

### `GET /api/users/{username}/threads`

→ `200 Page<ThreadSummary>`, newest first.

## Uploads → R2 CDN

Both endpoints are `multipart/form-data` with a single **`file`** field.
**WebP only**, max size **5 MB** — the first 12 bytes must match the `RIFF…WEBP` signature.
The web client transcodes any image (PNG/JPEG/GIF/AVIF/SVG…) to WebP at **quality 85** before
uploading; third-party clients must do the same. Non-WebP uploads get `415 unsupported_media`.
Objects are stored under `avatars/{userId}/{uuid}.webp` / `attachments/{uuid}.webp`
and served immutable at `/media/{key}`.

### `POST /api/uploads/avatar` *(auth)*

Stores the image and sets it as the caller's avatar. → `200 UploadResult`.

### `POST /api/uploads/attachment` *(auth)*

→ `201 UploadResult`:

```json
{ "key": "attachments/9b1d…e.webp", "url": "/media/attachments/9b1d…e.webp", "contentType": "image/webp", "size": 102318 }
```

### `GET /media/{key}`

Streams the R2 object with its stored `Content-Type`, an `ETag`, and `Cache-Control: public, max-age=31536000, immutable`.
Honours `If-None-Match` (304) and single `Range` requests (206).

## Push uplink — Web Push (Apple declarative payload)

Web Push notifications, dispatched when an **addendum is appended to a document you filed or
contributed an addendum to** (the author of the new addendum is excluded). Payloads use Apple's
declarative push format — Safari/iOS displays them natively:

```json
{ "web_push": 8030, "notification": { "title": "SCiPNET · SCP-0007 addendum",
  "body": "Seven: report received.", "navigate": "https://<host>/t/<threadId>",
  "tag": "addendum-<threadId>" } }
```

Other browsers receive the same JSON in the service worker, which calls `showNotification`.
The `lang` stored per subscription selects an English or 中文 payload; dead endpoints (404/410)
are pruned automatically. Delivery is asynchronous (`waitUntil`) — push failures never fail the
originating request.

### `GET /api/push/vapid`

→ `200 { publicKey: string | null }` — the base64url uncompressed P-256 VAPID key.
Pass it to `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`
(after base64url→`Uint8Array`). `null` = push is not configured on this deployment.

### `PUT /api/push/subscriptions` *(auth)*

Registers or refreshes a subscription. `endpoint` is unique — re-subscribing an existing
endpoint atomically replaces its owner/keys/lang (browser key rotation safe).

```json
{ "endpoint": "https://push.example/x", "expirationTime": null,
  "keys": { "p256dh": "…", "auth": "…" }, "lang": "en" | "zh" }
```

→ `200 { ok: true }` · `400 validation_error` · `401 unauthorized`

### `DELETE /api/push/subscriptions` *(auth)*

`{ "endpoint": "…" }` — removes the caller's subscription. → `204`

### `POST /api/push/test` *(auth)*

Sends a link-test notification to all of the caller's subscriptions.
→ `200 { sent: number, pruned: number }`

## Shapes

```ts
PublicUser   { id, username, displayName, avatarUrl | null, bio, role: "member" | "admin", createdAt }
Category     { id, slug, name, description, threadCount }
ThreadSummary{ id, docNum, title, excerpt, author: PublicUser, category: { slug, name },
               pinned, locked, replyCount, likeCount, likedByMe, createdAt, updatedAt }
               // docNum = sequential document number; rendered as "SCP-0007" in the UI
Thread       ThreadSummary + { body }
Reply        { id, threadId, author: PublicUser, body, createdAt }
UserProfile  PublicUser + { threadCount, replyCount }
UploadResult { key, url, contentType, size }
Page<T>      { data: T[], page, perPage, total, totalPages }
```

## Example

```bash
# sign in with a password (registration itself needs the passkey ceremony in a browser)
curl -c jar.txt -X POST https://<host>/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"linus","password":"correct horse battery"}'

# create a thread
curl -b jar.txt -X POST https://<host>/api/threads \
  -H 'Content-Type: application/json' \
  -d '{"categorySlug":"engineering","title":"Field notes — Sector-7","body":"First report."}'

# upload an attachment (must already be WebP — `cwebp -q 85 diagram.png -o diagram.webp`)
curl -b jar.txt -X POST https://<host>/api/uploads/attachment -F 'file=@diagram.webp'
```
