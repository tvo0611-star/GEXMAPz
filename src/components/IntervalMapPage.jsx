import { useState, useEffect, useRef } from "react";
import { fetchGEXMatrix } from "../data/mockData";
import { LoadingSpinner, EmptyState } from "./UI";
import { clsx } from "clsx";

const TRADIER_TOKEN = import.meta.env.VITE_TRADIER_TOKEN;

async function fetchCandles(ticker) {
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}`;
  const url =
    `https://api.tradier.com/v1/markets/timesales` +
    `?symbol=${ticker}&interval=5min&start=${encodeURIComponent(dateStr + " 09:30")}&end=${encodeURIComponent(dateStr + " 16:00")}&session_filter=open`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TRADIER_TOKEN}`, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Tradier ${res.status}`);
  const json = await res.json();
  const series = json?.series?.data;
  if (!series) return [];
  const list = Array.isArray(series) ? series : [series];
  return list.map((bar) => ({
    time: new Date(bar.time).getTime(),
    open: bar.open,
    high: bar.high,
    low: bar.low,
    close: bar.close,
  }));
}

function IntervalMap({ ticker, candles, strikes, gexByStrike, price, flipPoint, range }) {
  const containerRef = useRef(null);
  const [width, setWidth] = useState(900);
  const [hovered, setHovered] = useState(null); // { strike, time, gex }

  useEffect(() => {
    if (!containerRef.current) return;
    setWidth(containerRef.current.clientWidth);
    const ro = new ResizeObserver(() => {
      if (containerRef.current) setWidth(containerRef.current.clientWidth);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  if (!candles.length || !strikes.length) {
    return (
      <div className="bg-surface border border-border rounded-lg flex items-center justify-center h-64 text-muted font-mono text-xs">
        Waiting for intraday data…
      </div>
    );
  }

  const H = 420;
  const PAD = { top: 20, right: 24, bottom: 48, left: 72 };
  const chartW = Math.max(1, width - PAD.left - PAD.right);
  const chartH = H - PAD.top - PAD.bottom;

  // Filter strikes to range
  const visible = strikes.filter((s) => s >= price * (1 - range) && s <= price * (1 + range));
  if (!visible.length) return null;

  const yMin = Math.min(...visible);
  const yMax = Math.max(...visible);
  const yPad = (yMax - yMin) * 0.08 || 1;
  const yLo = yMin - yPad;
  const yHi = yMax + yPad;
  const yPos = (v) => PAD.top + ((yHi - v) / (yHi - yLo)) * chartH;

  // X scale over candle times
  const times = candles.map((c) => c.time);
  const tMin = times[0];
  const tMax = times[times.length - 1];
  const xPos = (t) => PAD.left + ((t - tMin) / Math.max(tMax - tMin, 1)) * chartW;

  // Slot width for dots (one per candle per strike)
  const slotW = chartW / Math.max(times.length, 1);
  const maxAbsGEX = Math.max(...visible.map((s) => Math.abs(gexByStrike[s] ?? 0)), 1);
  const dotR = (gex) => 2 + (Math.abs(gex) / maxAbsGEX) * 7;

  // Y-axis tick strikes (show ~8)
  const tickStep = Math.ceil(visible.length / 8);
  const yTicks = visible.filter((_, i) => i % tickStep === 0);

  // X-axis time labels (show ~8)
  const xLabelStep = Math.ceil(times.length / 8);
  const fmtTime = (ms) => {
    const d = new Date(ms);
    const h = d.toLocaleString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", hour12: true });
    return h;
  };

  // Current price line — last candle close
  const lastClose = candles[candles.length - 1]?.close ?? price;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-accent">{ticker} — Interval Map (GEX) · 5 min</span>
        <div className="flex items-center gap-4 text-xs font-mono text-muted">
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-green-500/70" /> +GEX</span>
          <span className="flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-full bg-purple-500/70" /> −GEX</span>
          <span className="flex items-center gap-1"><span className="inline-block w-4 border-t-2 border-cyan-400" /> Price</span>
        </div>
      </div>

      {/* Tooltip */}
      {hovered && (
        <div
          className="fixed z-50 pointer-events-none bg-bg border border-border rounded-lg px-3 py-2 text-xs font-mono shadow-xl"
          style={{ left: hovered.x + 12, top: hovered.y - 40 }}
        >
          <div className="text-accent font-semibold">${hovered.strike} · {fmtTime(hovered.time)}</div>
          <div className={hovered.gex >= 0 ? "text-green-400" : "text-purple-400"}>
            GEX: {hovered.gex >= 0 ? "+" : ""}{Math.round(hovered.gex).toLocaleString()}
          </div>
        </div>
      )}

      <div ref={containerRef}>
        <svg width={width} height={H} style={{ display: "block" }}>
          {/* Horizontal grid lines at each visible strike */}
          {visible.map((strike) => (
            <line
              key={strike}
              x1={PAD.left} y1={yPos(strike)}
              x2={width - PAD.right} y2={yPos(strike)}
              stroke="rgba(255,255,255,0.04)" strokeWidth={1}
            />
          ))}

          {/* GEX dots — one per strike per time interval */}
          {visible.map((strike) => {
            const gex = gexByStrike[strike] ?? 0;
            if (gex === 0) return null;
            const r = dotR(gex);
            const fill = gex >= 0 ? "rgba(34,197,94,0.65)" : "rgba(139,92,246,0.65)";
            const cy = yPos(strike);
            return times.map((t, ti) => {
              const cx = xPos(t);
              return (
                <circle
                  key={`${strike}-${ti}`}
                  cx={cx} cy={cy} r={r}
                  fill={fill}
                  onMouseEnter={(e) => setHovered({ strike, time: t, gex, x: e.clientX, y: e.clientY })}
                  onMouseLeave={() => setHovered(null)}
                  style={{ cursor: "crosshair" }}
                />
              );
            });
          })}

          {/* Gamma flip line */}
          {flipPoint && flipPoint >= yLo && flipPoint <= yHi && (
            <>
              <line
                x1={PAD.left} y1={yPos(flipPoint)}
                x2={width - PAD.right} y2={yPos(flipPoint)}
                stroke="#fbbf24" strokeWidth={1.5} strokeDasharray="6,4"
              />
              <text x={PAD.left + 4} y={yPos(flipPoint) - 4} fill="#fbbf24" fontSize={9} fontFamily="'IBM Plex Mono', monospace">
                γ Flip ${flipPoint}
              </text>
            </>
          )}

          {/* Price line (candle closes) */}
          <polyline
            points={candles.map((c) => `${xPos(c.time)},${yPos(c.close)}`).join(" ")}
            fill="none"
            stroke="#00e5ff"
            strokeWidth={2}
          />

          {/* Current price dot */}
          <circle cx={xPos(times[times.length - 1])} cy={yPos(lastClose)} r={4} fill="#00e5ff" />
          <text
            x={xPos(times[times.length - 1]) + 6} y={yPos(lastClose) + 4}
            fill="#00e5ff" fontSize={9} fontFamily="'IBM Plex Mono', monospace"
          >
            ${lastClose.toFixed(2)}
          </text>

          {/* Y-axis labels */}
          {yTicks.map((strike) => (
            <text
              key={strike}
              x={PAD.left - 6} y={yPos(strike) + 4}
              textAnchor="end" fill="#8888aa"
              fontSize={9} fontFamily="'IBM Plex Mono', monospace"
            >
              ${strike}
            </text>
          ))}

          {/* X-axis labels */}
          {times.map((t, i) => {
            if (i % xLabelStep !== 0 && i !== times.length - 1) return null;
            return (
              <text
                key={t}
                x={xPos(t)} y={H - PAD.bottom + 16}
                textAnchor="middle" fill="#8888aa"
                fontSize={9} fontFamily="'IBM Plex Mono', monospace"
              >
                {fmtTime(t)}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function IntervalMapPage({ ticker, quote }) {
  const [matrix, setMatrix] = useState(null);
  const [candles, setCandles] = useState([]);
  const [loadingMatrix, setLoadingMatrix] = useState(false);
  const [view, setView] = useState("gex");
  const [range, setRange] = useState(0.10);

  // Fetch matrix
  useEffect(() => {
    if (!ticker || !quote) return;
    let active = true;
    setLoadingMatrix(true);
    setMatrix(null);
    fetchGEXMatrix(ticker, quote.price)
      .then((data) => { if (active) { setMatrix(data); setLoadingMatrix(false); } })
      .catch(() => { if (active) setLoadingMatrix(false); });
    return () => { active = false; };
  }, [ticker, quote?.price]);

  // Fetch candles, refresh every 30s
  useEffect(() => {
    if (!ticker) return;
    let active = true;

    const load = () =>
      fetchCandles(ticker)
        .then((data) => { if (active) setCandles(data); })
        .catch(() => {});

    load();
    const iv = setInterval(load, 30000);
    return () => { active = false; clearInterval(iv); };
  }, [ticker]);

  if (!ticker) return <EmptyState message="Search a ticker to view the interval map" />;
  if (loadingMatrix || !matrix) return <LoadingSpinner />;

  const price = quote?.price ?? 0;
  const strikes = [...matrix.strikes].sort((a, b) => a - b);

  // GEX by strike (total across all expirations)
  const gexByStrike = {};
  strikes.forEach((strike) => {
    gexByStrike[strike] = matrix.expirations.reduce((sum, exp) => {
      const cell = matrix.cells[strike]?.[exp] ?? {};
      return sum + ((view === "flow" ? cell.flowGex : cell.gex) ?? 0);
    }, 0);
  });

  // Gamma flip — zero crossing of total GEX sorted by strike
  const sorted = [...strikes].sort((a, b) => a - b);
  let flipPoint = null;
  let prev = null;
  for (const s of sorted) {
    const v = gexByStrike[s] ?? 0;
    if (prev !== null && prev < 0 && v >= 0) { flipPoint = s; break; }
    prev = v;
  }

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
      </div>

      <IntervalMap
        ticker={ticker}
        candles={candles}
        strikes={strikes}
        gexByStrike={gexByStrike}
        price={price}
        flipPoint={flipPoint}
        range={range}
      />
    </div>
  );
}
