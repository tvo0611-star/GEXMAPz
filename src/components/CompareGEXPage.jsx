import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { fetchGEXMatrix, fetchQuote } from "../data/mockData";
import { LoadingSpinner, EmptyState } from "./UI";
import { clsx } from "clsx";

const fmtVal = (v) => {
  if (v === 0) return "0";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}K`;
  return `${sign}${Math.round(abs)}`;
};

function lerpRGB(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

function multiStop(stops, t) {
  const segments = stops.length - 1;
  const scaled = t * segments;
  const idx = Math.min(Math.floor(scaled), segments - 1);
  const local = scaled - idx;
  return lerpRGB(stops[idx], stops[idx + 1], local);
}

const NEG_STOPS = [
  [140, 200, 240],
  [40, 90, 180],
  [130, 60, 200],
  [90, 10, 160],
];

const POS_STOPS = [
  [140, 210, 160],
  [30, 140, 70],
  [220, 210, 80],
  [200, 160, 10],
];

function gexColor(value, maxAbs) {
  if (value === 0 || maxAbs === 0) return "rgba(14,14,20,1)";
  const t = Math.min(1, Math.abs(value) / (maxAbs * 0.55));
  const stops = value < 0 ? NEG_STOPS : POS_STOPS;
  const [r, g, b] = multiStop(stops, t);
  const a = 0.25 + t * 0.75;
  return `rgba(${r},${g},${b},${a})`;
}

function textColor(value, maxAbs) {
  if (value === 0) return "#252535";
  const t = Math.min(1, Math.abs(value) / (maxAbs * 0.55));
  if (t < 0.25) return value < 0 ? "#7ab8d8" : "#7abf90";
  if (t < 0.55) return value < 0 ? "#a8d0ee" : "#a8dab8";
  return value < 0 ? "#dceeff" : "#fffff0";
}

function GEXColumn({ ticker, matrix, quote, maxAbsCell, view }) {
  const [tooltip, setTooltip] = useState(null);
  const price = quote?.price ?? 0;
  const atm = Math.round(price / 5) * 5;
  const today = new Date().toISOString().split("T")[0];

  if (!matrix) {
    return (
      <div className="bg-surface/30 rounded-lg border border-border/30 p-4 flex items-center justify-center min-h-96">
        <div className="text-muted text-center">
          <div className="font-mono text-sm font-semibold mb-2">{ticker}</div>
          <div className="text-xs">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-surface/30 rounded-lg border border-border/30 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/30 bg-surface/50">
        <div className="font-mono font-semibold text-accent mb-1">{ticker}</div>
        <div className="text-sm font-bold text-text">${price.toFixed(2)}</div>
        <div className="text-xs text-muted font-mono mt-1">ATM: ${atm}</div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-bg border border-border rounded-lg p-3 shadow-2xl pointer-events-none text-xs font-mono"
          style={{ left: tooltip.x + 12, top: tooltip.y - 10 }}
        >
          <div className="text-accent font-semibold mb-1">
            ${tooltip.strike} — {tooltip.exp.split("-").slice(1).join("-")}
          </div>
          <div className={clsx("font-bold", tooltip.value < 0 ? "text-purple-300" : tooltip.value > 0 ? "text-yellow-300" : "text-muted")}>
            {fmtVal(tooltip.value)}
          </div>
          <div className="text-muted mt-1">{tooltip.value < 0 ? "Negative γ" : tooltip.value > 0 ? "Positive γ" : view === "flowGex" ? "No volume" : "No OI"}</div>
        </div>
      )}

      {/* Matrix table */}
      <div className="overflow-auto gex-scroll-area" data-ticker={ticker} style={{ maxHeight: "600px" }}>
        <table className="border-collapse" style={{ fontSize: 10 }}>
          <thead>
            <tr>
              <th className="sticky top-0 left-0 z-20 bg-surface border-b border-r border-border px-2 py-1.5 text-left font-mono text-xs text-muted font-normal whitespace-nowrap min-w-[60px]">
                Strike
              </th>
              <th
                className="sticky top-0 border-b border-r border-border px-1 py-1.5 text-center font-mono font-normal whitespace-nowrap min-w-[70px] bg-accent/10 text-accent"
                style={{ fontSize: 9 }}
              >
                0DTE
              </th>
            </tr>
          </thead>
          <tbody>
            {matrix.strikes.map((strike) => {
              const isATM = strike === atm;
              const callWallIndex = matrix.callWalls.findIndex((item) => item.strike === strike);
              const putWallIndex = matrix.putWalls.findIndex((item) => item.strike === strike);
              const cell = (matrix.cells[strike]?.[today]) ?? { gex: 0, flowGex: 0, callOI: 0, putOI: 0 };
              const value = view === "flowGex" ? (cell.flowGex ?? 0) : cell.gex;
              const bg = gexColor(value, maxAbsCell);
              const fg = textColor(value, maxAbsCell);
              return (
                <tr
                  key={strike}
                  className={clsx("border-b border-border", isATM ? "border-b-accent/40" : "")}
                  style={isATM ? { borderBottom: "2px solid rgba(0,229,255,0.5)" } : {}}
                >
                  <td
                    className={clsx(
                      "sticky left-0 z-10 bg-surface border-r border-border px-2 py-1 font-mono font-semibold whitespace-nowrap",
                      isATM ? "text-accent bg-accent/5" : "text-text"
                    )}
                    style={{ fontSize: 10 }}
                  >
                    {strike.toFixed(0)}
                    {isATM && <span className="ml-1 text-accent/60">←</span>}
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
                  </td>
                  <td
                    className="border-r border-border/30 text-right px-1 py-1 cursor-default hover:brightness-125 transition-all whitespace-nowrap"
                    style={{ background: bg, color: fg, fontSize: 9, fontFamily: "'IBM Plex Mono', monospace" }}
                    onMouseEnter={(e) => setTooltip({ strike, exp: today, value, cell, x: e.clientX, y: e.clientY })}
                    onMouseLeave={() => setTooltip(null)}
                    onMouseMove={(e) => setTooltip((t) => (t ? { ...t, x: e.clientX, y: e.clientY } : null))}
                  >
                    {value === 0 ? <span style={{ color: "#2a2a4a" }}>—</span> : fmtVal(value)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CompareGEXPage() {
  const [matrices, setMatrices] = useState({
    QQQ: null,
    SPY: null,
    SPX: null,
  });
  const [quotes, setQuotes] = useState({
    QQQ: null,
    SPY: null,
    SPX: null,
  });
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("gex");
  const containerRef = useRef(null);
  const initialLoadRef = useRef(true);
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    let active = true;
    initialScrollDoneRef.current = false;

    const loadAll = async () => {
      if (initialLoadRef.current) setLoading(true);
      try {
        const [qqq, spy, spx] = await Promise.all([fetchQuote("QQQ"), fetchQuote("SPY"), fetchQuote("SPX")]);
        if (!active) return;
        setQuotes({ QQQ: qqq, SPY: spy, SPX: spx });

        const [qqq_matrix, spy_matrix, spx_matrix] = await Promise.all([
          fetchGEXMatrix("QQQ", qqq.price),
          fetchGEXMatrix("SPY", spy.price),
          fetchGEXMatrix("SPX", spx.price),
        ]);
        if (!active) return;
        setMatrices({ QQQ: qqq_matrix, SPY: spy_matrix, SPX: spx_matrix });
      } catch (error) {
        console.error("Compare GEX refresh failed:", error);
      } finally {
        if (active) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    };

    loadAll();
    const interval = setInterval(loadAll, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  // Auto-scroll to price level
  useLayoutEffect(() => {
    if (!containerRef.current || loading || initialScrollDoneRef.current) return;

    const scrollAreas = containerRef.current.querySelectorAll(".gex-scroll-area");
    let didScroll = false;

    scrollAreas.forEach((area) => {
      const ticker = area.dataset.ticker;
      const matrix = matrices[ticker];
      const price = quotes[ticker]?.price ?? 0;
      if (!matrix || price === 0) return;

      const rows = area.querySelectorAll("tbody tr");
      if (!rows.length) return;

      const closestIndex = matrix.strikes.reduce((bestIndex, strike, idx) => {
        const bestStrike = matrix.strikes[bestIndex];
        return Math.abs(strike - price) < Math.abs(bestStrike - price) ? idx : bestIndex;
      }, 0);
      const targetRow = rows[closestIndex];
      if (targetRow) {
        targetRow.scrollIntoView({ block: "center", behavior: "smooth" });
        didScroll = true;
      }
    });

    if (didScroll) initialScrollDoneRef.current = true;
  }, [loading, matrices, quotes]);

  const hasLoaded = matrices.QQQ && matrices.SPY && matrices.SPX;
  if (loading && !hasLoaded) return <LoadingSpinner />;

  // Calculate global max abs for consistent scaling (0DTE only)
  const today = new Date().toISOString().split("T")[0];
  const valueField = view === "flowGex" ? "flowGex" : "gex";
  let globalMaxAbsCell = 1;
  Object.values(matrices).forEach((matrix) => {
    if (!matrix) return;
    matrix.strikes.forEach((strike) => {
      const cell = matrix.cells[strike]?.[today] ?? {};
      const v = Math.abs(cell[valueField] ?? 0);
      if (v > globalMaxAbsCell) globalMaxAbsCell = v;
    });
  });

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <div className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-mono font-semibold text-accent mb-1">GEX Comparison — 0DTE</h2>
          <p className="text-sm font-mono text-muted">Green = positive gamma · Blue/Purple = negative gamma</p>
        </div>
        <div className="flex gap-1">
          {[{ id: "gex", label: "GEX" }, { id: "flowGex", label: "Flow GEX" }].map((v) => (
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

      <div ref={containerRef} className="grid grid-cols-3 gap-3">
        {["QQQ", "SPY", "SPX"].map((ticker) => (
          <GEXColumn
            key={ticker}
            ticker={ticker}
            matrix={matrices[ticker]}
            quote={quotes[ticker]}
            maxAbsCell={globalMaxAbsCell}
            view={view}
          />
        ))}
      </div>
    </div>
  );
}
