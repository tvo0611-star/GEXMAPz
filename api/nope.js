// api/nope.js
// NOPE (Net Options Pricing Effect) endpoint for GEXMAPz
// Vercel serverless function — drop into /api alongside your existing GEX endpoint.
//
// NOPE = SCALE * (net delta-weighted options volume) / underlying share volume
//   - Call deltas are positive, put deltas are negative, so a simple
//     sum of (delta * volume) nets out automatically.
//   - Lily's published EOD values ran roughly -100..+100 on SPY; the "free NOPE"
//     site clearly uses a different scale (hundreds). Calibrate SCALE /
//     CONTRACT_MULTIPLIER against reference days before trusting thresholds.
//
// Usage:
//   GET /api/nope?ticker=SPY              -> nearest 5 expirations (default)
//   GET /api/nope?ticker=SPY&exps=3       -> nearest 3 expirations
//   GET /api/nope?ticker=SPY&exps=all     -> entire chain (slow, rate-limit heavy)
//
// Env: TRADIER_TOKEN (same as VITE_TRADIER_TOKEN in the frontend .env, but
//      without the VITE_ prefix for server-side access)

const TRADIER_BASE = "https://api.tradier.com/v1";

// --- Tuning knobs ---------------------------------------------------------
const DEFAULT_EXPIRATIONS = 5;   // 0DTE/near-dated flow dominates SPY anyway
const SCALE = 10000;             // Lily's published scaling factor
const CONTRACT_MULTIPLIER = 1;   // set to 100 to convert contracts -> share-equivalents
// ---------------------------------------------------------------------------

async function tradierGet(path, params, token) {
  const url = `${TRADIER_BASE}${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Tradier ${path} failed (${res.status}): ${body.slice(0, 200)}`);
  }
  return res.json();
}

export default async function handler(req, res) {
  const token = process.env.TRADIER_TOKEN || process.env.TRADIER_API_KEY;
  if (!token) {
    return res.status(500).json({ error: "Missing TRADIER_TOKEN env var" });
  }

  const ticker = (req.query.ticker || "SPY").toUpperCase();
  const expsParam = req.query.exps || String(DEFAULT_EXPIRATIONS);

  try {
    // 1) Underlying quote — need today's share volume (and price for context)
    const quoteData = await tradierGet("/markets/quotes", { symbols: ticker }, token);
    const quote = quoteData?.quotes?.quote;
    if (!quote || !quote.volume) {
      return res.status(502).json({ error: `No quote/volume for ${ticker}` });
    }
    const shareVolume = quote.volume;

    // 2) Expiration list
    const expData = await tradierGet(
      "/markets/options/expirations",
      { symbol: ticker, includeAllRoots: "true" },
      token
    );
    let expirations = expData?.expirations?.date || [];
    if (!Array.isArray(expirations)) expirations = [expirations];
    if (expirations.length === 0) {
      return res.status(502).json({ error: `No expirations for ${ticker}` });
    }
    if (expsParam !== "all") {
      expirations = expirations.slice(0, parseInt(expsParam, 10) || DEFAULT_EXPIRATIONS);
    }

    // 3) Pull chains with greeks, sum delta * volume
    //    Sequential fetch keeps you friendly with Tradier's rate limits;
    //    switch to Promise.all if you're well under your request budget.
    let netDeltaVolume = 0;   // signed: calls add, puts subtract (delta is negative)
    let callDeltaVolume = 0;
    let putDeltaVolume = 0;   // stored as positive magnitude for reporting
    let contractsCounted = 0;
    const perExpiration = [];

    for (const exp of expirations) {
      const chainData = await tradierGet(
        "/markets/options/chains",
        { symbol: ticker, expiration: exp, greeks: "true" },
        token
      );
      let options = chainData?.options?.option || [];
      if (!Array.isArray(options)) options = [options];

      let expNet = 0;
      for (const opt of options) {
        const vol = opt.volume || 0;
        const delta = opt.greeks?.delta;
        if (!vol || delta == null) continue;

        const weighted = delta * vol * CONTRACT_MULTIPLIER;
        expNet += weighted;
        netDeltaVolume += weighted;
        if (opt.option_type === "call") callDeltaVolume += weighted;
        else putDeltaVolume += Math.abs(weighted);
        contractsCounted++;
      }
      perExpiration.push({ expiration: exp, netDeltaVolume: round2(expNet) });
    }

    const nope = (netDeltaVolume / shareVolume) * SCALE;

    // Light caching — NOPE only needs ~1min granularity
    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

    return res.status(200).json({
      ticker,
      timestamp: new Date().toISOString(),
      nope: round2(nope),
      components: {
        netDeltaVolume: round2(netDeltaVolume),
        callDeltaVolume: round2(callDeltaVolume),
        putDeltaVolume: round2(putDeltaVolume),
        shareVolume,
        contractsCounted,
        expirationsUsed: expirations,
        perExpiration,
      },
      meta: {
        scale: SCALE,
        contractMultiplier: CONTRACT_MULTIPLIER,
        note: "Calibrate SCALE/CONTRACT_MULTIPLIER before comparing to published NOPE thresholds.",
      },
      underlying: {
        last: quote.last,
        changePct: quote.change_percentage,
      },
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}

function round2(n) {
  return Math.round(n * 100) / 100;
}
