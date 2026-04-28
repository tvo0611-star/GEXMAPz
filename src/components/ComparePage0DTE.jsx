import { useState, useEffect, useRef } from "react";
import { clsx } from "clsx";
import { Plus, Trash2, TrendingUp, TrendingDown, Target } from "lucide-react";
import { StatCard, LoadingSpinner } from "./UI";
import { fetchQuote } from "../data/mockData";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const fmt = (v, d = 2) => Number(v).toFixed(d);

function buildPLCurve(pos, currentPrice) {
  const { type, strike, premium, contracts, side } = pos;
  const multiplier = contracts * 100;
  const sign = side === "long" ? 1 : -1;
  const range = currentPrice * 0.05;
  const points = [];

  for (let i = -20; i <= 20; i++) {
    const price = currentPrice + (i / 20) * range;
    let intrinsic = 0;
    if (type === "call") intrinsic = Math.max(0, price - strike);
    else intrinsic = Math.max(0, strike - price);

    const pl = sign * (intrinsic - premium) * multiplier;
    points.push({ price: parseFloat(price.toFixed(2)), pl: parseFloat(pl.toFixed(2)) });
  }
  return points;
}

const TYPES = ["call", "put"];
const SIDES = ["long", "short"];

function PositionCard({ pos, onRemove, currentPrice }) {
  const { type, strike, premium, contracts, side, ticker } = pos;
  const multiplier = contracts * 100;
  const sign = side === "long" ? 1 : -1;
  const intrinsic = type === "call" ? Math.max(0, currentPrice - strike) : Math.max(0, strike - currentPrice);
  const currentValue = intrinsic;
  const pl = sign * (currentValue - premium) * multiplier;
  const plPct = (pl / (premium * multiplier)) * 100;
  const curve = buildPLCurve(pos, currentPrice);
  const maxProfit = side === "long" ? Infinity : premium * multiplier;
  const maxLoss = side === "long" ? premium * multiplier : Infinity;

  return (
    <div className="bg-surface border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-3 flex items-center justify-between border-b border-border">
        <div className="flex items-center gap-2">
          <span className={clsx("font-mono text-xs font-bold uppercase px-2 py-0.5 rounded", side === "long" ? "bg-green/10 text-green" : "bg-red/10 text-red")}>
            {side}
          </span>
          <span className={clsx("font-mono text-xs font-semibold uppercase px-2 py-0.5 rounded", type === "call" ? "bg-accent/10 text-accent" : "bg-purple-500/10 text-purple-400")}>
            {type}
          </span>
          <span className="font-mono text-sm font-bold text-text">${strike}</span>
        </div>
        <button onClick={onRemove} className="text-muted hover:text-red transition-colors">
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-3 gap-0 divide-x divide-border px-0 py-0">
        <div className="px-4 py-2">
          <div className="text-xs text-muted font-mono mb-0.5">Entry Premium</div>
          <div className="font-mono text-sm text-text">${fmt(premium)}</div>
        </div>
        <div className="px-4 py-2">
          <div className="text-xs text-muted font-mono mb-0.5">Contracts</div>
          <div className="font-mono text-sm text-text">{contracts}</div>
        </div>
        <div className="px-4 py-2">
          <div className="text-xs text-muted font-mono mb-0.5">P&L</div>
          <div className={clsx("font-mono text-sm font-bold", pl >= 0 ? "text-green" : "text-red")}>
            {pl >= 0 ? "+" : ""}${fmt(pl)} ({plPct >= 0 ? "+" : ""}{fmt(plPct, 1)}%)
          </div>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="text-xs text-muted font-mono mb-2">P&L at Expiration</div>
        <ResponsiveContainer width="100%" height={80}>
          <LineChart data={curve}>
            <XAxis dataKey="price" hide />
            <YAxis hide />
            <Tooltip
              formatter={(v) => [`$${fmt(v)}`, "P&L"]}
              labelFormatter={(l) => `Price: $${l}`}
              contentStyle={{ background: "#0a0a0f", border: "1px solid #1e1e2e", borderRadius: 6, fontSize: 11, fontFamily: "IBM Plex Mono" }}
            />
            <ReferenceLine y={0} stroke="#1e1e2e" />
            <ReferenceLine x={currentPrice} stroke="#00e5ff" strokeDasharray="3 2" />
            <Line type="monotone" dataKey="pl" stroke={pl >= 0 ? "#00ff88" : "#ff4466"} strokeWidth={1.5} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function TickerColumn({ ticker, quote, positions, setPositions, form, setForm }) {
  const price = quote?.price ?? 0;

  const addPosition = () => {
    if (!form[ticker].strike || !form[ticker].premium) return;
    setPositions((ps) => ({
      ...ps,
      [ticker]: [
        ...(ps[ticker] ?? []),
        {
          id: Date.now(),
          ticker,
          type: form[ticker].type,
          side: form[ticker].side,
          strike: parseFloat(form[ticker].strike),
          premium: parseFloat(form[ticker].premium),
          contracts: parseInt(form[ticker].contracts) || 1,
        },
      ],
    }));
    setForm((f) => ({
      ...f,
      [ticker]: { ...f[ticker], strike: "", premium: "" },
    }));
  };

  const totalPL = (positions[ticker] ?? []).reduce((acc, pos) => {
    const intrinsic = pos.type === "call" ? Math.max(0, price - pos.strike) : Math.max(0, pos.strike - price);
    const sign = pos.side === "long" ? 1 : -1;
    return acc + sign * (intrinsic - pos.premium) * pos.contracts * 100;
  }, 0);

  const totalCost = (positions[ticker] ?? []).reduce((acc, pos) => acc + pos.premium * pos.contracts * 100, 0);

  const inputCls = "bg-bg border border-border rounded px-2 py-1.5 text-xs font-mono text-text w-full focus:outline-none focus:border-accent/50 transition-colors";
  const labelCls = "block text-xs text-muted font-mono mb-1";

  return (
    <div className="bg-surface/30 rounded-lg border border-border/30 p-3 flex flex-col">
      {/* Header with ticker and price */}
      {quote && (
        <div className="mb-3 pb-3 border-b border-border/30">
          <div className="font-mono text-sm font-semibold text-accent mb-1">{ticker}</div>
          <div className="text-lg font-bold text-text">${price.toFixed(2)}</div>
          <div className={clsx("font-mono text-xs flex items-center gap-1", quote.change >= 0 ? "text-green" : "text-red")}>
            {quote.change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
            {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePct >= 0 ? "+" : ""}{quote.changePct.toFixed(2)}%)
          </div>
        </div>
      )}

      {/* Stats */}
      {(positions[ticker] ?? []).length > 0 && (
        <div className="mb-3 p-2 bg-surface rounded border border-border/20">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted font-mono mb-0.5">Total P&L</div>
              <div className={clsx("font-bold", totalPL >= 0 ? "text-green" : "text-red")}>
                {totalPL >= 0 ? "+" : ""}${fmt(totalPL)}
              </div>
            </div>
            <div>
              <div className="text-muted font-mono mb-0.5">Cost</div>
              <div className="text-text font-bold">${fmt(totalCost)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Form */}
      <div className="mb-3 space-y-2">
        <div className="grid grid-cols-2 gap-1">
          <div>
            <label className={labelCls}>Type</label>
            <div className="flex gap-1">
              {TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      [ticker]: { ...f[ticker], type: t },
                    }))
                  }
                  className={clsx(
                    "flex-1 py-1 rounded text-xs font-mono capitalize transition-all",
                    form[ticker].type === t
                      ? t === "call"
                        ? "bg-green/10 text-green border border-green/30"
                        : "bg-red/10 text-red border border-red/30"
                      : "bg-bg border border-border text-muted"
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Side</label>
            <div className="flex gap-1">
              {SIDES.map((s) => (
                <button
                  key={s}
                  onClick={() =>
                    setForm((f) => ({
                      ...f,
                      [ticker]: { ...f[ticker], side: s },
                    }))
                  }
                  className={clsx(
                    "flex-1 py-1 rounded text-xs font-mono capitalize transition-all",
                    form[ticker].side === s
                      ? "bg-accent/10 text-accent border border-accent/30"
                      : "bg-bg border border-border text-muted"
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-1">
          <input
            className={inputCls}
            type="number"
            value={form[ticker].strike}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                [ticker]: { ...f[ticker], strike: e.target.value },
              }))
            }
            placeholder="Strike"
          />
          <input
            className={inputCls}
            type="number"
            step="0.01"
            value={form[ticker].premium}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                [ticker]: { ...f[ticker], premium: e.target.value },
              }))
            }
            placeholder="Premium"
          />
        </div>

        <button
          onClick={addPosition}
          className="w-full py-1.5 rounded text-xs font-mono font-semibold bg-accent/10 border border-accent/30 text-accent hover:bg-accent/20 transition-all"
        >
          Add Leg
        </button>
      </div>

      {/* Positions */}
      <div className="space-y-2 flex-1 overflow-y-auto max-h-96">
        {(positions[ticker] ?? []).length === 0 ? (
          <div className="text-center py-4 text-muted">
            <Target size={16} className="mx-auto mb-1 opacity-30" />
            <p className="font-mono text-xs">No positions</p>
          </div>
        ) : (
          (positions[ticker] ?? []).map((pos) => (
            <div key={pos.id} className="bg-bg rounded border border-border/30 p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="flex gap-1">
                  <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-mono font-bold", pos.side === "long" ? "bg-green/10 text-green" : "bg-red/10 text-red")}>
                    {pos.side}
                  </span>
                  <span className={clsx("text-[10px] px-1.5 py-0.5 rounded font-mono font-bold", pos.type === "call" ? "bg-accent/10 text-accent" : "bg-purple-500/10 text-purple-400")}>
                    {pos.type}
                  </span>
                </div>
                <button onClick={() => setPositions((ps) => ({ ...ps, [ticker]: (ps[ticker] ?? []).filter((p) => p.id !== pos.id) }))} className="text-muted hover:text-red text-xs">
                  ✕
                </button>
              </div>
              <div className="text-xs text-text font-mono mb-1">Strike: ${pos.strike}</div>
              <div className="text-xs text-muted font-mono grid grid-cols-2 gap-1">
                <div>Prem: ${fmt(pos.premium)}</div>
                <div>Qty: {pos.contracts}</div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function ComparePage0DTE() {
  const [quotes, setQuotes] = useState({
    QQQ: null,
    SPY: null,
    SPX: null,
  });
  const [loading, setLoading] = useState(true);
  const [positions, setPositions] = useState({
    QQQ: [],
    SPY: [],
    SPX: [],
  });
  const [form, setForm] = useState({
    QQQ: { type: "call", side: "long", strike: "", premium: "", contracts: "1" },
    SPY: { type: "call", side: "long", strike: "", premium: "", contracts: "1" },
    SPX: { type: "call", side: "long", strike: "", premium: "", contracts: "1" },
  });
  const containerRef = useRef(null);

  useEffect(() => {
    Promise.all([fetchQuote("QQQ"), fetchQuote("SPY"), fetchQuote("SPX")])
      .then(([qqq, spy, spx]) => {
        setQuotes({ QQQ: qqq, SPY: spy, SPX: spx });
      })
      .finally(() => setLoading(false));
  }, []);

  // Auto-scroll to price level
  useEffect(() => {
    if (!containerRef.current || loading) return;

    // Get average price to determine scroll position
    const prices = Object.values(quotes).filter((q) => q?.price).map((q) => q.price);
    if (prices.length === 0) return;

    const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
    const maxPrice = Math.max(...prices);
    const minPrice = Math.min(...prices);

    // Center on the middle price level
    const targetPrice = (maxPrice + minPrice) / 2;
    const scrollPercent = (targetPrice - minPrice) / (maxPrice - minPrice) * 100;

    // Scroll the container to approximately center the view on the relevant price range
    const container = containerRef.current;
    const scrollHeight = container.scrollHeight - container.clientHeight;
    container.scrollTop = (scrollHeight * scrollPercent) / 100 * 0.5; // 0.5 to center better
  }, [quotes, loading]);

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <div className="mb-4">
        <h2 className="text-lg font-mono font-semibold text-accent mb-2">0DTE Comparison</h2>
        <p className="text-sm font-mono text-muted">Track positions side by side across QQQ, SPY, and SPX</p>
      </div>

      <div
        ref={containerRef}
        className="grid grid-cols-3 gap-3 auto-rows-min"
        style={{ maxHeight: "calc(100vh - 200px)", overflowY: "auto" }}
      >
        {["QQQ", "SPY", "SPX"].map((ticker) => (
          <TickerColumn
            key={ticker}
            ticker={ticker}
            quote={quotes[ticker]}
            positions={positions}
            setPositions={setPositions}
            form={form}
            setForm={setForm}
          />
        ))}
      </div>
    </div>
  );
}
