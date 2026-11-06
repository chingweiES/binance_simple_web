import { useEffect, useState } from "react";
import AnalysisPanel from "./components/AnalysisPanel.jsx";
import CandleChart from "./components/CandleChart.jsx";
import Dialog from "./components/Dialog.jsx";
import NetworkInfo from "./components/NetworkInfo.jsx";
import TickerPanel from "./components/TickerPanel.jsx";
import { displaySymbol } from "./lib/format.js";
import { KEYS, readStorage, writeStorage } from "./lib/storage.js";

function initialTickers() {
  const cached = readStorage(KEYS.cache, null);
  return cached && Array.isArray(cached.tickers) ? cached : null;
}

export default function App() {
  const [cache] = useState(initialTickers);
  const [tickers, setTickers] = useState(cache?.tickers ?? []);
  const [favorites, setFavorites] = useState(() => {
    const stored = readStorage(KEYS.favorites, []);
    return new Set(Array.isArray(stored) ? stored.filter((s) => typeof s === "string") : []);
  });
  const [pageStatus, setPageStatus] = useState(() => ({
    message: cache
      ? `已載入快取行情（${Number.isFinite(Number(cache.savedAt)) ? new Date(Number(cache.savedAt)).toLocaleString("zh-TW") : "時間不明"}）；按「載入／更新行情」取得最新資料。`
      : "準備就緒"
  }));
  const [dialog, setDialog] = useState(null);
  const [server, setServer] = useState(null);

  useEffect(() => {
    if (!writeStorage(KEYS.favorites, [...favorites])) {
      setPageStatus({ message: "最愛已更新，但無法儲存到瀏覽器", error: true });
    }
  }, [favorites]);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setServer).catch(() => setServer({ ok: false }));
  }, []);

  const openChart = (symbol, interval) =>
    setDialog({ title: `${displaySymbol(symbol)} · 永續合約 K 線`, wide: true, content: <CandleChart symbol={symbol} initialInterval={interval ?? "15m"} /> });
  const openMoreInfo = (symbol) =>
    setDialog({ title: `${displaySymbol(symbol)} · 更多資訊`, content: <NetworkInfo symbol={symbol} /> });

  return (
    <main className="page">
      <header className="page-header">
        <div className="topline">
          <span className="brand-mark" aria-hidden="true">B</span>
          <span>BINANCE · USDT-M PERPETUAL</span>
          <span className={`server-pill${server?.ok ? (server.signedApi ? " ok" : " warn") : server ? " bad" : ""}`}>
            {!server ? "連線中…" : !server.ok ? "後端離線" : server.signedApi ? "後端正常 · 已設定金鑰" : "後端正常 · 未設定金鑰"}
          </span>
        </div>
        <h1>永續合約觀察站</h1>
        <p className="intro">查詢 USDT 永續合約 24 小時行情、建立最愛清單，並用 K 線資料比較近期波動。所有 Binance 請求由自架後端代理，API Secret 只存在伺服器環境變數，不會傳到瀏覽器。</p>
      </header>

      <TickerPanel
        tickers={tickers}
        setTickers={setTickers}
        favorites={favorites}
        setFavorites={setFavorites}
        status={pageStatus}
        setStatus={setPageStatus}
        onChart={openChart}
        onMoreInfo={openMoreInfo}
      />
      <AnalysisPanel favorites={favorites} tickers={tickers} openDialog={setDialog} onChart={openChart} />

      {dialog && (
        <Dialog title={dialog.title} wide={dialog.wide} onClose={() => setDialog(null)}>
          {dialog.content}
        </Dialog>
      )}

      <footer>資料來自 Binance USDⓈ-M Futures API，僅供資訊展示，不構成投資建議。</footer>
    </main>
  );
}
