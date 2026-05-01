import { useState, useEffect, useRef } from "react";
import { fetchGEXMatrix } from "../data/mockData";
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

function GEXBarChart({ strikes, values, price, title, color }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    if (!containerRef.current) return;
    setWidth(containerRef.current.clientWidth);
    const ro = new ResizeObserver(() => {
      if (containerRef.current) setWidth(containerRef.current.clientWidth);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  const [hovered, setHovered] = useState(null);

  const H = 340;
  const PAD = { top: 24, right: 24, bottom: 52, left: 72 };
  const chartW = Math.max(1, width - PAD.left - PAD.right);
  const chartH = H - PAD.top - PAD.bottom;

  // Y scale — always include 0
  const yMax = Math.max(...values, 0) * 1.12 || 1;
  const yMin = Math.min(...values, 0) * 1.12 || -1;
  const yRange = yMax - yMin;
  const yPos = (v) => PAD.top + ((yMax - v) / yRange) * chartH;
  const zeroY = yPos(0);

  // X scale
  const n = strikes.length;
  const slotW = chartW / Math.max(n, 1);
  const barW = Math.max(2, slotW * 0.72);
  const xCenter = (i) => PAD.left + (i + 0.5) * slotW;

  // ATM
  const atmIdx = strikes.reduce(
    (best, s, i) => (Math.abs(s - price) < Math.abs(strikes[best] - price) ? i : best),
    0
  );

  // Y-axis ticks (5 ticks)
  const tickCount = 5;
  const yTicks = Array.from({ length: tickCount }, (_, i) => {
    return yMin + (yRange / (tickCount - 1)) * i;
  });

  // X-axis labels — show ~10 max
  const labelStep = Math.ceil(n / 10);

  // King bar (max abs value)
  const kingIdx = values.reduce(
    (best, v, i) => (Math.abs(v) > Math.abs(values[best]) ? i : best),
    0
  );

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-accent">{title}</span>
        <span className="font-mono text-xs text-muted">per 1% move · {n} strikes</span>
      </div>

      {/* Hover tooltip */}
      <div className="relative" ref={containerRef}>
        {hovered !== null && (
          <div
            className="absolute z-20 pointer-events-none bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-xl"
            style={{
              left: Math.min(xCenter(hovered) + 10, width - 140),
              top: 10,
            }}
          >
            <div className="text-accent font-semibold mb-0.5">${strikes[hovered]}</div>
            <div className={values[hovered] >= 0 ? "text-green-400" : "text-purple-400"}>
              {fmtVal(values[hovered])}
            </div>
          </div>
        )}

        <svg width={width} height={H} style={{ display: "block" }}>
          {/* Grid lines */}
          {yTicks.map((v, i) => (
            <line
              key={i}
              x1={PAD.left} y1={yPos(v)}
              x2={width - PAD.right} y2={yPos(v)}
              stroke="rgba(255,255,255,0.05)" strokeWidth={1}
            />
          ))}

          {/* Zero line */}
          <line
            x1={PAD.left} y1={zeroY}
            x2={width - PAD.right} y2={zeroY}
            stroke="rgba(255,255,255,0.25)" strokeWidth={1}
          />

          {/* Bars */}
          {strikes.map((strike, i) => {
            const v = values[i];
            if (v === 0) return null;
            const cx = xCenter(i);
            const x = cx - barW / 2;
            const barTop = v >= 0 ? yPos(v) : zeroY;
            const barH = Math.abs(yPos(v) - zeroY);
            const isKing = i === kingIdx;
            const fill = v >= 0
              ? (color === "flow" ? "rgba(34,197,94,0.85)" : "rgba(34,197,94,0.75)")
              : (color === "flow" ? "rgba(139,92,246,0.85)" : "rgba(139,92,246,0.75)");
            return (
              <rect
                key={strike}
                x={x} y={barTop}
                width={barW} height={Math.max(barH, 1)}
                fill={fill}
                stroke={isKing ? "#fbbf24" : "none"}
                strokeWidth={isKing ? 1.5 : 0}
                opacity={hovered !== null && hovered !== i ? 0.45 : 1}
                style={{ cursor: "crosshair" }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              />
            );
          })}

          {/* ATM vertical line */}
          <line
            x1={xCenter(atmIdx)} y1={PAD.top}
            x2={xCenter(atmIdx)} y2={H - PAD.bottom}
            stroke="#00e5ff" strokeWidth={1.5} strokeDasharray="5,4"
          />
          <text
            x={xCenter(atmIdx) + 4} y={PAD.top + 12}
            fill="#00e5ff" fontSize={9} fontFamily="'IBM Plex Mono', monospace"
          >
            ${price.toFixed(0)}
          </text>

          {/* Y-axis labels */}
          {yTicks.map((v, i) => (
            <text
              key={i}
              x={PAD.left - 6} y={yPos(v) + 4}
              textAnchor="end" fill="#8888aa"
              fontSize={9} fontFamily="'IBM Plex Mono', monospace"
            >
              {fmtVal(v)}
            </text>
          ))}

          {/* X-axis labels */}
          {strikes.map((strike, i) => {
            if (i % labelStep !== 0 && i !== n - 1) return null;
            return (
              <text
                key={strike}
                x={xCenter(i)} y={H - PAD.bottom + 16}
                textAnchor="middle" fill="#8888aa"
                fontSize={9} fontFamily="'IBM Plex Mono', monospace"
              >
                ${strike}
              </text>
            );
          })}

          {/* King node label */}
          {(() => {
            const v = values[kingIdx];
            if (!v) return null;
            const cx = xCenter(kingIdx);
            const labelY = v >= 0 ? yPos(v) - 6 : yPos(v) + 14;
            return (
              <text
                x={cx} y={labelY}
                textAnchor="middle" fill="#fbbf24"
                fontSize={8} fontFamily="'IBM Plex Mono', monospace"
              >
                👑
              </text>
            );
          })()}
        </svg>
      </div>
    </div>
  );
}

export default function ExposurePage({ ticker, quote }) {
  const [matrix, setMatrix] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState("gex");
  const [scope, setScope] = useState("all");
  const [range, setRange] = useState(0.10); // ±% around spot

  useEffect(() => {
    if (!ticker || !quote) return;
    let active = true;
    setLoading(true);
    setMatrix(null);

    fetchGEXMatrix(ticker, quote.price)
      .then((data) => { if (active) { setMatrix(data); setLoading(false); } })
      .catch(() => { if (active) setLoading(false); });

    return () => { active = false; };
  }, [ticker, quote?.price]);

  if (!ticker) return <EmptyState message="Search a ticker to view exposure charts" />;
  if (loading || !matrix) return <LoadingSpinner />;

  const price = quote?.price ?? 0;
  const today = new Date().toISOString().split("T")[0];

  const strikes = [...matrix.strikes]
    .sort((a, b) => a - b)
    .filter((s) => s >= price * (1 - range) && s <= price * (1 + range));

  const gexValues = strikes.map((strike) => {
    if (scope === "0dte") {
      const cell = matrix.cells[strike]?.[today] ?? {};
      return cell.gex ?? 0;
    }
    return matrix.expirations.reduce((sum, exp) => {
      return sum + (matrix.cells[strike]?.[exp]?.gex ?? 0);
    }, 0);
  });

  const flowValues = strikes.map((strike) => {
    if (scope === "0dte") {
      const cell = matrix.cells[strike]?.[today] ?? {};
      return cell.flowGex ?? 0;
    }
    return matrix.expirations.reduce((sum, exp) => {
      return sum + (matrix.cells[strike]?.[exp]?.flowGex ?? 0);
    }, 0);
  });

  const values = view === "flow" ? flowValues : gexValues;
  const chartTitle = `${ticker} — Net ${view === "flow" ? "Flow " : ""}Gamma Exposure By Strike`;

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="flex gap-1">
          {[{ id: "gex", label: "GEX" }, { id: "flow", label: "Flow GEX" }].map((v) => (
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
        <div className="flex gap-1">
          {[{ id: "all", label: "All exp" }, { id: "0dte", label: "0DTE" }].map((s) => (
            <button
              key={s.id}
              onClick={() => setScope(s.id)}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-mono transition-all",
                scope === s.id
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-surface border border-border text-muted hover:text-text"
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {[0.05, 0.10, 0.15, 0.20].map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-mono transition-all",
                range === r
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-surface border border-border text-muted hover:text-text"
              )}
            >
              ±{(r * 100).toFixed(0)}%
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3 ml-2 text-xs font-mono text-muted">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-green-500/70" /> Positive GEX
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-3 rounded-sm bg-purple-500/70" /> Negative GEX
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t border-dashed border-accent" /> Current price
          </span>
          <span className="flex items-center gap-1 text-yellow-400">👑 King node</span>
        </div>
      </div>

      {/* Bar chart */}
      <GEXBarChart
        strikes={strikes}
        values={values}
        price={price}
        title={chartTitle}
        color={view === "flow" ? "flow" : "gex"}
      />
    </div>
  );
}
