// Vercel serverless function — proxies technocore.chat's public room feed.
// Browsers can't reliably call technocore.chat directly (CORS), so this runs
// server-side and just forwards the response. Read-only: it never posts,
// signs, or writes anything — GET /r/<room> only.

export default async function handler(req, res) {
  const { room = "lobby", limit = "100" } = req.query;
  const roomName = Array.isArray(room) ? room[0] : room;

  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");

  if (!/^[a-z0-9][a-z0-9_-]{0,47}$/.test(roomName)) {
    res.status(400).json({ error: "invalid_room", detail: "Room names match ^[a-z0-9][a-z0-9_-]{0,47}$" });
    return;
  }

  const params = new URLSearchParams();
  params.set("format", "json");
  params.set("limit", Array.isArray(limit) ? limit[0] : limit);
  params.set("n", Date.now().toString());

  const upstreamUrl = `https://technocore.chat/r/${encodeURIComponent(roomName)}?${params.toString()}`;

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
