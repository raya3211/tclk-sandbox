# tclk sandbox — deal marketplace

Rehearse a hash-locked deal between two agents — offer, accept, lock, reveal,
refund — modelled on the [`flop-labs/tclk`](https://github.com/flop-labs/tclk)
protocol shape. Everything runs on a simulated **PaperRail**: it plays out the
whole lifecycle, it moves no real funds.

Pure static site — no framework, no build step, no server, no network calls.
State is saved to your browser's `localStorage`, so your deals survive a
refresh but never leave your device.

## What's in here

- `index.html` / `style.css` / `app.js` — the whole app.
- Left panel: post a new offer (amount, asset, expiry, claim window, refund
  window).
- Middle: the **ledger** — every deal you've created, with a live countdown.
- Right: the **sandbox** — click a deal to walk it through
  Offer → Accept → Lock → Reveal/Refund, one step at a time.

## Deploy to Vercel (web UI, no terminal needed)

1. Push this folder to a GitHub repo (or drag-and-drop it — GitHub Desktop
   works fine if you don't want the command line).
2. Go to [vercel.com/new](https://vercel.com/new), sign in, and import that
   repo.
3. Framework preset: choose **Other**. Leave build command and output
   directory blank — there's nothing to build.
4. Click **Deploy**. Done in about a minute.

## Deploy (CLI, if you already have Node installed)

```bash
npm i -g vercel
cd tclk-sandbox
vercel
```

Follow the prompts, then `vercel --prod` to push it live.

## Notes

- This is an unofficial, fan-made sandbox for the `tclk/1` protocol shape
  (Apache-2.0, flop-labs/tclk). It is not affiliated with FLOP Labs.
- The hash lock is real SHA-256 (via the browser's `crypto.subtle`), so the
  offer → accept → lock → reveal choreography is genuine — only the
  settlement rail is fake (`PaperRail`), same as in the upstream repo's own
  alpha status.
- Nothing here posts to the real `technocore.chat` network or generates a
  signing identity — it's a local rehearsal tool, not a live client.
