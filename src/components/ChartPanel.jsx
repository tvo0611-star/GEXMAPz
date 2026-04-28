import { useEffect, useRef, useState } from "react";
import { createChart, CandlestickSeries, LineStyle } from "lightweight-charts";

const TRADIER_TOKEN = import.meta.env.VITE_TRADIER_TOKEN;

async function fetchCandles(ticker) {
  // Build today's date range in ET
  const now = new Date();
  const et = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const pad = (n) => String(n).padStart(2, "0");
  const dateStr = `${et.getFullYear()}-${pad(et.getMonth() + 1)}-${pad(et.getDate())}`;
  const start = `${dateStr} 09:30`;
  const end   = `${dateStr} 16:00`;

  const url =
    `https://api.tradier.com/v1/markets/timesales` +
    `?symbol=${ticker}&interval=5min&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}&session_filter=open`;

  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${TRADIER_TOKEN}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Tradier ${res.status}`);
  const json = await res.json();

  const series = json?.series?.data;
  if (!series) throw new Error("No timesales data");
  const list = Array.isArray(series) ? series : [series];

  return list.map((bar) => ({
    time: Math.floor(new Date(bar.time).getTime() / 1000),
    open:  bar.open,
    high:  bar.high,
    low:   bar.low,
    close: bar.close,
  }));
}

const CHART_OPTS = {
  layout: {
    background: { color: "#0e0e14" },
    textColor: "#8888aa",
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 11,
  },
  grid: {
    vertLines: { color: "rgba(255,255,255,0.04)" },
    horzLines: { color: "rgba(255,255,255,0.04)" },
  },
  rightPriceScale: { borderColor: "rgba(255,255,255,0.1)" },
  timeScale: {
    borderColor: "rgba(255,255,255,0.1)",
    timeVisible: true,
    secondsVisible: false,
  },
  height: 320,
};

const CANDLE_OPTS = {
  upColor: "#22c55e",
  downColor: "#ef4444",
  borderVisible: false,
  wickUpColor: "#22c55e",
  wickDownColor: "#ef4444",
};

function buildPriceLines(series, callWalls, putWalls, flipPoint, maxPain, gexLevels, maxAbsGEX) {
  const lines = [];

  // GEX heatmap lines — drawn first so walls render on top
  const topGEX = [...gexLevels]
    .sort((a, b) => Math.abs(b.gex) - Math.abs(a.gex))
    .slice(0, 25);

  topGEX.forEach(({ strike, gex }) => {
    const relMag = maxAbsGEX > 0 ? Math.min(1, Math.abs(gex) / maxAbsGEX) : 0;
    if (relMag < 0.05) return;
    const alpha = (0.25 + relMag * 0.55).toFixed(2);
    const color = gex >= 0
      ? `rgba(34,197,94,${alpha})`
      : `rgba(139,92,246,${alpha})`;
    lines.push(
      series.createPriceLine({
        price: strike,
        color,
        lineWidth: relMag >= 0.5 ? 2 : 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false,
        title: "",
      })
    );
  });

  const cw_colors = ["#22c55e", "#86efac", "#bbf7d0"];
  callWalls.slice(0, 3).forEach((w, i) => {
    lines.push(
      series.createPriceLine({
        price: w.strike,
        color: cw_colors[i],
        lineWidth: i === 0 ? 2 : 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `CW${i + 1}`,
      })
    );
  });

  const pw_colors = ["#ef4444", "#fca5a5", "#fecaca"];
  putWalls.slice(0, 3).forEach((w, i) => {
    lines.push(
      series.createPriceLine({
        price: w.strike,
        color: pw_colors[i],
        lineWidth: i === 0 ? 2 : 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: `PW${i + 1}`,
      })
    );
  });

  if (flipPoint) {
    lines.push(
      series.createPriceLine({
        price: flipPoint,
        color: "#fbbf24",
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "γ Flip",
      })
    );
  }

  if (maxPain) {
    lines.push(
      series.createPriceLine({
        price: maxPain,
        color: "#ffffff",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "Max Pain",
      })
    );
  }

  return lines;
}

export default function ChartPanel({ ticker, callWalls = [], putWalls = [], flipPoint, maxPain, gexLevels = [], maxAbsGEX = 1 }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const seriesRef = useRef(null);
  const priceLinesRef = useRef([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      ...CHART_OPTS,
      width: containerRef.current.clientWidth,
    });
    const series = chart.addSeries(CandlestickSeries, CANDLE_OPTS);

    chartRef.current = chart;
    seriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (containerRef.current) {
        chart.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load candles whenever ticker changes
  useEffect(() => {
    if (!seriesRef.current) return;
    setError(null);
    setLoading(true);

    let active = true;

    const load = () =>
      fetchCandles(ticker)
        .then((candles) => {
          if (!active || !seriesRef.current) return;
          seriesRef.current.setData(candles);
          chartRef.current?.timeScale().fitContent();
          setLoading(false);
        })
        .catch((err) => {
          if (!active) return;
          console.error("ChartPanel fetch failed:", err);
          setError("Could not load price data from Tradier.");
          setLoading(false);
        });

    load();
    const interval = setInterval(load, 30000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [ticker]);

  // Rebuild price lines whenever levels change
  useEffect(() => {
    if (!seriesRef.current) return;
    priceLinesRef.current.forEach((pl) => seriesRef.current.removePriceLine(pl));
    priceLinesRef.current = buildPriceLines(
      seriesRef.current,
      callWalls,
      putWalls,
      flipPoint,
      maxPain,
      gexLevels,
      maxAbsGEX,
    );
  }, [callWalls, putWalls, flipPoint, maxPain, gexLevels, maxAbsGEX]);

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden mb-4">
      <div className="px-4 py-2 border-b border-border flex items-center gap-4">
        <span className="font-mono text-xs font-semibold text-accent">{ticker} — 5m</span>
        <div className="flex items-center gap-3 text-xs font-mono text-muted flex-wrap">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-2.5 rounded-sm bg-green-400/50" />
            <span className="inline-block w-3 h-2.5 rounded-sm bg-purple-500/50" />
            GEX Heat
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed border-green-400" />
            Call Walls
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dashed border-red-400" />
            Put Walls
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t-2 border-dotted border-yellow-400" />
            γ Flip
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-4 border-t border-dotted border-white" />
            Max Pain
          </span>
        </div>
        {loading && <span className="ml-auto text-xs text-muted font-mono animate-pulse">Loading…</span>}
      </div>

      {error ? (
        <div className="flex items-center justify-center h-40 text-xs font-mono text-muted">
          {error}
        </div>
      ) : (
        <div ref={containerRef} style={{ height: 320 }} />
      )}
    </div>
  );
}
