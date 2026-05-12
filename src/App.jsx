import { useState, useEffect } from "react";
import { fetchQuote, subscribeToQuote } from "./data/mockData";
import { Header } from "./components/UI";
import ChainPage from "./components/ChainPage";
import GEXPage from "./components/GEXPage";
import ExposurePage from "./components/ExposurePage";
import IntervalMapPage from "./components/IntervalMapPage";
import ZeroDTEPage from "./components/ZeroDTEPage";
import ComparePage0DTE from "./components/ComparePage0DTE";
import CompareGEXPage from "./components/CompareGEXPage";
import FlowPage from "./components/FlowPage";
import ScannerPage from "./components/ScannerPage";

export default function App() {
  const [ticker, setTicker] = useState("SPY");
  const [quote, setQuote] = useState(null);
  const [page, setPage] = useState("GEX");

  const loadTicker = (t) => {
    setTicker(t);
  };

  useEffect(() => {
    if (!ticker) return;
    let active = true;

    // Initial REST fetch for immediate display
    fetchQuote(ticker)
      .then((q) => { if (active) setQuote(q); })
      .catch((err) => console.error("Initial quote failed:", err));

    // WebSocket for real-time updates; preserves iv30/hv30 from initial fetch
    const unsubscribe = subscribeToQuote(ticker, (update) => {
      if (active) setQuote((prev) => prev ? { ...prev, ...update } : update);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [ticker]);

  return (
    <div className="min-h-screen bg-bg text-text">
      <Header
        ticker={ticker}
        quote={quote}
        onSearch={loadTicker}
        activePage={page}
        setPage={setPage}
      />
      <main>
        {page === "Chain" && <ChainPage ticker={ticker} quote={quote} />}
        {page === "GEX" && <GEXPage ticker={ticker} quote={quote} />}
        {page === "Exposure" && <ExposurePage ticker={ticker} quote={quote} />}
        {page === "Map" && <IntervalMapPage ticker={ticker} quote={quote} />}
{page === "Compare GEX" && <CompareGEXPage />}
        {page === "Flow" && <FlowPage ticker={ticker} quote={quote} />}
        {page === "Scanner" && <ScannerPage />}
      </main>
    </div>
  );
}
