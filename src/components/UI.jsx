import { useState } from "react";
import { Search, TrendingUp, TrendingDown } from "lucide-react";
import { clsx } from "clsx";

export function Header({ ticker, quote, onSearch, activePage, setPage }) {
  const [input, setInput] = useState("");

  const handleSearch = (e) => {
    e.preventDefault();
    if (input.trim()) { onSearch(input.trim().toUpperCase()); setInput(""); }
  };

  const pages = ["GEX", "Chain", "0DTE", "Compare 0DTE", "Compare GEX"];

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-bg/90 backdrop-blur">
      <div className="max-w-screen-2xl mx-auto px-4">

        {/* Main row: logo + search + quote + desktop nav */}
        <div className="h-14 flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-7 h-7 rounded bg-accent/10 border border-accent/30 flex items-center justify-center">
              <span className="text-accent font-mono text-xs font-bold">Θ</span>
            </div>
            <span className="hidden sm:block font-mono text-sm font-semibold text-text tracking-tight">GEXmapz 🔥</span>
          </div>

          {/* Search — full width on mobile */}
          <form onSubmit={handleSearch} className="relative flex-1 sm:max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" size={14} />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              placeholder="Search ticker…"
              autoCapitalize="characters"
              autoCorrect="off"
              className="w-full bg-surface border border-border rounded-md pl-8 pr-3 py-2 text-sm font-mono text-text placeholder-muted focus:outline-none focus:border-accent/50 transition-colors"
            />
          </form>

          {/* Quote pill — desktop only */}
          {quote && (
            <div className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-md bg-surface border border-border">
              <span className="font-mono text-sm font-semibold text-accent">{quote.ticker}</span>
              <span className="font-mono text-sm">${quote.price.toFixed(2)}</span>
              <span className={clsx("font-mono text-xs flex items-center gap-1", quote.change >= 0 ? "text-green" : "text-red")}>
                {quote.change >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                {quote.change >= 0 ? "+" : ""}{quote.change.toFixed(2)} ({quote.changePct >= 0 ? "+" : ""}{quote.changePct.toFixed(2)}%)
              </span>
            </div>
          )}

          {/* Nav — desktop only */}
          <nav className="hidden sm:flex items-center gap-1 ml-auto">
            {pages.map((p) => (
              <button
                key={p}
                onClick={() => setPage(p)}
                className={clsx(
                  "px-3 py-1.5 rounded text-xs font-mono font-medium transition-all whitespace-nowrap",
                  activePage === p
                    ? "bg-accent/10 text-accent border border-accent/30 glow"
                    : "text-muted hover:text-text"
                )}
              >
                {p}
              </button>
            ))}
          </nav>
        </div>

        {/* Mobile nav — scrollable strip below search row */}
        <div className="sm:hidden flex items-center gap-1 overflow-x-auto pb-2" style={{ scrollbarWidth: "none" }}>
          {pages.map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={clsx(
                "px-3 py-1.5 rounded text-xs font-mono font-medium transition-all whitespace-nowrap shrink-0",
                activePage === p
                  ? "bg-accent/10 text-accent border border-accent/30"
                  : "text-muted"
              )}
            >
              {p}
            </button>
          ))}
        </div>

      </div>
    </header>
  );
}

export function StatCard({ label, value, sub, color = "text-text" }) {
  return (
    <div className="bg-surface border border-border rounded-lg p-3">
      <div className="text-xs text-muted mb-1 font-mono">{label}</div>
      <div className={clsx("font-mono text-base font-semibold", color)}>{value}</div>
      {sub && <div className="text-xs text-muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-border border-t-accent rounded-full animate-spin" />
    </div>
  );
}

export function EmptyState({ message }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-muted">
      <span className="font-mono text-4xl mb-4">Θ</span>
      <p className="font-mono text-sm">{message}</p>
    </div>
  );
}
