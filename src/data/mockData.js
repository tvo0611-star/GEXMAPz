// ─────────────────────────────────────────────────────────────────────────────
// TRADIER DATA LAYER
// Swap TRADIER_TOKEN below with your API token from developer.tradier.com
// ─────────────────────────────────────────────────────────────────────────────

const TRADIER_TOKEN = import.meta.env.VITE_TRADIER_TOKEN;
const BASE_URL = "https://api.tradier.com";

const headers = {
  Authorization: `Bearer ${TRADIER_TOKEN}`,
  Accept: "application/json",
};

async function tradierGet(path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers });
  if (!res.ok) throw new Error(`Tradier ${res.status}: ${path}`);
  return res.json();
}

// ─── QUOTE ───────────────────────────────────────────────────────────────────
export async function fetchQuote(ticker) {
  const data = await tradierGet(`/v1/markets/quotes?symbols=${ticker}&greeks=false`);
  const q = data.quotes?.quote;
  if (!q) throw new Error(`No quote for ${ticker}`);

  return {
    ticker: q.symbol,
    price: q.last ?? q.close ?? 0,
    change: q.change ?? 0,
    changePct: q.change_percentage ?? 0,
    iv30: 0.25,
    hv30: 0.20,
  };
}

// ─── EXPIRATIONS ─────────────────────────────────────────────────────────────
export async function fetchExpirations(ticker) {
  const data = await tradierGet(`/v1/markets/options/expirations?symbol=${ticker}&includeAllRoots=true`);
  const exps = data.expirations?.date ?? [];
  return Array.isArray(exps) ? exps : [exps];
}

// ─── OPTIONS CHAIN ───────────────────────────────────────────────────────────
export async function fetchChain(ticker, expiration, price = 0, rangeMultiplier = 0.1) {
  const data = await tradierGet(
    `/v1/markets/options/chains?symbol=${ticker}&expiration=${expiration}&greeks=true`
  );
  const options = data.options?.option ?? [];
  const list = Array.isArray(options) ? options : [options];

  const today = new Date();
  const expDate = new Date(expiration);
  const dte = Math.max(0, Math.round((expDate - today) / 86400000));

  const map = (o) => ({
    strike: o.strike,
    bid: o.bid ?? 0,
    ask: o.ask ?? 0,
    mid: parseFloat((((o.bid ?? 0) + (o.ask ?? 0)) / 2).toFixed(2)),
    iv: o.greeks?.mid_iv ?? 0,
    delta: o.greeks?.delta ?? 0,
    gamma: o.greeks?.gamma ?? 0,
    theta: o.greeks?.theta ?? 0,
    vega: o.greeks?.vega ?? 0,
    oi: o.open_interest ?? 0,
    volume: o.volume ?? 0,
  });

  const shouldFilterByPrice = price > 0;
  const lowerBound = price * (1 - rangeMultiplier);
  const upperBound = price * (1 + rangeMultiplier);
  const filterByPrice = (o) => !shouldFilterByPrice || (o.strike >= lowerBound && o.strike <= upperBound);

  const calls = list.filter((o) => o.option_type === "call" && filterByPrice(o)).map(map);
  const puts = list.filter((o) => o.option_type === "put" && filterByPrice(o)).map(map);

  return { calls, puts, dte, expiration };
}

// ─── GEX MATRIX (multi-expiration heatmap) ───────────────────────────────────
export async function fetchGEXMatrix(ticker, price) {
  const allExps = await fetchExpirations(ticker);
  const expirations = allExps.slice(0, 12);

  const chains = await Promise.all(
    expirations.map((exp) =>
      fetchChain(ticker, exp).catch(() => null)
    )
  );

  const callOIByStrike = {};
  const putOIByStrike = {};
  const strikeSet = new Set();

  chains.forEach((chain) => {
    if (!chain) return;
    chain.calls.forEach((o) => {
      strikeSet.add(o.strike);
      callOIByStrike[o.strike] = (callOIByStrike[o.strike] ?? 0) + o.oi;
    });
    chain.puts.forEach((o) => {
      strikeSet.add(o.strike);
      putOIByStrike[o.strike] = (putOIByStrike[o.strike] ?? 0) + o.oi;
    });
  });

  // Hard cap: ±40% from spot
  const hardLower = price * 0.60;
  const hardUpper = price * 1.40;
  const inRange = [...strikeSet].filter((s) => s >= hardLower && s <= hardUpper);

  // OI-based filter: only show strikes with at least 2% of peak total OI
  const totalOI = (s) => (callOIByStrike[s] ?? 0) + (putOIByStrike[s] ?? 0);
  const maxOI = Math.max(...inRange.map(totalOI), 1);
  let strikes = inRange.filter((s) => totalOI(s) >= maxOI * 0.02).sort((a, b) => b - a);

  // Fallback: if too few strikes pass, loosen threshold to 0.5% within ±20%
  if (strikes.length < 8) {
    const fallbackRange = inRange.filter((s) => s >= price * 0.8 && s <= price * 1.2);
    const fallbackMax = Math.max(...fallbackRange.map(totalOI), 1);
    strikes = fallbackRange.filter((s) => totalOI(s) >= fallbackMax * 0.005).sort((a, b) => b - a);
  }

  const today = new Date().toISOString().split("T")[0];
  const todayIndex = expirations.indexOf(today);
  const todayChain = todayIndex >= 0 ? chains[todayIndex] : null;

  const topStrikes = (items, limit = 3) =>
    [...(items ?? [])]
      .sort((a, b) => (b.oi ?? 0) - (a.oi ?? 0))
      .slice(0, limit)
      .map((item) => ({ strike: item.strike, oi: item.oi ?? 0 }));

  const callWalls = todayChain ? topStrikes(todayChain.calls) : [];
  const putWalls = todayChain ? topStrikes(todayChain.puts) : [];

  const maxPain = strikes.reduce((best, strike) => {
    const pain = strikes.reduce((sum, s) => {
      if (s > strike) return sum + (callOIByStrike[s] ?? 0) * s * 100;
      if (s < strike) return sum + (putOIByStrike[s] ?? 0) * s * 100;
      return sum;
    }, 0);
    return best === null || pain < best.pain ? { strike, pain } : best;
  }, null)?.strike ?? null;

  const cells = {};
  strikes.forEach((strike) => {
    cells[strike] = {};
    expirations.forEach((exp, i) => {
      const chain = chains[i];
      if (!chain) {
        cells[strike][exp] = { gex: 0, callOI: 0, putOI: 0 };
        return;
      }

      const call = chain.calls.find((o) => o.strike === strike);
      const put = chain.puts.find((o) => o.strike === strike);

      const callOI = call?.oi ?? 0;
      const putOI = put?.oi ?? 0;
      const callGEX = call ? call.gamma * callOI * price * price * 0.01 : 0;
      const putGEX = put ? put.gamma * putOI * price * price * 0.01 : 0;
      const gex = parseFloat((callGEX - putGEX).toFixed(0));

      cells[strike][exp] = { gex, callOI, putOI, callIV: call?.iv ?? 0, putIV: put?.iv ?? 0 };
    });
  });

  return { strikes, expirations, cells, callWalls, putWalls, maxPain };
}

// ─── 0DTE POSITIONS ──────────────────────────────────────────────────────────
export async function fetchZeroDTEPositions() {
  return [];
}
