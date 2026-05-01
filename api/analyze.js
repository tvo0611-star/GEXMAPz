export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in environment" });

  const {
    ticker, price, flipPoint, callWalls, putWalls, maxPain,
    kingStrike, kingGex, netGex, topPositiveFlow, topNegativeFlow,
  } = req.body;

  const prompt = `You are a professional options gamma exposure (GEX) analyst. Analyze the data below and write a sharp, 3-4 sentence trading analysis for ${ticker}. Focus on: what the gamma environment means for price behavior today, the most important levels to watch, and any notable flow signals. Use specific dollar levels. Be direct and actionable — no filler.

${ticker} @ $${Number(price).toFixed(2)}
Gamma flip: ${flipPoint ? `$${flipPoint} — price is ${price > flipPoint ? `$${(price - flipPoint).toFixed(0)} ABOVE flip (positive gamma regime, moves dampened)` : `$${(flipPoint - price).toFixed(0)} BELOW flip (negative gamma regime, moves amplified)`}` : "not identified"}
Net GEX: ${netGex} — dealers are ${netGex > 0 ? "LONG gamma (mean-revert tendency, volatility suppressed)" : "SHORT gamma (trending tendency, volatility amplified)"}
King node (dominant strike): $${kingStrike} with ${kingGex} total GEX
Call walls (0DTE top OI): ${callWalls?.slice(0, 3).map((w) => `$${w.strike}`).join(", ") || "none"}
Put walls (0DTE top OI): ${putWalls?.slice(0, 3).map((w) => `$${w.strike}`).join(", ") || "none"}
Max pain: ${maxPain ? `$${maxPain}` : "N/A"}
${topPositiveFlow ? `Strongest call flow today: ${topPositiveFlow}` : ""}
${topNegativeFlow ? `Strongest put flow today: ${topNegativeFlow}` : ""}`;

  try {
    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 400,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!upstream.ok) {
      const err = await upstream.text();
      return res.status(upstream.status).json({ error: err });
    }

    const data = await upstream.json();
    res.status(200).json({ analysis: data.content[0].text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
