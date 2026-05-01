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
  const [view, setView] = useState("gex"); // gex | vex | callOI | putOI | netOI
  const [infoOpen, setInfoOpen] = useState(false);
  const containerRef = useRef(null);
  const initialLoadRef = useRef(true);
  const initialScrollDoneRef = useRef(false);
  const prevTickerRef = useRef(ticker);

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
        if (active) setMatrix(data);
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

  if (!ticker) return <EmptyState message="Search a ticker to load the GEX matrix" />;

  const price = quote?.price ?? 0;
  const atm = Math.round(price / 5) * 5;

  // Compute stats
  let totalValue = 0;
  let flipPoint = null;
  let maxAbsCell = 1;
  if (matrix) {
    matrix.strikes.forEach((strike) => {
      matrix.expirations.forEach((exp) => {
        const cell = matrix.cells[strike][exp] ?? { gex: 0, callOI: 0, putOI: 0 };
        const v = getCellValue(cell, view);
        totalValue += v;
        if (Math.abs(v) > maxAbsCell) maxAbsCell = Math.abs(v);
      });
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

      {/* Stats row */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-3 mb-4">
          <StatCard
            label={view === "gex" ? "NET GEX" : view === "vex" ? "ABS GEX" : view === "flowGex" ? "FLOW GEX" : view === "callOI" ? "CALL OI" : view === "putOI" ? "PUT OI" : "NET OI"}
            value={fmtVal(totalValue)}
            color={totalValue >= 0 ? "text-green-400" : "text-blue-400"}
            sub={view === "gex" ? (totalValue >= 0 ? "Dealers long Γ" : "Dealers short Γ") : view === "vex" ? "Unsigned gamma exposure" : view === "flowGex" ? (totalValue >= 0 ? "Call flow dominant" : "Put flow dominant") : view === "callOI" ? "Call open interest" : view === "putOI" ? "Put open interest" : "Call OI minus Put OI"}
          />
          <StatCard label="SPOT PRICE" value={`$${price.toFixed(2)}`} sub={`ATM: $${atm}`} color="text-accent" />
          <StatCard label="GAMMA FLIP" value={view === "gex" || view === "vex" ? (flipPoint ? `$${flipPoint}` : "—") : "—"} sub={matrix ? `Near exp: ${matrix.expirations[0]}` : "Zero-crossing level"} color="text-yellow-300" />
          <StatCard label="PRICE vs FLIP" value={view === "gex" || view === "vex" ? (flipPoint ? (price > flipPoint ? "Above flip" : "Below flip") : "—") : "—"} sub={view === "gex" || view === "vex" ? (flipPoint ? `$${Math.abs(price - flipPoint).toFixed(0)} away` : "") : ""} color={flipPoint && price > flipPoint ? "text-green" : "text-red"} />
          <StatCard label="CALL WALLS" value={matrix?.callWalls?.length ? matrix.callWalls.map((w) => `$${w.strike}`).join(", ") : "—"} sub="Top 3 0DTE call OI" color="text-green-300" />
          <StatCard label="PUT WALLS" value={matrix?.putWalls?.length ? matrix.putWalls.map((w) => `$${w.strike}`).join(", ") : "—"} sub="Top 3 0DTE put OI" color="text-red-300" />
          <StatCard label="MAX PAIN" value={matrix?.maxPain ? `$${matrix.maxPain.toFixed(1)}` : "—"} sub="Minimizes expiring worthless" color="text-white" />
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
