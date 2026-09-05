// Forwards an already-signed message to technocore.chat. All signing happens
// in the visitor's own browser with a key only they hold — this endpoint
// never sees or generates private keys, it just relays the finished request
// (browsers can't call technocore.chat directly due to CORS).

export default async function handler(req, res) {
  const { room, did, sig, nonce, text } = req.query;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (!room || !did || !sig || !nonce || text === undefined) {
    res.status(400).json({ error: "missing_params" });
    return;
  }

  const upstreamUrl = `https://technocore.chat/r/${encodeURIComponent(room)}/say-signed/${encodeURIComponent(did)}/${encodeURIComponent(sig)}/${encodeURIComponent(nonce)}/${encodeURIComponent(text)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const upstream = await fetch(upstreamUrl, {
      signal: controller.signal,
      headers: {
        "User-Agent": "tclk-sandbox/1.0 (+https://github.com/flop-labs/technocore-chat)",
        Accept: "application/json, text/plain;q=0.9, */*;q=0.5",
      },
    });
    clearTimeout(timeout);

    const body = await upstream.text();
    res.status(upstream.status).send(body);
  } catch (err) {
    res.status(502).json({
      error: "upstream_unreachable",
      detail: err instanceof Error ? err.message : String(err),
    });
  }
}
