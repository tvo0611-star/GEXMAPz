import { useState, useEffect } from "react";
import { clsx } from "clsx";
import { Zap, RefreshCw, Plus, X } from "lucide-react";
import { fetchUnusualFlow } from "../data/mockData";

const DEFAULT_WATCHLIST = ["SPY", "QQQ", "AAPL", "TSLA", "NVDA", "MSFT", "AMD", "META"];

const fmtK = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};
const fmt = (v) => Number(v).toLocaleString();

function sentiment(callPrem, putPrem) {
  if (callPrem === 0 && putPrem === 0) return null;
  const ratio = putPrem / (callPrem || 1);
  if (ratio < 0.7) return { label: "BULL", cls: "bg-green/10 text-green border-green/30" };
  if (ratio > 1.3) return { label: "BEAR", cls: "bg-red/10 text-red border-red/30" };
  return { label: "NEUT", cls: "bg-muted/10 text-muted border-border" };
}

export default function ScannerPage() {
  const [watchlist, setWatchlist] = useState(() => {
    try {
      const saved = localStorage.getItem("scanner-watchlist");
      return saved ? JSON.parse(saved) : DEFAULT_WATCHLIST;
    } catch { return DEFAULT_WATCHLIST; }
  });
  const [input, setInput] = useState("");
  const [results, setResults] = useState({});
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [activeTab, setActiveTab] = useState("all");

  useEffect(() => {
    try { localStorage.setItem("scanner-watchlist", JSON.stringify(watchlist)); } catch {}
  }, [watchlist]);

  const addTicker = () => {
    const t = input.trim().toUpperCase();
    if (t && !watchlist.includes(t)) setWatchlist((w) => [...w, t]);
    setInput("");
  };

  const scanAll = async () => {
    setScanning(true);
    setResults({});
    setProgress({ done: 0, total: watchlist.length });
    const newResults = {};
    await Promise.all(
      watchlist.map(async (ticker) => {
        try {
          newResults[ticker] = await fetchUnusualFlow(ticker);
        } catch {
          newResults[ticker] = [];
        } finally {
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        }
      })
    );
    setResults(newResults);
    setScanning(false);
    setActiveTab("all");
  };

  const scanned = Object.keys(results).length > 0;

  const tickerSummary = Object.entries(results)
    .map(([ticker, rows]) => {
      const callPrem = rows.filter((r) => r.type === "call").reduce((s, r) => s + r.premium, 0);
      const putPrem  = rows.filter((r) => r.type === "put" ).reduce((s, r) => s + r.premium, 0);
      return { ticker, callPrem, putPrem, total: callPrem + putPrem, count: rows.length };
    })
    .sort((a, b) => b.total - a.total);

  const allRows = Object.entries(results)
    .flatMap(([ticker, rows]) => rows.map((r) => ({ ...r, ticker })))
    .sort((a, b) => b.premium - a.premium)
    .slice(0, 150);

  const displayRows = activeTab === "all"
    ? allRows
    : (results[activeTab] ?? []).map((r) => ({ ...r, ticker: activeTab })).sort((a, b) => b.premium - a.premium);

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <span className="font-mono text-sm font-semibold text-text">Flow Scanner</span>
          {scanned && (
            <span className="font-mono text-xs text-muted">
              — {Object.values(results).reduce((s, r) => s + r.length, 0)} alerts across {watchlist.length} tickers
            </span>
          )}
        </div>
        <button
          onClick={scanAll}
          disabled={scanning || watchlist.length === 0}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent/10 border border-accent/30 text-accent font-mono text-xs font-semibold hover:bg-accent/20 transition-all disabled:opacity-50"
        >
          <RefreshCw size={12} className={scanning ? "animate-spin" : ""} />
          {scanning ? `${progress.done}/${progress.total} scanned…` : scanned ? "Rescan All" : "Scan All"}
        </button>
      </div>

      {/* Watchlist editor */}
      <div className="bg-surface border border-border rounded-lg p-3 mb-4">
        <div className="flex flex-wrap gap-2 mb-2">
          {watchlist.map((t) => {
            const r = results[t];
            const s = r ? sentiment(
              r.filter((x) => x.type === "call").reduce((a, x) => a + x.premium, 0),
              r.filter((x) => x.type === "put" ).reduce((a, x) => a + x.premium, 0)
            ) : null;
            return (
              <div key={t} className="flex items-center gap-1.5 bg-bg border border-border rounded px-2 py-0.5">
                <span className="font-mono text-xs text-text">{t}</span>
                {s && <span className={clsx("text-[9px] font-mono px-1 py-0.5 rounded border", s.cls)}>{s.label}</span>}
                <button onClick={() => setWatchlist((w) => w.filter((x) => x !== t))} className="text-muted hover:text-red transition-colors">
                  <X size={10} />
                </button>
              </div>
            );
          })}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); addTicker(); }} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Add ticker…"
            className="bg-bg border border-border rounded px-2 py-1 text-xs font-mono text-text placeholder-muted focus:outline-none focus:border-accent/50 transition-colors w-28"
          />
          <button type="submit" className="px-2 py-1 rounded bg-accent/10 border border-accent/30 text-accent font-mono text-xs hover:bg-accent/20 transition-all">
            <Plus size={12} />
          </button>
        </form>
      </div>

      {/* Progress bar */}
      {scanning && (
        <div className="mb-4">
          <div className="flex justify-between text-xs font-mono text-muted mb-1">
            <span>Scanning {watchlist.length} tickers in parallel…</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <div className="h-1 bg-surface border border-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all rounded-full"
              style={{ width: `${(progress.done / Math.max(progress.total, 1)) * 100}%` }}
            />
          </div>
        </div>
      )}

      {!scanning && scanned && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {tickerSummary.slice(0, 4).map(({ ticker, callPrem, putPrem }) => {
              const s = sentiment(callPrem, putPrem);
              return (
                <div
                  key={ticker}
                  onClick={() => setActiveTab(ticker)}
                  className="bg-surface border border-border rounded-lg p-3 cursor-pointer hover:border-accent/30 transition-colors"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-xs font-bold text-accent">{ticker}</span>
                    {s && <span className={clsx("text-[9px] font-mono px-1.5 py-0.5 rounded border", s.cls)}>{s.label}</span>}
                  </div>
                  <div className="text-xs font-mono text-green">{fmtK(callPrem)} calls</div>
                  <div className="text-xs font-mono text-red">{fmtK(putPrem)} puts</div>
                </div>
              );
            })}
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setActiveTab("all")}
              className={clsx("px-3 py-1 rounded text-xs font-mono whitespace-nowrap shrink-0 transition-all",
                activeTab === "all" ? "bg-accent/10 text-accent border border-accent/30" : "bg-surface border border-border text-muted"
              )}
            >
              All ({allRows.length})
            </button>
            {tickerSummary.map(({ ticker, count }) => (
              <button
                key={ticker}
                onClick={() => setActiveTab(ticker)}
                className={clsx("px-3 py-1 rounded text-xs font-mono whitespace-nowrap shrink-0 transition-all",
                  activeTab === ticker ? "bg-accent/10 text-accent border border-accent/30" : "bg-surface border border-border text-muted"
                )}
              >
                {ticker} ({count})
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {["TICKER","TYPE","STRIKE","EXP","DTE","VOL","OI","VOL/OI","PREMIUM","IV"].map((h) => (
                      <th key={h} className="px-3 py-2 text-left text-xs font-mono font-semibold text-muted whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayRows.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                      <td className="px-3 py-2 font-mono text-xs font-bold text-accent">{row.ticker}</td>
                      <td className="px-3 py-2">
                        <span className={clsx("font-mono text-xs font-bold uppercase px-2 py-0.5 rounded",
                          row.type === "call" ? "bg-green/10 text-green" : "bg-red/10 text-red"
                        )}>{row.type === "call" ? "C" : "P"}</span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-text">${row.strike}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">{row.exp.slice(5)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">{row.dte}</td>
                      <td className="px-3 py-2 font-mono text-xs text-text">{fmt(row.volume)}</td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">{fmt(row.oi)}</td>
                      <td className="px-3 py-2 font-mono text-xs">
                        <span className={clsx(row.volOI >= 2 ? "text-red" : row.volOI >= 0.5 ? "text-yellow-400" : "text-muted")}>
                          {row.volOI.toFixed(2)}x
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs font-semibold">
                        <span className={clsx(row.premium >= 1_000_000 ? "text-yellow-400" : row.premium >= 100_000 ? "text-accent" : "text-text")}>
                          {fmtK(row.premium)}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-xs text-muted">
                        {row.iv > 0 ? `${(row.iv * 100).toFixed(0)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                  {displayRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-3 py-12 text-center text-xs font-mono text-muted">
                        No flow found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!scanning && !scanned && (
        <div className="flex flex-col items-center justify-center py-24 text-muted">
          <Zap size={32} className="mb-3 opacity-30" />
          <p className="font-mono text-sm">Scan all tickers at once to find the biggest flow.</p>
          <p className="font-mono text-xs mt-1 text-muted/50">Add or remove tickers above, then hit Scan All.</p>
        </div>
      )}
    </div>
  );
}
