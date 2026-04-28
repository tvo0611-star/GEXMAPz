import { useState } from "react";
import { clsx } from "clsx";
import { Plus, Trash2, TrendingUp, TrendingDown, Target } from "lucide-react";
import { StatCard } from "./UI";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

const fmt = (v, d = 2) => Number(v).toFixed(d);

// Simulate P&L curve for a single-leg option
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
  const currentValue = intrinsic; // simplified: assume same IV
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
          <span className="font-mono text-sm font-bold text-text">{ticker} ${strike}</span>
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

      {/* P&L curve */}
      <div className="px-4 pb-3">
        <div className="text-xs text-muted font-mono mb-2">P&L at Expiration</div>
        <ResponsiveContainer width="100%" height={100}>
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
            <Line
              type="monotone"
              dataKey="pl"
              stroke={pl >= 0 ? "#00ff88" : "#ff4466"}
              strokeWidth={1.5}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
        <div className="flex justify-between text-xs font-mono text-muted mt-1">
          <span>Max Loss: {maxLoss === Infinity ? "Unlimited" : `$${fmt(maxLoss)}`}</span>
          <span>Max Profit: {maxProfit === Infinity ? "Unlimited" : `$${fmt(maxProfit)}`}</span>
        </div>
      </div>
    </div>
  );
}

export default function ZeroDTEPage({ ticker, quote }) {
  const [positions, setPositions] = useState([]);
  const [form, setForm] = useState({
    ticker: ticker ?? "",
    type: "call",
    side: "long",
    strike: "",
    premium: "",
    contracts: "1",
  });

  const price = quote?.price ?? 0;

  const addPosition = () => {
    if (!form.strike || !form.premium) return;
    setPositions([...positions, {
      id: Date.now(),
      ticker: form.ticker || ticker || "?",
      type: form.type,
      side: form.side,
      strike: parseFloat(form.strike),
      premium: parseFloat(form.premium),
      contracts: parseInt(form.contracts) || 1,
    }]);
    setForm((f) => ({ ...f, strike: "", premium: "" }));
  };

  const totalPL = positions.reduce((acc, pos) => {
    const intrinsic = pos.type === "call" ? Math.max(0, price - pos.strike) : Math.max(0, pos.strike - price);
    const sign = pos.side === "long" ? 1 : -1;
    return acc + sign * (intrinsic - pos.premium) * pos.contracts * 100;
  }, 0);

  const totalCost = positions.reduce((acc, pos) => acc + pos.premium * pos.contracts * 100, 0);

  const inputCls = "bg-bg border border-border rounded px-2 py-1.5 text-xs font-mono text-text w-full focus:outline-none focus:border-accent/50 transition-colors";
  const labelCls = "block text-xs text-muted font-mono mb-1";

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      {/* Summary stats */}
      {positions.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="TOTAL P&L" value={`${totalPL >= 0 ? "+" : ""}$${totalPL.toFixed(2)}`} color={totalPL >= 0 ? "text-green" : "text-red"} />
          <StatCard label="COST BASIS" value={`$${totalCost.toFixed(2)}`} sub="Premium paid/received" />
          <StatCard label="POSITIONS" value={positions.length} sub="Open legs" color="text-accent" />
          <StatCard label="P&L %" value={`${totalCost > 0 ? ((totalPL / totalCost) * 100).toFixed(1) : "0"}%`} color={totalPL >= 0 ? "text-green" : "text-red"} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Add position form */}
        <div className="bg-surface border border-border rounded-lg p-4 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Plus size={14} className="text-accent" />
            <span className="font-mono text-xs font-semibold text-text">Add Position</span>
          </div>

          <div className="space-y-3">
            <div>
              <label className={labelCls}>Ticker</label>
              <input
                className={inputCls}
                value={form.ticker}
                onChange={(e) => setForm((f) => ({ ...f, ticker: e.target.value.toUpperCase() }))}
                placeholder={ticker ?? "AAPL"}
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Type</label>
                <div className="flex gap-1">
                  {TYPES.map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      className={clsx(
                        "flex-1 py-1.5 rounded text-xs font-mono capitalize transition-all",
                        form.type === t
                          ? t === "call" ? "bg-green/10 text-green border border-green/30" : "bg-red/10 text-red border border-red/30"
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
                      onClick={() => setForm((f) => ({ ...f, side: s }))}
                      className={clsx(
                        "flex-1 py-1.5 rounded text-xs font-mono capitalize transition-all",
                        form.side === s
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

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Strike</label>
                <input
                  className={inputCls}
                  type="number"
                  value={form.strike}
                  onChange={(e) => setForm((f) => ({ ...f, strike: e.target.value }))}
                  placeholder={price ? String(Math.round(price / 5) * 5) : "500"}
                />
              </div>
              <div>
                <label className={labelCls}>Premium ($)</label>
                <input
                  className={inputCls}
                  type="number"
                  step="0.01"
                  value={form.premium}
                  onChange={(e) => setForm((f) => ({ ...f, premium: e.target.value }))}
                  placeholder="2.50"
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Contracts</label>
              <input
                className={inputCls}
                type="number"
                value={form.contracts}
                onChange={(e) => setForm((f) => ({ ...f, contracts: e.target.value }))}
                min="1"
                placeholder="1"
              />
            </div>

            <button
              onClick={addPosition}
              className="w-full py-2 rounded bg-accent/10 border border-accent/30 text-accent font-mono text-xs font-semibold hover:bg-accent/20 transition-all glow"
            >
              + Add Leg
            </button>

            {price > 0 && (
              <div className="text-xs text-muted font-mono text-center">
                ATM strike ≈ ${Math.round(price / 5) * 5}
              </div>
            )}
          </div>
        </div>

        {/* Position cards */}
        <div className="lg:col-span-2 space-y-4">
          {positions.length === 0 ? (
            <div className="bg-surface border border-border rounded-lg flex flex-col items-center justify-center py-20 text-muted">
              <Target size={32} className="mb-3 opacity-30" />
              <p className="font-mono text-xs">No positions yet. Add a leg to start tracking.</p>
              <p className="font-mono text-xs mt-1 text-muted/50">Perfect for tracking 0DTE scalps, CSPs, or spreads.</p>
            </div>
          ) : (
            positions.map((pos) => (
              <PositionCard
                key={pos.id}
                pos={pos}
                onRemove={() => setPositions((ps) => ps.filter((p) => p.id !== pos.id))}
                currentPrice={price}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
