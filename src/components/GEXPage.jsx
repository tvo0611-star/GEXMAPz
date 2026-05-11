import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { fetchGEXMatrix } from "../data/mockData";
import { StatCard, LoadingSpinner, EmptyState } from "./UI";
import ChartPanel from "./ChartPanel";
import { clsx } from "clsx";

// Black-Scholes gamma: how much gamma a single contract contributes at spot S
function bsGamma(S, K, sigma, tau) {
  if (sigma <= 0 || tau <= 0 || S <= 0 || K <= 0) return 0;
  const d1 = (Math.log(S / K) + 0.5 * sigma * sigma * tau) / (sigma * Math.sqrt(tau));
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return nd1 / (S * sigma * Math.sqrt(tau));
}

// For each candidate spot price (each strike), compute total dealer net gamma
// using stored OI and IV. The flip is where this crosses zero.
function findGammaFlip(matrix, nearestExp) {
  const msPerYear = 365.25 * 24 * 3600 * 1000;
  // Use at least a few hours for 0DTE so gamma doesn't blow up to infinity
  const tau = Math.max(2 / (365 * 24), (new Date(nearestExp) - new Date()) / msPerYear);

  const strikes = [...matrix.strikes].sort((a, b) => a - b);
  const cells = strikes.map((K) => matrix.cells[K]?.[nearestExp] ?? { callOI: 0, putOI: 0, callIV: 0.25, putIV: 0.25 });

  let prevTotal = null;
  for (const S of strikes) {
    let total = 0;
    for (let i = 0; i < strikes.length; i++) {
      const K = strikes[i];
      const c = cells[i];
      const cIV = c.callIV > 0 ? c.callIV : 0.25;
      const pIV = c.putIV > 0 ? c.putIV : 0.25;
      total += (bsGamma(S, K, cIV, tau) * c.callOI - bsGamma(S, K, pIV, tau) * c.putOI) * S * S * 0.01;
    }
    if (prevTotal !== null && prevTotal < 0 && total >= 0) return S;
    prevTotal = total;
  }
  return null;
}

const fmtVal = (v) => {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${abs.toFixed(0)}`;
};

const fmtDate = (d) => {
  const parts = d.split("-");
  return `${parts[1]}-${parts[2]}`;
};

// Interpolate between two [r,g,b] stops
function lerpRGB(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

// Multi-stop gradient along an array of [r,g,b] stops
function multiStop(stops, t) {
  const segments = stops.length - 1;
  const scaled = t * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const local = scaled - idx;
  return lerpRGB(stops[idx], stops[idx + 1], local);
}

// Negative GEX: light blue → dark blue → light purple → dark purple
const NEG_STOPS = [
  [140, 200, 240],   // light blue
  [40,  90,  180],   // dark blue
  [130, 60,  200],   // light purple
  [90,  10,  160],   // dark purple
];

// Positive GEX: light green → dark green → light yellow → dark yellow
const POS_STOPS = [
  [140, 210, 160],   // light green
  [30,  140, 70],    // dark green
  [220, 210, 80],    // light yellow
  [200, 160, 10],    // dark yellow
];

function gexColor(value, maxAbs) {
  if (value === 0 || maxAbs === 0) return "rgba(14,14,20,1)";
  const t = Math.min(1, Math.abs(value) / (maxAbs * 0.55));
  const stops = value < 0 ? NEG_STOPS : POS_STOPS;
  const [r, g, b] = multiStop(stops, t);
  const a = 0.25 + t * 0.75;
  return `rgba(${r},${g},${b},${a})`;
}

function callOIColor(value, maxAbs) {
  if (value === 0 || maxAbs === 0) return "rgba(14,14,20,1)";
  const t = Math.min(1, value / maxAbs);
  const [r, g, b] = multiStop(POS_STOPS, t);
  const a = 0.25 + t * 0.75;
  return `rgba(${r},${g},${b},${a})`;
}

function putOIColor(value, maxAbs) {
  if (value === 0 || maxAbs === 0) return "rgba(14,14,20,1)";
  const t = Math.min(1, value / maxAbs);
  const [r, g, b] = multiStop(NEG_STOPS, t);
  const a = 0.25 + t * 0.75;
  return `rgba(${r},${g},${b},${a})`;
}

function getCellValue(cell, view) {
  if (!cell) return 0;
  if (view === "gex") return cell.gex;
  if (view === "vex") return Math.abs(cell.gex);
  if (view === "flowGex") return cell.flowGex ?? 0;
  if (view === "callOI") return cell.callOI;
  if (view === "putOI") return cell.putOI;
  if (view === "netOI") return cell.callOI - cell.putOI;
  return cell.gex;
}

function getCellColor(value, view, maxAbs) {
  if (view === "callOI") return callOIColor(value, maxAbs);
  if (view === "putOI") return putOIColor(value, maxAbs);
  return gexColor(value, maxAbs);
}

function getTooltipLabel(view) {
  switch (view) {
    case "gex": return "GEX";
    case "vex": return "ABS GEX";
    case "flowGex": return "Flow GEX";
    case "callOI": return "Call OI";
    case "putOI": return "Put OI";
    case "netOI": return "Net OI";
    default: return "GEX";
  }
}

function getTooltipDescription(view, value) {
  if (view === "flowGex") {
    return value === 0 ? "No volume flow" : value > 0 ? "Call flow dominates — dealers short calls" : "Put flow dominates — dealers short puts";
  }
  if (view === "callOI") {
    return value === 0 ? "No call open interest" : "High call concentration";
  }
  if (view === "putOI") {
    return value === 0 ? "No put open interest" : "High put concentration";
  }
  if (view === "netOI") {
    return value === 0 ? "Balanced net open interest" : value > 0 ? "Call-heavy net OI" : "Put-heavy net OI";
  }
  return value < 0 ? "Negative γ (amplifies vol)" : value > 0 ? "Positive γ (suppresses vol)" : "No open interest";
}

function textColor(value, maxAbs) {
  if (value === 0) return "#252535";
  const t = Math.min(1, Math.abs(value) / (maxAbs * 0.55));
  // Dark cells need light text, light cells need darker text
  if (t < 0.25) return value < 0 ? "#7ab8d8" : "#7abf90";
  if (t < 0.55) return value < 0 ? "#a8d0ee" : "#a8dab8";
  return value < 0 ? "#dceeff" : "#fffff0";
}

export default function GEXPage({ ticker, quote }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState(null);
  const [view, setView] = useState("gex");
  const [infoOpen, setInfoOpen] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const containerRef = useRef(null);
  const initialLoadRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const prevTickerRef = useRef(ticker);
  // Ring buffer: [{ timestamp, totalGex }]
  const gexHistoryRef = useRef([]);

  useEffect(() => {
    if (ticker !== prevTickerRef.current) {
      initialScrollDoneRef.current = false;
      initialLoadRef.current = true;
      prevTickerRef.current = ticker;
    }
  }, [ticker]);

  useEffect(() => {
    if (!ticker || !quote) return;
    let active = true;

    const loadMatrix = async () => {
      if (initialLoadRef.current) setLoading(true);
      try {
        const data = await fetchGEXMatrix(ticker, quote.price);
        if (active) {
          setMatrix(data);
          // Snapshot total GEX (all expirations, all strikes)
          const now = Date.now();
          const total = data.strikes.reduce((sum, strike) =>
            sum + data.expirations.reduce((s2, exp) => s2 + (data.cells[strike]?.[exp]?.gex ?? 0), 0), 0);
          gexHistoryRef.current = [
            ...gexHistoryRef.current.filter((s) => now - s.timestamp < 95 * 60 * 1000),
            { timestamp: now, totalGex: total },
          ];
        }
      } catch (error) {
        console.error("GEX refresh failed:", error);
      } finally {
        if (active) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    };

    loadMatrix();
    const interval = setInterval(loadMatrix, 20000);
    return () => {
      active = false;
      clearInterval(interval);
      gexHistoryRef.current = [];
    };
  }, [ticker, quote?.price]);

  useLayoutEffect(() => {
    if (!matrix || !containerRef.current || !quote || initialScrollDoneRef.current) return;
    const price = quote.price ?? 0;
    const rows = containerRef.current.querySelectorAll("tbody tr");
    if (!rows.length) return;

    const closestIndex = matrix.strikes.reduce((bestIndex, strike, idx) => {
      const bestStrike = matrix.strikes[bestIndex];
      return Math.abs(strike - price) < Math.abs(bestStrike - price) ? idx : bestIndex;
    }, 0);

    const targetRow = rows[closestIndex];
    targetRow?.scrollIntoView({ block: "center", behavior: "smooth" });
    initialScrollDoneRef.current = true;
  }, [matrix, quote]);

  // Reset analysis when ticker changes
  useEffect(() => { setAnalysis(null); }, [ticker]);

  const handleAnalyze = async () => {
    if (!matrix || !quote) return;
    setAnalyzing(true);
    setAnalysis(null);

    const flowByStrike = matrix.strikes.map((strike) => ({
      strike,
      flow: matrix.expirations.reduce((sum, exp) => sum + (matrix.cells[strike]?.[exp]?.flowGex ?? 0), 0),
    }));
    const topPos = [...flowByStrike].sort((a, b) => b.flow - a.flow).slice(0, 3).filter((s) => s.flow > 0).map((s) => `$${s.strike}`).join(", ");
    const topNeg = [...flowByStrike].sort((a, b) => a.flow - b.flow).slice(0, 3).filter((s) => s.flow < 0).map((s) => `$${s.strike}`).join(", ");

    const vannaByStrike = matrix.strikes.map((strike) => ({
      strike,
      vanna: matrix.expirations.reduce((sum, exp) => sum + (matrix.cells[strike]?.[exp]?.vannaGex ?? 0), 0),
    }));
    const topPosVanna = [...vannaByStrike].sort((a, b) => b.vanna - a.vanna).slice(0, 3).filter((s) => s.vanna > 0).map((s) => `$${s.strike}`).join(", ");
    const topNegVanna = [...vannaByStrike].sort((a, b) => a.vanna - b.vanna).slice(0, 3).filter((s) => s.vanna < 0).map((s) => `$${s.strike}`).join(", ");

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ticker,
          price: quote.price,
          flipPoint,
          callWalls: matrix.callWalls,
          putWalls: matrix.putWalls,
          maxPain: matrix.maxPain,
          kingStrike,
          kingGex: fmtVal(totalGEXByStrike[kingStrike] ?? 0),
          netGex: totalValue,
          negGexDepth,
          totalCharmBias,
          topPositiveFlow: topPos || null,
          topNegativeFlow: topNeg || null,
          topPositiveVanna: topPosVanna || null,
          topNegativeVanna: topNegVanna || null,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
    } catch (err) {
      setAnalysis(`Error: ${err.message}`);
    } finally {
      setAnalyzing(false);
    }
  };

  if (!ticker) return <EmptyState message="Search a ticker to load the GEX matrix" />;

  const price = quote?.price ?? 0;
  const atm = Math.round(price / 5) * 5;

  // Compute stats
  let totalValue = 0;
  let flipPoint = null;
  let maxAbsCell = 1;
  let negGexDepth = 0;
  let totalCharmBias = 0;
  if (matrix) {
    matrix.strikes.forEach((strike) => {
      matrix.expirations.forEach((exp) => {
        const cell = matrix.cells[strike][exp] ?? { gex: 0, callOI: 0, putOI: 0 };
        const v = getCellValue(cell, view);
        totalValue += v;
        if (Math.abs(v) > maxAbsCell) maxAbsCell = Math.abs(v);
        totalCharmBias += cell.charmGex ?? 0;
      });
    });

    // Negative GEX depth: sum of GEX at strikes where per-strike total GEX < 0
    matrix.strikes.forEach((strike) => {
      const strikeGex = matrix.expirations.reduce((s, exp) => s + (matrix.cells[strike]?.[exp]?.gex ?? 0), 0);
      if (strikeGex < 0) negGexDepth += strikeGex;
    });

    if (view === "gex" || view === "vex") {
      flipPoint = findGammaFlip(matrix, matrix.expirations[0]);
    }
  }

  // Total GEX per strike (sum across all expirations) — used for King column
  // Switches between structural (OI-based) and flow (volume-based) depending on view
  const summaryField = view === "flowGex" ? "flowGex" : "gex";
  const totalGEXByStrike = {};
  let maxAbsTotal = 1;
  let kingStrike = null;
  if (matrix) {
    matrix.strikes.forEach((strike) => {
      const total = matrix.expirations.reduce((sum, exp) => {
        const cell = matrix.cells[strike]?.[exp] ?? {};
        return sum + (cell[summaryField] ?? 0);
      }, 0);
      totalGEXByStrike[strike] = total;
      if (Math.abs(total) > maxAbsTotal) {
        maxAbsTotal = Math.abs(total);
        kingStrike = strike;
      }
    });
  }

  // Compute 1h change for NET GEX
  const gexChangeInfo = (() => {
    const history = gexHistoryRef.current;
    if (history.length < 2) return { collecting: true };
    const now = Date.now();
    const eligible = history.slice(0, -1).filter((s) => now - s.timestamp > 30 * 1000);
    if (!eligible.length) return { collecting: true };
    const oneHourAgo = now - 60 * 60 * 1000;
    const best = eligible.reduce((a, b) =>
      Math.abs(a.timestamp - oneHourAgo) < Math.abs(b.timestamp - oneHourAgo) ? a : b
    );
    if (Math.abs(best.totalGex) < 1) return { collecting: true };
    const pct = ((totalValue - best.totalGex) / Math.abs(best.totalGex)) * 100;
    const ageMin = Math.round((now - best.timestamp) / 60000);
    const timeLabel = ageMin < 1 ? "<1m ago" : ageMin >= 55 ? "1h ago" : `${ageMin}m ago`;
    return { pct, timeLabel };
  })();

  // Stable array for ChartPanel — only rebuilds when matrix changes, not on tooltip/hover
  const gexLevels = useMemo(() => {
    if (!matrix) return [];
    return matrix.strikes.map((strike) => ({
      strike,
      gex: matrix.expirations.reduce((sum, exp) => sum + (matrix.cells[strike]?.[exp]?.gex ?? 0), 0),
    }));
  }, [matrix]);

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      {/* Price chart with GEX levels */}
      {ticker && (
        <ChartPanel
          ticker={ticker}
          callWalls={matrix?.callWalls ?? []}
          putWalls={matrix?.putWalls ?? []}
          flipPoint={flipPoint}
          maxPain={matrix?.maxPain ?? null}
          gexLevels={gexLevels}
          maxAbsGEX={maxAbsTotal}
        />
      )}

      {/* Sentiment indicator */}
      {quote && matrix && (() => {
        let label, cls, reason;
        if (flipPoint) {
          if (price > flipPoint) {
            label = "BULLISH"; cls = "bg-green/10 text-green border-green/30";
            reason = `price above gamma flip ($${flipPoint})`;
          } else {
            label = "BEARISH"; cls = "bg-red/10 text-red border-red/30";
            reason = `price below gamma flip ($${flipPoint})`;
          }
        } else if (totalValue > 0) {
          label = "BULLISH"; cls = "bg-green/10 text-green border-green/30";
          reason = "net positive GEX regime";
        } else if (totalValue < 0) {
          label = "BEARISH"; cls = "bg-red/10 text-red border-red/30";
          reason = "net negative GEX regime";
        } else {
          label = "NEUTRAL"; cls = "bg-muted/10 text-muted border-border";
          reason = "no clear gamma signal";
        }
        return (
          <div className="flex items-center gap-2 mb-3">
            <span className={clsx("font-mono text-xs font-bold px-3 py-1 rounded border", cls)}>{label}</span>
            <span className="font-mono text-xs text-muted">{ticker} — {reason}</span>
          </div>
        );
      })()}

      {/* Stats row */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-9 gap-3 mb-4">
          <StatCard
            label={view === "gex" ? "NET GEX" : view === "vex" ? "ABS GEX" : view === "flowGex" ? "FLOW GEX" : view === "callOI" ? "CALL OI" : view === "putOI" ? "PUT OI" : "NET OI"}
            value={fmtVal(totalValue)}
            color={totalValue >= 0 ? "text-green-400" : "text-blue-400"}
            sub={
              gexChangeInfo.collecting
                ? <span className="text-muted/50 italic">building history…</span>
                : <span className={gexChangeInfo.pct >= 0 ? "text-green-400" : "text-red-400"}>{gexChangeInfo.pct >= 0 ? "+" : ""}{gexChangeInfo.pct.toFixed(1)}% vs {gexChangeInfo.timeLabel}</span>
            }
          />
          <StatCard label="SPOT PRICE" value={`$${price.toFixed(2)}`} sub={`ATM: $${atm}`} color="text-accent" />
          <StatCard label="GAMMA FLIP" value={view === "gex" || view === "vex" ? (flipPoint ? `$${flipPoint}` : "—") : "—"} sub={matrix ? `Near exp: ${matrix.expirations[0]}` : "Zero-crossing level"} color="text-yellow-300" />
          <StatCard label="PRICE vs FLIP" value={view === "gex" || view === "vex" ? (flipPoint ? (price > flipPoint ? "Above flip" : "Below flip") : "—") : "—"} sub={view === "gex" || view === "vex" ? (flipPoint ? `$${Math.abs(price - flipPoint).toFixed(0)} away` : "") : ""} color={flipPoint && price > flipPoint ? "text-green" : "text-red"} />
          <StatCard label="CALL WALLS" value={matrix?.callWalls?.length ? matrix.callWalls.map((w) => `$${w.strike}`).join(", ") : "—"} sub="Top 3 0DTE call OI" color="text-green-300" />
          <StatCard label="PUT WALLS" value={matrix?.putWalls?.length ? matrix.putWalls.map((w) => `$${w.strike}`).join(", ") : "—"} sub="Top 3 0DTE put OI" color="text-red-300" />
          <StatCard label="MAX PAIN" value={matrix?.maxPain ? `$${matrix.maxPain.toFixed(1)}` : "—"} sub="Minimizes expiring worthless" color="text-white" />
          <StatCard
            label="NEG GEX DEPTH"
            value={negGexDepth === 0 ? "—" : fmtVal(negGexDepth)}
            color={negGexDepth < -1e8 ? "text-red-400" : negGexDepth < 0 ? "text-orange-400" : "text-green-400"}
            sub={negGexDepth === 0 ? "No neg-gamma strikes" : negGexDepth < -5e8 ? "Moves amplified" : "Mild neg gamma"}
          />
          <StatCard
            label="CHARM BIAS"
            value={totalCharmBias === 0 ? "—" : fmtVal(totalCharmBias)}
            color={totalCharmBias >= 0 ? "text-green-400" : "text-red-400"}
            sub={totalCharmBias >= 0 ? "Dealers buy into close" : "Dealers sell into close"}
          />
        </div>
      )}

      {/* AI Analysis panel */}
      {matrix && (
        <div className="bg-surface border border-border rounded-lg p-4 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-accent">⚡ AI Analysis</span>
              <span className="font-mono text-xs text-muted">powered by Claude</span>
            </div>
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-mono transition-all",
                analyzing
                  ? "bg-surface border border-border text-muted cursor-wait"
                  : "bg-accent/10 text-accent border border-accent/30 hover:bg-accent/20"
              )}
            >
              {analyzing ? "Analyzing…" : analysis ? "Re-analyze" : "Analyze"}
            </button>
          </div>
          {analyzing && (
            <div className="text-xs font-mono text-muted animate-pulse">📡 Reading gamma levels…</div>
          )}
          {analysis && !analyzing && (() => {
            let parsed = null;
            try {
              // strip markdown code fences if model wrapped the JSON
              const cleaned = analysis.replace(/^```[a-z]*\n?/i, "").replace(/\n?```$/i, "").trim();
              parsed = JSON.parse(cleaned);
            } catch {}

            if (parsed?.regime) {
              const sections = [
                {
                  key: "regime",
                  icon: "◈",
                  label: "REGIME",
                  bg: "bg-accent/5 border-accent/20",
                  labelColor: "text-accent",
                  iconBg: "bg-accent/10",
                },
                {
                  key: "keyLevel",
                  icon: "⊕",
                  label: "KEY LEVEL",
                  bg: "bg-yellow-400/5 border-yellow-400/20",
                  labelColor: "text-yellow-300",
                  iconBg: "bg-yellow-400/10",
                },
                {
                  key: "intradayLean",
                  icon: "↝",
                  label: "INTRADAY LEAN",
                  bg: "bg-blue-400/5 border-blue-400/20",
                  labelColor: "text-blue-300",
                  iconBg: "bg-blue-400/10",
                },
                {
                  key: "setupAboveFlip",
                  icon: "▲",
                  label: "SETUP — ABOVE FLIP",
                  bg: "bg-green-500/5 border-green-500/20",
                  labelColor: "text-green-400",
                  iconBg: "bg-green-500/10",
                },
                {
                  key: "setupBelowFlip",
                  icon: "▼",
                  label: "SETUP — BELOW FLIP",
                  bg: "bg-red-500/5 border-red-500/20",
                  labelColor: "text-red-400",
                  iconBg: "bg-red-500/10",
                },
                {
                  key: "volWatch",
                  icon: "〜",
                  label: "VOL WATCH  ·  VANNA",
                  bg: "bg-purple-400/5 border-purple-400/20",
                  labelColor: "text-purple-300",
                  iconBg: "bg-purple-400/10",
                },
              ];

              // bold $NNN price levels and standalone numbers with B/M suffix
              const highlight = (text) => {
                const parts = text.split(/(\$\d+(?:\.\d+)?|\b\d+(?:\.\d+)?[BM]\b)/g);
                return parts.map((part, i) =>
                  /^\$\d|^\d+(?:\.\d+)?[BM]$/.test(part)
                    ? <strong key={i} className="text-text font-semibold">{part}</strong>
                    : part
                );
              };

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-1">
                  {sections.map(({ key, icon, label, bg, labelColor, iconBg }) => parsed[key] && (
                    <div key={key} className={`rounded-lg border p-3 ${bg} ${key === "regime" || key === "volWatch" ? "sm:col-span-2" : ""}`}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`text-xs font-mono font-bold w-5 h-5 rounded flex items-center justify-center ${iconBg} ${labelColor}`}>{icon}</span>
                        <span className={`text-xs font-mono font-bold tracking-widest ${labelColor}`}>{label}</span>
                      </div>
                      <p className="text-xs font-mono text-text/90 leading-relaxed">{highlight(parsed[key])}</p>
                    </div>
                  ))}
                </div>
              );
            }
            return <p className="text-xs font-mono text-text leading-relaxed">{analysis}</p>;
          })()}
          {!analysis && !analyzing && (
            <p className="text-xs font-mono text-muted">Click Analyze to get a GEX-based trading plan for today.</p>
          )}
        </div>
      )}

      {/* View toggle + legend */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="flex gap-1 flex-wrap">
            {[
              { id: "gex", label: "GEX" },
              { id: "vex", label: "VEX" },
              { id: "flowGex", label: "Flow GEX" },
              { id: "callOI", label: "Call OI" },
              { id: "putOI", label: "Put OI" },
              { id: "netOI", label: "Net OI" },
            ].map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className={clsx(
                  "px-3 py-1.5 rounded text-xs font-mono transition-all",
                  view === v.id
                    ? "bg-accent/10 text-accent border border-accent/30"
                    : "bg-surface border border-border text-muted hover:text-text"
                )}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        <button
          onClick={() => setInfoOpen((open) => !open)}
          className="px-3 py-1.5 rounded text-xs font-mono bg-surface border border-border text-muted hover:text-text transition-all"
        >
          {infoOpen ? "Hide info" : "Show info"}
        </button>
      </div>

      {infoOpen && (
        <div className="bg-surface border border-border rounded-lg p-3 mb-3 text-xs font-mono text-muted space-y-2">
          <div>
            <span className="font-semibold text-text">Gamma flip</span>: the yellow star marks the strike where net gamma across expirations crosses zero.
          </div>
          <div>
            <span className="font-semibold text-text">Call walls</span>: top 3 0DTE call strikes by open interest. High call concentration is where dealers will be most exposed if price moves up.
          </div>
          <div>
            <span className="font-semibold text-text">Put walls</span>: top 3 0DTE put strikes by open interest. High put concentration is where dealers become most exposed if price moves down.
          </div>
          <div>
            <span className="font-semibold text-text">Call / Put OI views</span>: use these views to see strike-by-strike call or put concentration instead of gamma.
          </div>
          <div>
            <span className="font-semibold text-text">ATM</span>: the current at-the-money strike is highlighted with an arrow in the strike column.
          </div>
        </div>
      )}

      {/* Color legend */}
      <div className="flex items-center gap-4 text-xs font-mono flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-24 h-3 rounded-sm" style={{ background: "linear-gradient(to right, rgb(140,200,240), rgb(40,90,180), rgb(130,60,200), rgb(90,10,160))" }} />
          <span className="text-blue-300">Negative GEX</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-24 h-3 rounded-sm" style={{ background: "linear-gradient(to right, rgb(140,210,160), rgb(30,140,70), rgb(220,210,80), rgb(200,160,10))" }} />
          <span className="text-green-300">Positive GEX</span>
        </div>
        <div className="flex items-center gap-1.5 text-muted">
          <span>low ←——→ high intensity</span>
        </div>
      </div>

      {/* Matrix */}
      {(!matrix && loading) ? (
        <LoadingSpinner />
      ) : matrix ? (
        <div ref={containerRef} className="bg-surface border border-border rounded-lg overflow-auto relative">
          {/* Tooltip */}
          {tooltip && (
            <div
              className="fixed z-50 bg-bg border border-border rounded-lg p-3 shadow-2xl pointer-events-none text-xs font-mono"
              style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
            >
              <div className="text-accent font-semibold mb-1">{ticker} ${tooltip.strike} — {tooltip.exp}</div>
              <div className={clsx("font-bold text-base", tooltip.value < 0 ? "text-purple-300" : tooltip.value > 0 ? "text-yellow-300" : "text-muted")}>
                {getTooltipLabel(view)}: {fmtVal(tooltip.value)}
              </div>
              <div className="text-muted mt-1">{getTooltipDescription(view, tooltip.value)}</div>
              <div className="text-muted mt-1">Call OI: {fmtVal(tooltip.cell.callOI)} • Put OI: {fmtVal(tooltip.cell.putOI)}</div>
              <div className="text-muted mt-1">Call Vol: {fmtVal(tooltip.cell.callVolume ?? 0)} • Put Vol: {fmtVal(tooltip.cell.putVolume ?? 0)}</div>
              <div className="text-muted mt-1">GEX: {fmtVal(tooltip.cell.gex)} • Flow GEX: {fmtVal(tooltip.cell.flowGex ?? 0)}</div>
              {tooltip.strike === atm && <div className="text-accent mt-1">⚡ ATM strike</div>}
              {tooltip.strike === flipPoint && <div className="text-yellow-400 mt-1">★ Gamma flip level</div>}
            </div>
          )}

          <table className="border-collapse" style={{ fontSize: 11 }}>
            <thead>
              <tr>
                {/* Strike header */}
                <th className="sticky left-0 z-20 bg-surface border-b border-r border-border px-3 py-2 text-left font-mono text-xs text-muted font-normal whitespace-nowrap min-w-[80px]">
                  Strike
                </th>
                {/* Total GEX column header */}
                <th className="sticky z-20 bg-surface border-b border-r border-border/60 px-2 py-2 text-center font-mono font-semibold whitespace-nowrap min-w-[90px] text-accent/80" style={{ fontSize: 10, left: 80 }}>
                  {view === "flowGex" ? "Σ Flow" : "Σ GEX"}
                </th>
                {matrix.expirations.map((exp) => {
                  const isToday = exp === new Date().toISOString().split("T")[0];
                  return (
                    <th
                      key={exp}
                      className={clsx(
                        "border-b border-r border-border px-2 py-2 text-center font-mono font-normal whitespace-nowrap min-w-[90px]",
                        isToday ? "text-accent" : "text-muted"
                      )}
                      style={{ fontSize: 10 }}
                    >
                      {isToday ? "0DTE" : fmtDate(exp)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {matrix.strikes.map((strike) => {
                const isATM = strike === atm;
                const isFlip = strike === flipPoint;
                const callWallIndex = matrix.callWalls.findIndex((item) => item.strike === strike);
                const putWallIndex = matrix.putWalls.findIndex((item) => item.strike === strike);
                const isMaxPain = strike === matrix.maxPain;

                return (
                  <tr
                    key={strike}
                    className={clsx(
                      "border-b border-border",
                      isATM ? "border-b-accent/40" : "",
                    )}
                    style={isATM ? { borderBottom: "1px solid rgba(0,229,255,0.4)" } : {}}
                  >
                    {/* Strike label */}
                    <td
                      className={clsx(
                        "sticky left-0 z-10 bg-surface border-r border-border px-3 py-1.5 font-mono font-semibold whitespace-nowrap",
                        isATM ? "text-accent" : isFlip ? "text-yellow-400" : "text-text"
                      )}
                      style={{ fontSize: 11 }}
                    >
                      {strike.toFixed(1)}
                      {isATM && <span className="ml-1 text-accent/60 text-xs">←</span>}
                      {isFlip && !isATM && <span className="ml-1 text-yellow-500/60 text-xs">★</span>}
                      {callWallIndex >= 0 && (
                        <span className={clsx(
                          "ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold text-white",
                          callWallIndex === 0 ? "bg-green-600" : callWallIndex === 1 ? "bg-green-500/80" : "bg-green-500/60"
                        )}>
                          CW{callWallIndex + 1}
                        </span>
                      )}
                      {putWallIndex >= 0 && (
                        <span className={clsx(
                          "ml-1 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold text-white",
                          putWallIndex === 0 ? "bg-red-600" : putWallIndex === 1 ? "bg-red-500/80" : "bg-red-500/60"
                        )}>
                          PW{putWallIndex + 1}
                        </span>
                      )}
                      {isMaxPain && <span className="ml-1 inline-flex items-center rounded bg-white px-1 py-0.5 text-[10px] font-semibold text-slate-900">MP</span>}
                    </td>

                    {/* Total GEX cell (King column) */}
                    {(() => {
                      const total = totalGEXByStrike[strike] ?? 0;
                      const isKing = strike === kingStrike;
                      const bg = gexColor(total, maxAbsTotal);
                      const fg = textColor(total, maxAbsTotal);
                      return (
                        <td
                          className="sticky z-10 border-r border-border/60 text-right px-2 py-1.5 whitespace-nowrap font-semibold"
                          style={{ background: bg, color: fg, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace", left: 80 }}
                        >
                          {isKing && <span className="mr-1">👑</span>}
                          {total === 0 ? <span style={{ color: "#2a2a4a" }}>—</span> : fmtVal(total)}
                        </td>
                      );
                    })()}

                    {/* Per-expiration cells */}
                    {matrix.expirations.map((exp) => {
                      const cell = matrix.cells[strike][exp] ?? { gex: 0, callOI: 0, putOI: 0 };
                      const value = getCellValue(cell, view);
                      const bg = getCellColor(value, view, maxAbsCell);
                      const fg = textColor(value, maxAbsCell);
                      return (
                        <td
                          key={exp}
                          className="border-r border-border/30 text-right px-2 py-1.5 cursor-default transition-all hover:brightness-125 whitespace-nowrap"
                          style={{ background: bg, color: fg, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}
                          onMouseEnter={(e) => setTooltip({ strike, exp, value, cell, x: e.clientX, y: e.clientY })}
                          onMouseLeave={() => setTooltip(null)}
                          onMouseMove={(e) => setTooltip((t) => t ? { ...t, x: e.clientX, y: e.clientY } : null)}
                        >
                          {value === 0 ? <span style={{ color: "#2a2a4a" }}>—</span> : fmtVal(value)}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
