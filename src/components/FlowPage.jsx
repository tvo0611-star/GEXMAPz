import { useState } from "react";
import { clsx } from "clsx";
import { Zap, RefreshCw } from "lucide-react";
import { fetchUnusualFlow } from "../data/mockData";
import { LoadingSpinner } from "./UI";

const fmt = (v) => Number(v).toLocaleString();
const fmtK = (v) => {
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v}`;
};

const COLS = [
  { key: "type",    label: "TYPE",    sort: false },
  { key: "strike",  label: "STRIKE",  sort: true  },
  { key: "exp",     label: "EXP",     sort: false },
  { key: "dte",     label: "DTE",     sort: true  },
  { key: "volume",  label: "VOL",     sort: true  },
  { key: "oi",      label: "OI",      sort: true  },
  { key: "volOI",   label: "VOL/OI",  sort: true  },
  { key: "mid",     label: "MID",     sort: false },
  { key: "premium", label: "PREMIUM", sort: true  },
  { key: "iv",      label: "IV",      sort: true  },
  { key: "flags",   label: "",        sort: false },
];

const MIN_PREM_OPTIONS = [0, 10_000, 50_000, 100_000, 500_000];

function rowFlags(row) {
  return {
    megaPrem:    row.premium >= 1_000_000,
    highPrem:    row.premium >= 100_000 && row.premium < 1_000_000,
    extremeVol:  row.volOI >= 2,
    highVol:     row.volOI >= 0.5 && row.volOI < 2,
  };
}

const FLAG_STYLES = [
  { key: "megaPrem",   label: "MEGA",     cls: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30" },
  { key: "highPrem",   label: "HIGH $",   cls: "bg-accent/20 text-accent border-accent/30" },
  { key: "extremeVol", label: "EXT VOL",  cls: "bg-red/20 text-red border-red/30" },
  { key: "highVol",    label: "HIGH VOL", cls: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
];

const fmtExp = (exp) => {
  const [, m, d] = exp.split("-");
  return `${parseInt(m)}/${parseInt(d)}`;
};

export default function FlowPage({ ticker }) {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [filter, setFilter]   = useState("all");
  const [expFilter, setExpFilter] = useState("all");
  const [minPrem, setMinPrem] = useState(10_000);
  const [sortBy, setSortBy]   = useState("premium");

  const scan = async () => {
    setLoading(true);
    try {
      const data = await fetchUnusualFlow(ticker);
      setRows(data);
      setExpFilter("all");
      setScanned(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const expirations = [...new Set(rows.map((r) => r.exp))].sort();

  const filtered = rows
    .filter((r) => filter === "all" || r.type === filter)
    .filter((r) => expFilter === "all" || r.exp === expFilter)
    .filter((r) => r.premium >= minPrem)
    .sort((a, b) => b[sortBy] - a[sortBy]);

  const totalCallPrem = filtered.filter((r) => r.type === "call").reduce((s, r) => s + r.premium, 0);
  const totalPutPrem  = filtered.filter((r) => r.type === "put" ).reduce((s, r) => s + r.premium, 0);
  const pcRatio = totalCallPrem > 0 ? (totalPutPrem / totalCallPrem).toFixed(2) : "—";

  return (
    <div className="p-4 max-w-screen-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap size={14} className="text-accent" />
          <span className="font-mono text-sm font-semibold text-text">Unusual Flow — {ticker}</span>
        </div>
        <button
          onClick={scan}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-accent/10 border border-accent/30 text-accent font-mono text-xs font-semibold hover:bg-accent/20 transition-all disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? "animate-spin" : ""} />
          {loading ? "Scanning…" : scanned ? "Rescan" : "Scan"}
        </button>
      </div>

      {loading && <LoadingSpinner />}

      {!loading && scanned && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-xs text-muted font-mono mb-1">CALL PREMIUM</div>
              <div className="font-mono text-base font-semibold text-green">{fmtK(totalCallPrem)}</div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-xs text-muted font-mono mb-1">PUT PREMIUM</div>
              <div className="font-mono text-base font-semibold text-red">{fmtK(totalPutPrem)}</div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-xs text-muted font-mono mb-1">P/C RATIO</div>
              <div className={clsx("font-mono text-base font-semibold", parseFloat(pcRatio) > 1 ? "text-red" : "text-green")}>{pcRatio}</div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-3">
              <div className="text-xs text-muted font-mono mb-1">SHOWN</div>
              <div className="font-mono text-base font-semibold text-accent">{filtered.length}</div>
            </div>
          </div>

          {/* Expiration filter */}
          <div className="flex items-center gap-2 mb-2 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <span className="text-xs text-muted font-mono shrink-0">Exp</span>
            {["all", ...expirations].map((exp) => (
              <button
                key={exp}
                onClick={() => setExpFilter(exp)}
                className={clsx(
                  "px-3 py-1 rounded text-xs font-mono whitespace-nowrap shrink-0 transition-all",
                  expFilter === exp
                    ? "bg-accent/10 text-accent border border-accent/30"
                    : "bg-surface border border-border text-muted"
                )}
              >
                {exp === "all" ? "All" : fmtExp(exp)}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {["all", "call", "put"].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={clsx(
                  "px-3 py-1 rounded text-xs font-mono capitalize transition-all",
                  filter === f
                    ? "bg-accent/10 text-accent border border-accent/30"
                    : "bg-surface border border-border text-muted"
                )}
              >
                {f}
              </button>
            ))}
            <div className="flex items-center gap-1 ml-auto flex-wrap">
              <span className="text-xs text-muted font-mono">Min</span>
              {MIN_PREM_OPTIONS.map((v) => (
                <button
                  key={v}
                  onClick={() => setMinPrem(v)}
                  className={clsx(
                    "px-2 py-1 rounded text-xs font-mono transition-all",
                    minPrem === v
                      ? "bg-accent/10 text-accent border border-accent/30"
                      : "bg-surface border border-border text-muted"
                  )}
                >
                  {v === 0 ? "All" : fmtK(v)}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-surface border border-border rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    {COLS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => col.sort && setSortBy(col.key)}
                        className={clsx(
                          "px-3 py-2 text-left text-xs font-mono font-semibold text-muted whitespace-nowrap",
                          col.sort && "cursor-pointer hover:text-text transition-colors",
                          sortBy === col.key && "text-accent"
                        )}
                      >
                        {col.label}{sortBy === col.key ? " ↓" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const f = rowFlags(row);
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-bg/50 transition-colors">
                        <td className="px-3 py-2">
                          <span className={clsx(
                            "font-mono text-xs font-bold uppercase px-2 py-0.5 rounded",
                            row.type === "call" ? "bg-green/10 text-green" : "bg-red/10 text-red"
                          )}>
                            {row.type === "call" ? "C" : "P"}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-text">${row.strike}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">{row.exp.slice(5)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">{row.dte}</td>
                        <td className="px-3 py-2 font-mono text-xs text-text">{fmt(row.volume)}</td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">{fmt(row.oi)}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          <span className={clsx(
                            row.volOI >= 2   ? "text-red" :
                            row.volOI >= 0.5 ? "text-yellow-400" : "text-muted"
                          )}>
                            {row.volOI.toFixed(2)}x
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">${row.mid.toFixed(2)}</td>
                        <td className="px-3 py-2 font-mono text-xs font-semibold">
                          <span className={clsx(
                            row.premium >= 1_000_000 ? "text-yellow-400" :
                            row.premium >= 100_000   ? "text-accent" : "text-text"
                          )}>
                            {fmtK(row.premium)}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-muted">
                          {row.iv > 0 ? `${(row.iv * 100).toFixed(0)}%` : "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1 flex-wrap">
                            {FLAG_STYLES.filter((fl) => f[fl.key]).map((fl) => (
                              <span key={fl.key} className={clsx("text-[10px] font-mono px-1.5 py-0.5 rounded border", fl.cls)}>
                                {fl.label}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={11} className="px-3 py-12 text-center text-xs font-mono text-muted">
                        No flow matches current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {!loading && !scanned && (
        <div className="flex flex-col items-center justify-center py-24 text-muted">
          <Zap size={32} className="mb-3 opacity-30" />
          <p className="font-mono text-sm">Hit Scan to detect unusual options flow for {ticker}.</p>
          <p className="font-mono text-xs mt-1 text-muted/50">Checks vol/OI and premium size across the nearest 6 expirations.</p>
        </div>
      )}
    </div>
  );
}
