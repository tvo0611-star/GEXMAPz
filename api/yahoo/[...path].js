export default async function handler(req, res) {
  const segments = req.query.path ?? [];
  const yahoPath = Array.isArray(segments) ? segments.join("/") : segments;

  const params = new URLSearchParams();
  for (const [key, val] of Object.entries(req.query)) {
    if (key === "path") continue;
    params.set(key, val);
  }

  const qs = params.toString();
  const path = `${yahoPath}${qs ? "?" + qs : ""}`;

  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Origin": "https://finance.yahoo.com",
    "Referer": "https://finance.yahoo.com/",
  };

  // Try query1 first, fall back to query2
  const urls = [
    `https://query1.finance.yahoo.com/${path}`,
    `https://query2.finance.yahoo.com/${path}`,
  ];

  for (const url of urls) {
    try {
      const upstream = await fetch(url, { headers });
      if (!upstream.ok) continue;
      const body = await upstream.text();
      res
        .status(200)
        .setHeader("Content-Type", "application/json")
        .setHeader("Cache-Control", "no-store")
        .send(body);
      return;
    } catch {
      continue;
    }
  }

  res.status(502).json({ error: "Yahoo Finance unavailable" });
}
