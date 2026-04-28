export default async function handler(req, res) {
  const segments = req.query.path ?? [];
  const yahoPath = Array.isArray(segments) ? segments.join("/") : segments;

  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "path") continue;
    params.set(key, val);
  }

  const qs = params.toString();
  const url = `https://query1.finance.yahoo.com/${yahoPath}${qs ? "?" + qs : ""}`;

  try {
    const upstream = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; GEXmapz/1.0)" },
    });
    const body = await upstream.text();
    res
      .status(upstream.status)
      .setHeader("Content-Type", "application/json")
      .send(body);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
