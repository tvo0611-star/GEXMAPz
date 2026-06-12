import { useState, useEffect, useRef } from "react";
import {
  ComposedChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";

function isMarketHours() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short", hour: "numeric", minute: "numeric", hour12: false,
  }).formatToParts(new Date());
  const day = parts.find((p) => p.type === "weekday")?.value;
  if (["Sat", "Sun"].includes(day)) return false;
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0");
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  const totalMin = h * 60 + m;
  return totalMin >= 570 && totalMin < 960;
}

const POLL_MS = 60_000;
const MAX_PTS = 390;

function NOPETooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const nopeEntry = payload.find((p) => p.dataKey === "nope");
  const priceEntry = payload.find((p) => p.dataKey === "price");
  return (
    <div style={{
      background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: 6,
      padding: "8px 10px", fontSize: 11, fontFamily: "IBM Plex Mono",
    }}>
      <div style={{ color: "#666", marginBottom: 4 }}>{label}</div>
      {nopeEntry && (
        <div style={{ color: nopeEntry.value >= 0 ? "#00e5ff" : "#ff4466" }}>
          NOPE: {nopeEntry.value >= 0 ? "+" : ""}{nopeEntry.value?.toFixed(2)}
        </div>
      )}
      {priceEntry && priceEntry.value != null && (
        <div style={{ color: "#e0e0f0" }}>
          Price: ${priceEntry.value?.toFixed(2)}
        </div>
      )}
    </div>
  );
}

export default function NOPEChart({ ticker }) {
  const [open, setOpen] = useState(true);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const timerRef = useRef(null);
  const pollFnRef = useRef(null);

  pollFnRef.current = async () => {
    if (!ticker) return;
    try {
      const res = await fetch(`/api/nope?ticker=${encodeURIComponent(ticker)}`);
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try { const b = await res.json(); if (b.error) msg = b.error; } catch {}
        throw new Error(msg);
      }
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const timeLabel = new Date(data.timestamp).toLocaleTimeString("en-US", {
        timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", hour12: false,
      });
      setHistory((prev) => {
        const pt = { time: timeLabel, nope: data.nope, price: data.underlying?.last ?? null };
        return [...prev, pt].slice(-MAX_PTS);
      });
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!ticker) return;
    setHistory([]);
    setError(null);
    setLoading(true);
    pollFnRef.current().finally(() => setLoading(false));

    const schedule = () => {
      timerRef.current = setTimeout(() => {
        if (isMarketHours()) pollFnRef.current();
        schedule();
      }, POLL_MS);
    };
    schedule();
    return () => clearTimeout(timerRef.current);
  }, [ticker]);

  if (!ticker) return null;

  const lastPt = history.at(-1);
  const lastNope = lastPt?.nope;
  const nopeColor = lastNope == null ? "#666" : lastNope >= 0 ? "#00e5ff" : "#ff4466";

  const nopes = history.map((h) => h.nope).filter((n) => n != null);
  const prices = history.map((h) => h.price).filter((p) => p != null);
  const nopeMin = nopes.length ? Math.floor(Math.min(...nopes) - 5) : -30;
  const nopeMax = nopes.length ? Math.ceil(Math.max(...nopes) + 5) : 30;
  const priceMin = prices.length ? Math.min(...prices) * 0.9995 : undefined;
  const priceMax = prices.length ? Math.max(...prices) * 1.0005 : undefined;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      {/* Header row */}
      <div
        className="flex items-center gap-2 px-4 py-2 cursor-pointer select-none hover:bg-white/5 transition-colors"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="text-muted text-xs font-mono">{open ? "▾" : "▸"}</span>
        <span className="text-xs font-mono font-semibold text-text">NOPE</span>
        <span className="text-xs font-mono text-muted">Net Options Pricing Effect</span>
        <div className="ml-auto flex items-center gap-3">
          {loading && history.length === 0 && (
            <span className="text-xs font-mono text-muted">loading…</span>
          )}
          {error && !loading && (
            <span className="text-xs font-mono" style={{ color: "#ff4466" }} title={error}>error</span>
          )}
          {lastNope != null && (
            <span className="text-xs font-mono font-semibold" style={{ color: nopeColor }}>
              {lastNope >= 0 ? "+" : ""}{lastNope.toFixed(2)}
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="px-4 pb-4">
          {loading && history.length === 0 ? (
            <div className="flex items-center justify-center h-24 text-xs font-mono text-muted">
              Loading NOPE…
            </div>
          ) : history.length === 0 ? (
            <div className="flex items-center justify-center h-28 text-xs font-mono text-center px-4" style={{ color: error ? "#ff4466" : undefined }}>
              {error ? error : "No data yet — polls every 60s during market hours"}
            </div>
          ) : (
            <>
              {/* Legend */}
              <div className="flex items-center gap-4 mb-2 text-xs font-mono text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-px" style={{ background: "#00e5ff" }} />
                  NOPE (left)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-6 h-px" style={{ background: "rgba(224,224,240,0.45)" }} />
                  {ticker} price (right)
                </span>
                <span className="ml-auto">{history.length} pt{history.length !== 1 ? "s" : ""} · 60s</span>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={history} margin={{ top: 4, right: 52, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#666" }}
                    interval="preserveStartEnd"
                    minTickGap={50}
                  />
                  <YAxis
                    yAxisId="nope"
                    domain={[nopeMin, nopeMax]}
                    tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#666" }}
                    width={36}
                    tickFormatter={(v) => v.toFixed(0)}
                  />
                  <YAxis
                    yAxisId="price"
                    orientation="right"
                    domain={prices.length ? [priceMin, priceMax] : ["auto", "auto"]}
                    tick={{ fontSize: 10, fontFamily: "IBM Plex Mono", fill: "#666" }}
                    width={52}
                    tickFormatter={(v) => `$${v.toFixed(0)}`}
                  />
                  <Tooltip content={<NOPETooltip />} />
                  <ReferenceLine yAxisId="nope" y={0} stroke="#4a4a6a" strokeDasharray="4 3" />
                  <Line
                    yAxisId="nope"
                    type="monotone"
                    dataKey="nope"
                    stroke="#00e5ff"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="price"
                    type="monotone"
                    dataKey="price"
                    stroke="rgba(224,224,240,0.45)"
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                    isAnimationActive={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}
    </div>
  );
}
