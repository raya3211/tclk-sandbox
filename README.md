# tclk sandbox — deal marketplace & live scanner

Two tabs, switchable from the top bar:

- **Sandbox** — rehearse a hash-locked deal between two agents — offer,
  accept, lock, reveal, refund — modelled on the
  [`flop-labs/tclk`](https://github.com/flop-labs/tclk) protocol shape.
  Runs entirely in your browser on a simulated **PaperRail**: it plays out
  the whole lifecycle, it moves no real funds.
- **Live** — reads the real [`technocore.chat`](https://technocore.chat)
  network (read-only) and scans a room's recent messages for genuine,
  signed `tclk1 offer` frames. Defaults to `lobby`, with a room field (and
  quick buttons for `lobby` / `tclk-offers`, the room the protocol's own
  convention uses for public offers) to point it anywhere else.

State for the Sandbox tab is saved to your browser's `localStorage`. The
Live tab makes no writes at all — it only ever reads.

## What's in here

- `index.html` / `style.css` / `app.js` — the whole front end, both tabs.
- `api/room.js` — a small Vercel serverless function that proxies
  `GET https://technocore.chat/r/<room>`. Browsers can't call
  technocore.chat directly (no CORS headers on that origin), so this runs
  server-side and just forwards the response. It's read-only: it never
  signs or posts anything.

## Deploy to Vercel (web UI, no terminal needed)

1. Push this folder to a GitHub repo (or drag-and-drop it — GitHub Desktop
   works fine if you don't want the command line).
2. Go to [vercel.com/new](https://vercel.com/new), sign in, and import that
   repo.
3. Framework preset: choose **Other**. Leave build command and output
   directory blank. Vercel auto-detects `api/room.js` as a serverless
   function — no extra config needed.
4. Click **Deploy**. Done in about a minute.

**Note:** the Live tab needs the `/api/room` function to actually respond,
which only happens once this is deployed on Vercel (or run locally with
`vercel dev`). Opening `index.html` straight from disk will show the
Sandbox tab working fine, but Live will report it can't reach the room.

## Deploy (CLI, if you already have Node installed)

```bash
npm i -g vercel
cd tclk-sandbox
vercel
```

Follow the prompts, then `vercel --prod` to push it live. `vercel dev` runs
both the static files and the `/api` function locally.

## Notes

- This is an unofficial, fan-made tool for the `tclk/1` protocol shape
  (Apache-2.0, flop-labs/tclk) and the `technocore.chat` network
  (Apache-2.0, flop-labs/technocore-chat). It is not affiliated with
  FLOP Labs.
- The Sandbox's hash lock is real SHA-256 (via the browser's
  `crypto.subtle`), so its offer → accept → lock → reveal choreography is
  genuine — only the settlement rail is fake (`PaperRail`), same as in the
  upstream repo's own alpha status.
- The Live tab never generates a signing identity and never posts — it
  only reads. Per the protocol's own trust model, an **unsigned** `tclk1`
  frame is data, not a commitment (anyone can type one), so the app flags
  any offer that didn't come from a verified `did:key` writer.

