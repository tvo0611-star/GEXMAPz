export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "ANTHROPIC_API_KEY not set in environment" });

  const {
    ticker, price, flipPoint, callWalls, putWalls, maxPain,
    kingStrike, kingGex, netGex, negGexDepth, totalCharmBias,
    topPositiveFlow, topNegativeFlow, topPositiveVanna, topNegativeVanna,
  } = req.body;

  const p = Number(price);
  const flip = Number(flipPoint);
  const aboveFlip = flip && p > flip;
  const distFromFlip = flip ? Math.abs(p - flip).toFixed(0) : null;

  const fmt = (n) => {
    const abs = Math.abs(n);
    const sign = n < 0 ? "-" : "+";
    if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
    return `${sign}${Math.round(abs)}`;
  };

  const prompt = `You are a gamma-exposure trading coach. A trader is using a GEX dashboard and wants a concrete trading plan for today based on dealer positioning mechanics. Use ONLY the data below — no generic options advice.

Follow this exact framework in your response:

1. REGIME: Is this a positive or negative gamma day? What does that mean for how price will behave?
2. KEY LEVEL: What is the single most important level to watch today and why?
3. INTRADAY LEAN: Based on charm bias, will dealers mechanically buy or sell into the close? How does that tilt afternoon trades?
4. SETUPS: Give 2 specific trade setups — one for if price holds above the flip, one for if it breaks below. For each: entry trigger, target, and what invalidates it.
5. VOL WATCH: If vol (VIX) spikes today, which strikes see forced dealer selling from vanna? If vol crushes, which get bought?

--- DATA ---
${ticker} @ $${p.toFixed(2)}

REGIME:
Net GEX: ${fmt(netGex)} — dealers are ${netGex > 0 ? "LONG gamma (they fade moves, market mean-reverts)" : "SHORT gamma (they chase moves, trends follow through)"}
Neg GEX depth: ${fmt(negGexDepth)} — ${Math.abs(negGexDepth) > 5e8 ? "deep negative gamma zone, moves will self-amplify" : Math.abs(negGexDepth) > 1e8 ? "moderate negative gamma present" : "minimal negative gamma"}

KEY LEVELS:
Gamma flip: ${flip ? `$${flip} — price is $${distFromFlip} ${aboveFlip ? "ABOVE (stabilizing regime)" : "BELOW (amplifying regime)"}` : "not identified"}
King node: $${kingStrike} (${kingGex} GEX — largest magnet)
Call walls: ${callWalls?.slice(0, 3).map((w) => `$${w.strike}`).join(", ") || "none"}
Put walls: ${putWalls?.slice(0, 3).map((w) => `$${w.strike}`).join(", ") || "none"}
Max pain: ${maxPain ? `$${maxPain}` : "N/A"}

INTRADAY MECHANICS:
Charm bias: ${fmt(totalCharmBias)} — dealers will ${totalCharmBias >= 0 ? "BUY delta into close (bullish drift from time decay)" : "SELL delta into close (bearish drift from time decay)"}

FLOW (what options buyers are positioning for):
Strongest call flow strikes: ${topPositiveFlow || "none"}
Strongest put flow strikes: ${topNegativeFlow || "none"}

VANNA (dealer delta shift if vol moves):
Strikes where vol spike forces dealer SELLING: ${topNegativeVanna || "none"}
Strikes where vol spike forces dealer BUYING: ${topPositiveVanna || "none"}
--- END DATA ---

Return ONLY valid JSON, no markdown, no extra text:
{
  "regime": "1-2 sentences: positive or negative gamma day, what it means for price behavior",
  "keyLevel": "1-2 sentences: the single most important level today and the specific trigger to watch",
  "intradayLean": "1 sentence: charm bias direction and how it tilts afternoon trades",
  "setupAboveFlip": "2-3 sentences: if price holds above flip — specific entry trigger, target strike/level, invalidation",
  "setupBelowFlip": "2-3 sentences: if price breaks below flip — specific entry trigger, target, invalidation",
  "volWatch": "1-2 sentences: which strikes get hit by dealer vanna flows if VIX moves today"
}`;

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
        max_tokens: 900,
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
