import { useState, useEffect } from "react";
import { fetchQuote } from "./data/mockData";
import { Header } from "./components/UI";
import ChainPage from "./components/ChainPage";
import GEXPage from "./components/GEXPage";
import ZeroDTEPage from "./components/ZeroDTEPage";
import ComparePage0DTE from "./components/ComparePage0DTE";
import CompareGEXPage from "./components/CompareGEXPage";

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

    const loadQuote = async () => {
      try {
        const q = await fetchQuote(ticker);
        if (active) setQuote(q);
      } catch (error) {
        console.error("Quote refresh failed:", error);
      }
    };

    loadQuote();
    const interval = setInterval(loadQuote, 5000);
    return () => {
      active = false;
      clearInterval(interval);
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
        {page === "0DTE" && <ZeroDTEPage ticker={ticker} quote={quote} />}
        {page === "Compare 0DTE" && <ComparePage0DTE />}
        {page === "Compare GEX" && <CompareGEXPage />}
      </main>
    </div>
  );
}
