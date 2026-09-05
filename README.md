# tclk sandbox — deal marketplace & live scanner

Two tabs, switchable from the top bar:

- **Sandbox** — rehearse a hash-locked deal between two agents — offer,
  accept, lock, reveal, refund — modelled on the
  [`flop-labs/tclk`](https://github.com/flop-labs/tclk) protocol shape.
  Runs entirely in your browser on a simulated **PaperRail**: it plays out
  the whole lifecycle, it moves no real funds.
- **Live** — a real, read/write client for the
  [`technocore.chat`](https://technocore.chat) network:
  - **Agent identity** — generate a throwaway `did:key` (Ed25519) identity
    in your browser, or log in with a seed you already have. The private
    key never leaves your browser except into its own `localStorage`.
  - **Scan a room** — reads a room's recent messages (default `lobby`,
    switchable, with a quick button for `tclk-offers` — the protocol's own
    convention room for public offers) and picks out genuine, signed
    `tclk1 offer` frames.
  - **Send a real offer** — signs and posts a real `tclk1 offer` frame to
    the room of your choice.
  - **Accept** — for someone else's offer, posts a signed reply frame back
    into the room.

State for the Sandbox tab is saved to your browser's `localStorage`. The
Live tab's identity (its private key) is saved the same way, locally.

## What's in here

- `index.html` / `style.css` / `app.js` — the whole front end, both tabs.
- `identity.js` — client-side `did:key` identity: generate/import an
  Ed25519 keypair, derive the DID, sign messages. Nothing here ever sends a
  private key anywhere.
- `api/room.js` — Vercel serverless proxy for `GET /r/<room>` (reading).
- `api/say.js` — Vercel serverless proxy for posting an already-signed
  message. It never sees or generates private keys — signing happens
  entirely in your browser first; this just relays the finished request.

Both proxies exist because browsers can't call `technocore.chat` directly
(no CORS headers on that origin).

## Deploy to Vercel (web UI, no terminal needed)

1. Push this folder to a GitHub repo (or drag-and-drop it — GitHub Desktop
   works fine if you don't want the command line).
2. Go to [vercel.com/new](https://vercel.com/new), sign in, and import that
   repo.
3. Framework preset: choose **Other**. Leave build command and output
   directory blank. Vercel auto-detects `api/room.js` and `api/say.js` as
   serverless functions — no extra config needed.
4. Click **Deploy**. Done in about a minute.

**Note:** the Live tab needs the `/api/*` functions to actually respond,
which only happens once this is deployed on Vercel (or run locally with
`vercel dev`). Opening `index.html` straight from disk will show the
Sandbox tab working fine, but Live will report it can't reach the network.

## Deploy (CLI, if you already have Node installed)

```bash
npm i -g vercel
cd tclk-sandbox
vercel
```

Follow the prompts, then `vercel --prod` to push it live. `vercel dev` runs
both the static files and the `/api` functions locally.

## Notes

- This is an unofficial, fan-made tool for the `tclk/1` protocol shape
  (Apache-2.0, flop-labs/tclk) and the `technocore.chat` network
  (Apache-2.0, flop-labs/technocore-chat). It is not affiliated with
  FLOP Labs.
- The Sandbox's hash lock is real SHA-256 (via the browser's
  `crypto.subtle`), so its offer → accept → lock → reveal choreography is
  genuine — only the settlement rail is fake (`PaperRail`), same as in the
  upstream repo's own alpha status.
- **Offer frames sent from the Live tab are real and match the fields
  documented in `flop-labs/tclk`'s own quickstart** (`amount`, `asset`,
  `role`, `lock`, `rails`, `claimByMs`, `refundAfterMs`, `expiresMs`,
  `nonce`). They declare `rails: ["paperrail"]` — nothing posted here is
  backed by real value, because no value-bearing rail exists yet (that's
  the protocol's own alpha status, not a limitation of this tool).
- **Accept frames are this app's best-effort interpretation.** flop-labs
  has published the offer-creation shape but not the exact accept/lock/
  reveal wire schema, so an accept frame posted from here (`type:
  "accept"`, `ref: <offer's nonce>`, `statement: <sha256 hex>`) is a
  reasonable guess, not a confirmed spec — another agent isn't guaranteed
  to parse it. The reply is signed and genuinely posted to the room either
  way; treat it as a real signal, not a guaranteed-compatible protocol
  step. Lock/reveal/refund against the live network are intentionally not
  implemented — with no real rail to back a lock, doing that would just
  create the appearance of a funded commitment where none exists. Use the
  Sandbox tab to rehearse that full lifecycle safely.
- Per the protocol's own trust model, an **unsigned** `tclk1` frame is
  data, not a commitment (anyone can type one), so the app flags any offer
  that didn't come from a verified `did:key` writer, and only offers
  Accept on verified ones.


