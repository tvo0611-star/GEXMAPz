import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { fetchChain, fetchExpirations } from "../data/mockData";
import { StatCard, LoadingSpinner, EmptyState } from "./UI";
import { clsx } from "clsx";

const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toFixed(d));
const fmtK = (v) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);

function GreekCell({ value, positive = value > 0 }) {
  return (
    <td className={clsx("px-2 py-1.5 text-right font-mono text-xs", positive ? "text-green" : "text-red")}>
      {fmt(value, 4)}
    </td>
  );
}

function IVBar({ iv }) {
  const pct = Math.min(100, iv * 50); // scale: 200% IV = full bar
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1 bg-border rounded-full overflow-hidden">
        <div className="h-full bg-accent/60 rounded-full" style={{ width: `${pct}%` }} />
      </div>
      <span className="font-mono text-xs text-muted">{fmt(iv * 100, 1)}%</span>
    </div>
  );
}

function VolumeBar({ volume, maxVolume, isCall = true }) {
  const pct = maxVolume > 0 ? (volume / maxVolume) * 100 : 0;
  const color = isCall ? "bg-orange-500/70" : "bg-blue-500/70";
  return (
    <div className="h-6 rounded flex items-center overflow-hidden" style={{ background: "rgba(20,20,30,0.5)", border: "1px solid rgba(255,255,255,0.1)" }}>
      <div className={clsx(color, "h-full transition-all")} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function ChainPage({ ticker, quote }) {
  const [expirations, setExpirations] = useState([]);
  const [selectedExp, setSelectedExp] = useState(null);
  const [chain, setChain] = useState(null);
  const [loading, setLoading] = useState(false);
  const [side, setSide] = useState("both"); // both | calls | puts
  const [filter, setFilter] = useState("all"); // all | itm | otm
  const [viewMode, setViewMode] = useState("volume"); // volume | greeks
  const [rangeMultiplier, setRangeMultiplier] = useState(0.1); // +/- percentage
  const initialLoadRef = useRef(true);
  const containerRef = useRef(null);
  const initialScrollDoneRef = useRef(false);

  useEffect(() => {
    if (!ticker) return;
    fetchExpirations(ticker).then((exps) => {
      setExpirations(exps);
      setSelectedExp(exps[0] ?? null);
    });
  }, [ticker]);

  const price = quote?.price ?? 0;

  useEffect(() => {
    if (!selectedExp || !quote) return;
    let active = true;

    initialScrollDoneRef.current = false;

    const loadChain = async () => {
      if (initialLoadRef.current) setLoading(true);
      try {
        const data = await fetchChain(ticker, selectedExp, price, rangeMultiplier);
        if (active) setChain(data);
      } catch (error) {
        console.error("Chain refresh failed:", error);
      } finally {
        if (active) {
          setLoading(false);
          initialLoadRef.current = false;
        }
      }
    };

    loadChain();
    const interval = setInterval(loadChain, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [selectedExp, ticker, price, rangeMultiplier]);

  useLayoutEffect(() => {
    if (!containerRef.current || loading || initialScrollDoneRef.current || !chain) return;
    const atmRow = containerRef.current.querySelector("[data-atm]");
    if (atmRow) {
      atmRow.scrollIntoView({ block: "center", behavior: "smooth" });
      initialScrollDoneRef.current = true;
    }
  }, [loading, chain]);

  if (!ticker) return <EmptyState message="Search a ticker above to load the options chain" />;

  const filterStrikes = (rows, isCall) => {
    if (filter === "itm") return rows.filter((r) => isCall ? r.strike < price : r.strike > price);
    if (filter === "otm") return rows.filter((r) => isCall ? r.strike > price : r.strike < price);
    return rows;
  };

  // Compute max volume for scaling
  let maxVolume = 1;
  if (chain) {
    chain.calls.forEach((r) => { if (r.volume > maxVolume) maxVolume = r.volume; });
    chain.puts.forEach((r) => { if (r.volume > maxVolume) maxVolume = r.volume; });
  }

  // Get ATM strike (closest to price)
  let atmStrike = null;
  if (chain && price > 0) {
    const allStrikes = [...new Set([...chain.calls.map(c => c.strike), ...chain.puts.map(p => p.strike)])].sort((a, b) => a - b);
    let closestStrike = allStrikes[0];
    let closestDist = Math.abs(allStrikes[0] - price);
    allStrikes.forEach((s) => {
      const dist = Math.abs(s - price);
      if (dist < closestDist) {
        closestDist = dist;
        closestStrike = s;
      }
    });
    atmStrike = closestStrike;
  }

  const colHeader = "px-2 py-2 text-left text-xs font-mono text-muted font-normal border-b border-border";
  const colHeaderR = "px-2 py-2 text-right text-xs font-mono text-muted font-normal border-b border-border";

  const GreeksView = () => (
    <div className={clsx("gap-4", side === "both" ? "grid grid-cols-1 xl:grid-cols-2" : "flex")}>
      {(side === "both" || side === "calls") && <CallsTable rows={chain.calls} />}
      {(side === "both" || side === "puts") && <PutsTable rows={chain.puts} />}
    </div>
  );

  const CallsTable = ({ rows }) => (
    <div className="bg-surface border border-border rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-green">CALLS</span>
        {chain.dte !== null && <span className="font-mono text-xs text-muted">{chain.dte}DTE</span>}
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className={colHeader}>IV</th>
            <th className={colHeaderR}>Bid</th>
            <th className={colHeaderR}>Ask</th>
            <th className={colHeaderR}>Mid</th>
            <th className={colHeaderR}>Δ</th>
            <th className={colHeaderR}>Γ</th>
            <th className={colHeaderR}>Θ</th>
            <th className={colHeaderR}>Vega</th>
            <th className={colHeaderR}>OI</th>
            <th className={colHeaderR}>Vol</th>
            <th className="px-2 py-2 text-right text-xs font-mono text-accent font-semibold border-b border-border">Strike</th>
          </tr>
        </thead>
        <tbody>
          {filterStrikes(rows, true).map((r) => {
            const itm = r.strike < price;
            const isATM = r.strike === atmStrike;
            return (
              <tr key={r.strike} data-atm={isATM || undefined} className={clsx("chain-row transition-colors", itm ? "bg-green/5" : "")}>
                <td className="px-2 py-1.5"><IVBar iv={r.iv} /></td>
                <td className="px-2 py-1.5 text-right font-mono text-text">{fmt(r.bid)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-text">{fmt(r.ask)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-accent">{fmt(r.mid)}</td>
                <GreekCell value={r.delta} />
                <GreekCell value={r.gamma} positive />
                <GreekCell value={r.theta} positive={false} />
                <GreekCell value={r.vega} positive />
                <td className="px-2 py-1.5 text-right font-mono text-muted">{fmtK(r.oi)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-muted">{fmtK(r.volume)}</td>
                <td className={clsx("px-2 py-1.5 text-right font-mono font-semibold", itm ? "text-green" : "text-text")}>
                  {r.strike}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const PutsTable = ({ rows }) => (
    <div className="bg-surface border border-border rounded-lg overflow-x-auto">
      <div className="px-3 py-2 border-b border-border flex items-center justify-between">
        <span className="font-mono text-xs font-semibold text-red">PUTS</span>
        {chain.dte !== null && <span className="font-mono text-xs text-muted">{chain.dte}DTE</span>}
      </div>
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-xs font-mono text-accent font-semibold border-b border-border">Strike</th>
            <th className={colHeaderR}>IV</th>
            <th className={colHeaderR}>Bid</th>
            <th className={colHeaderR}>Ask</th>
            <th className={colHeaderR}>Mid</th>
            <th className={colHeaderR}>Δ</th>
            <th className={colHeaderR}>Γ</th>
            <th className={colHeaderR}>Θ</th>
            <th className={colHeaderR}>Vega</th>
            <th className={colHeaderR}>OI</th>
            <th className={colHeaderR}>Vol</th>
          </tr>
        </thead>
        <tbody>
          {filterStrikes(rows, false).map((r) => {
            const itm = r.strike > price;
            const isATM = r.strike === atmStrike;
            return (
              <tr key={r.strike} data-atm={isATM || undefined} className={clsx("chain-row transition-colors", itm ? "bg-red/5" : "")}>
                <td className={clsx("px-2 py-1.5 text-left font-mono font-semibold", itm ? "text-red" : "text-text")}>
                  {r.strike}
                </td>
                <td className="px-2 py-1.5"><div className="flex justify-end"><IVBar iv={r.iv} /></div></td>
                <td className="px-2 py-1.5 text-right font-mono text-text">{fmt(r.bid)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-text">{fmt(r.ask)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-accent">{fmt(r.mid)}</td>
                <GreekCell value={r.delta} positive={false} />
                <GreekCell value={r.gamma} positive />
                <GreekCell value={r.theta} positive={false} />
                <GreekCell value={r.vega} positive />
                <td className="px-2 py-1.5 text-right font-mono text-muted">{fmtK(r.oi)}</td>
                <td className="px-2 py-1.5 text-right font-mono text-muted">{fmtK(r.volume)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const VolumeView = () => {
    // Create merged strike list with calls and puts
    const allStrikes = new Set();
    chain.calls.forEach((c) => allStrikes.add(c.strike));
    chain.puts.forEach((p) => allStrikes.add(p.strike));

    const mergedRows = [...allStrikes]
      .sort((a, b) => b - a)
      .map((strike) => {
        const call = chain.calls.find((c) => c.strike === strike);
        const put = chain.puts.find((p) => p.strike === strike);
        return { strike, call, put };
      });

    const filteredRows = mergedRows.filter((row) => {
      if (filter === "itm") {
        if (side === "calls" && row.call && row.call.strike >= price) return false;
        if (side === "puts" && row.put && row.put.strike <= price) return false;
        if (side === "both" && (!row.call || row.call.strike >= price) && (!row.put || row.put.strike <= price)) return false;
      } else if (filter === "otm") {
        if (side === "calls" && row.call && row.call.strike <= price) return false;
        if (side === "puts" && row.put && row.put.strike >= price) return false;
        if (side === "both" && (!row.call || row.call.strike <= price) && (!row.put || row.put.strike >= price)) return false;
      }
      if (side === "calls" && !row.call) return false;
      if (side === "puts" && !row.put) return false;
      return true;
    });

    return (
      <div className="bg-surface border border-border rounded-lg overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border">
              {(side === "both" || side === "calls") && (
                <>
                  <th className="px-3 py-3 text-right text-xs font-mono text-orange-400 font-semibold whitespace-nowrap">Call OI</th>
                  <th className="px-3 py-3 text-right text-xs font-mono text-orange-400 font-semibold whitespace-nowrap">Vol</th>
                  <th className="px-3 py-3 text-center text-xs font-mono text-orange-400 font-semibold whitespace-nowrap">Call Volume</th>
                </>
              )}
              <th className="px-3 py-3 text-center text-xs font-mono text-accent font-semibold whitespace-nowrap min-w-[80px]">Strike</th>
              {(side === "both" || side === "puts") && (
                <>
                  <th className="px-3 py-3 text-center text-xs font-mono text-blue-400 font-semibold whitespace-nowrap">Put Volume</th>
                  <th className="px-3 py-3 text-left text-xs font-mono text-blue-400 font-semibold whitespace-nowrap">Vol</th>
                  <th className="px-3 py-3 text-left text-xs font-mono text-blue-400 font-semibold whitespace-nowrap">Put OI</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map(({ strike, call, put }) => {
              const isATM = strike === atmStrike;
              const callVolume = call?.volume ?? 0;
              const putVolume = put?.volume ?? 0;
              const maxBarWidth = Math.max(callVolume, putVolume);

              return (
                <tr
                  key={strike}
                  data-atm={isATM || undefined}
                  className={clsx(
                    "border-b border-border transition-all hover:bg-white/[0.05]",
                    isATM && "bg-white/[0.08] border-b-accent/40"
                  )}
                  style={isATM ? { borderBottomWidth: "2px" } : {}}
                >
                  {(side === "both" || side === "calls") && call && (
                    <>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted whitespace-nowrap">
                        {fmtK(call.oi)}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted whitespace-nowrap">
                        {fmtK(call.volume)}
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-xs" style={{ minWidth: "160px" }}>
                        <VolumeBar volume={call.volume} maxVolume={maxVolume} isCall={true} />
                      </td>
                    </>
                  )}
                  {side === "calls" && !call && (
                    <>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted">—</td>
                      <td className="px-3 py-2.5 text-right font-mono text-xs text-muted">—</td>
                      <td className="px-3 py-2.5 text-center" style={{ minWidth: "160px" }}></td>
                    </>
                  )}

                  <td className={clsx("px-3 py-2.5 text-center font-mono font-semibold whitespace-nowrap min-w-[80px]", isATM ? "text-accent text-sm" : "text-text")}>
                    {strike.toFixed(0)}
                    {isATM && <span className="ml-2 text-accent">←</span>}
                  </td>

                  {(side === "both" || side === "puts") && put && (
                    <>
                      <td className="px-3 py-2.5 text-center font-mono text-xs" style={{ minWidth: "160px" }}>
                        <VolumeBar volume={put.volume} maxVolume={maxVolume} isCall={false} />
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-muted whitespace-nowrap">
                        {fmtK(put.volume)}
                      </td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-muted whitespace-nowrap">
                        {fmtK(put.oi)}
                      </td>
                    </>
                  )}
                  {side === "puts" && !put && (
                    <>
                      <td className="px-3 py-2.5 text-center" style={{ minWidth: "160px" }}></td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-muted">—</td>
                      <td className="px-3 py-2.5 text-left font-mono text-xs text-muted">—</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      {/* Stats row */}
      {quote && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <StatCard label="PRICE" value={`$${quote.price.toFixed(2)}`} sub={`${quote.changePct >= 0 ? "+" : ""}${quote.changePct.toFixed(2)}%`} color={quote.change >= 0 ? "text-green" : "text-red"} />
          <StatCard label="IV30" value={`${(quote.iv30 * 100).toFixed(1)}%`} sub="Implied Vol" color="text-accent" />
          <StatCard label="HV30" value={`${(quote.hv30 * 100).toFixed(1)}%`} sub="Historical Vol" />
          <StatCard label="IV / HV" value={(quote.iv30 / quote.hv30).toFixed(2)} sub={quote.iv30 > quote.hv30 ? "IV elevated" : "IV compressed"} color={quote.iv30 > quote.hv30 ? "text-red" : "text-green"} />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {/* View mode toggle */}
        <div className="flex gap-1">
          {[
            { id: "volume", label: "Volume View" },
            { id: "greeks", label: "Greeks View" },
          ].map((v) => (
            <button
              key={v.id}
              onClick={() => setViewMode(v.id)}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-mono transition-all",
                viewMode === v.id
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "bg-surface border border-border text-muted hover:text-text"
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Strike range slider */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono">Strike Range:</span>
          <input
            type="range"
            min="0.05"
            max="0.5"
            step="0.05"
            value={rangeMultiplier}
            onChange={(e) => setRangeMultiplier(parseFloat(e.target.value))}
            className="w-20"
          />
          <span className="text-xs text-muted font-mono">+/- {(rangeMultiplier * 100).toFixed(0)}%</span>
        </div>

        {/* Expiration picker */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-mono">Exp:</span>
          <div className="flex gap-1 flex-wrap">
            {expirations.slice(0, 10).map((exp) => {
              const today = new Date().toISOString().split("T")[0];
              const isToday = exp === today;
              return (
                <button
                  key={exp}
                  onClick={() => setSelectedExp(exp)}
                  className={clsx(
                    "px-2 py-1 rounded text-xs font-mono transition-all",
                    selectedExp === exp
                      ? "bg-accent/10 text-accent border border-accent/40 glow"
                      : "bg-surface border border-border text-muted hover:text-text"
                  )}
                >
                  {isToday ? "0DTE" : exp.slice(5)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Side toggle */}
        <div className="flex gap-1 ml-auto">
          {["both", "calls", "puts"].map((s) => (
            <button
              key={s}
              onClick={() => setSide(s)}
              className={clsx(
                "px-2 py-1 rounded text-xs font-mono transition-all capitalize",
                side === s ? "bg-surface border border-accent/30 text-accent" : "text-muted hover:text-text"
              )}
            >
              {s}
            </button>
          ))}
        </div>

        {/* ITM/OTM filter */}
        <div className="flex gap-1">
          {["all", "itm", "otm"].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={clsx(
                "px-2 py-1 rounded text-xs font-mono transition-all uppercase",
                filter === f ? "bg-surface border border-border text-text" : "text-muted hover:text-text"
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Chain view */}
      <div ref={containerRef}>
        {(!chain && loading) ? (
          <LoadingSpinner />
        ) : chain ? (
          viewMode === "volume" ? <VolumeView /> : <GreeksView />
        ) : null}
      </div>
    </div>
  );
}

