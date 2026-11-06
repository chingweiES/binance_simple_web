import { useMemo, useState } from "react";
import { market } from "../lib/api.js";
import { compareValues, displaySymbol, formatNumber, signedPercent } from "../lib/format.js";
import { KEYS, writeStorage } from "../lib/storage.js";
import { FundingCell, SortHeader, Status, SymbolCell, toggleSort } from "./common.jsx";

const COLUMNS = [
  ["lastPrice", "最新價格"],
  ["priceChangePercent", "24 小時漲跌幅"],
  ["highPrice", "24 小時最高"],
  ["lowPrice", "24 小時最低"],
  ["quoteVolume", "24 小時成交額 (USDT)"],
  ["lastFundingRate", "最新資金費率"]
];

export default function TickerPanel({ tickers, setTickers, favorites, setFavorites, status, setStatus, onChart, onMoreInfo }) {
  const [sort, setSort] = useState({ key: "priceChangePercent", direction: "desc" });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [batchOffset, setBatchOffset] = useState(0);
  const [loading, setLoading] = useState(false);

  const sorted = useMemo(
    () => [...tickers].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction)),
    [tickers, sort]
  );
  const pageCount = Math.ceil(sorted.length / pageSize);
  const currentPage = Math.min(Math.max(page, 1), Math.max(pageCount, 1));
  const visible = sorted.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function load() {
    setLoading(true);
    setStatus({ message: "正在載入 USDT 永續合約 24 小時行情…" });
    try {
      const [data, premium] = await Promise.all([
        market("/fapi/v1/ticker/24hr"),
        market("/fapi/v1/premiumIndex").catch((error) => ({ error }))
      ]);
      const fundingMap = Array.isArray(premium) ? new Map(premium.map((p) => [p.symbol, p.lastFundingRate])) : new Map();
      const next = data
        .filter((t) => t.symbol.endsWith("USDT"))
        .map((t) => ({ ...t, lastFundingRate: fundingMap.get(t.symbol) ?? null }));
      setTickers(next);
      setPage(1);
      setBatchOffset(0);
      const cached = writeStorage(KEYS.cache, { savedAt: Date.now(), tickers: next });
      const fundingError = premium.error ? `；資金費率載入失敗：${premium.error.message}` : "";
      setStatus({
        message: `行情已更新，共 ${next.length} 個交易對 · ${new Date().toLocaleTimeString("zh-TW")}${cached ? "" : "；但無法儲存快取"}${fundingError}`,
        error: !cached || Boolean(fundingError)
      });
    } catch (error) {
      setStatus({ message: `載入行情失敗：${error.message}`, error: true });
    } finally {
      setLoading(false);
    }
  }

  function toggleFavorite(symbol) {
    const next = new Set(favorites);
    next.has(symbol) ? next.delete(symbol) : next.add(symbol);
    setFavorites(next);
    setStatus({ message: `${displaySymbol(symbol)} 已${next.has(symbol) ? "加入" : "從"}最愛清單${next.has(symbol) ? "" : "移除"}` });
  }

  function addBatch() {
    const batch = sorted.slice(batchOffset, batchOffset + 5);
    if (!batch.length) return;
    setFavorites(new Set([...favorites, ...batch.map((t) => t.symbol)]));
    setBatchOffset(batchOffset + batch.length);
    setStatus({ message: `已依目前排序將第 ${batchOffset + 1}–${batchOffset + batch.length} 個交易對加入最愛` });
  }

  function onSort(key) {
    setSort(toggleSort(sort, key));
    setPage(1);
    setBatchOffset(0);
  }

  const hasNextBatch = batchOffset < sorted.length;
  const batchLabel = hasNextBatch
    ? `依目前排序加入第 ${batchOffset + 1}–${Math.min(batchOffset + 5, sorted.length)} 個最愛`
    : sorted.length ? "已加入完所有批次" : "依目前排序加入第 1–5 個最愛";

  return (
    <section className="panel" aria-labelledby="ticker-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MARKET OVERVIEW</p>
          <h2 id="ticker-title">USDT 永續合約行情</h2>
          <p className="section-description">按下更新取得最新清單；點擊欄位名稱可切換升冪／降冪，點選星號加入最愛，點圖示開啟 K 線圖。</p>
        </div>
        <button className="primary" type="button" onClick={load} disabled={loading}>
          {loading ? "載入中…" : "載入／更新行情"}
        </button>
      </div>

      <div className="favorite-actions">
        <button type="button" onClick={addBatch} disabled={!hasNextBatch}>{batchLabel}</button>
        <button type="button" onClick={() => { setFavorites(new Set()); setBatchOffset(0); setStatus({ message: "已取消所有我的最愛" }); }} disabled={favorites.size === 0}>
          取消所有我的最愛
        </button>
      </div>

      <div className="table-meta">
        <span>{tickers.length ? `共 ${sorted.length} 個 USDT 永續合約 · 最愛 ${favorites.size} 個` : "尚未載入行情"}</span>
        <label className="page-size-control">
          每頁筆數
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}>
            {[5, 10, 20, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="ticker-table">
          <thead>
            <tr>
              <th scope="col">最愛</th>
              <SortHeader sortKey="symbol" label="交易對" sort={sort} onSort={onSort} />
              {COLUMNS.map(([key, label]) => <SortHeader key={key} sortKey={key} label={label} sort={sort} onSort={onSort} />)}
              <th scope="col">更多資訊</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr><td className="empty-cell" colSpan={9}>尚無行情資料，請按「載入／更新行情」。</td></tr>
            ) : visible.map((t) => {
              const isFavorite = favorites.has(t.symbol);
              const change = Number(t.priceChangePercent);
              return (
                <tr key={t.symbol}>
                  <td>
                    <button type="button" className={`favorite-toggle${isFavorite ? " is-favorite" : ""}`} aria-pressed={isFavorite}
                      aria-label={`${isFavorite ? "從最愛移除" : "加入最愛"} ${t.symbol}`} onClick={() => toggleFavorite(t.symbol)}>
                      {isFavorite ? "★" : "☆"}
                    </button>
                  </td>
                  <SymbolCell symbol={t.symbol} onChart={onChart} />
                  <td>{formatNumber(t.lastPrice)}</td>
                  <td className={change >= 0 ? "positive" : "negative"}>{signedPercent(change, 2)}</td>
                  <td>{formatNumber(t.highPrice)}</td>
                  <td>{formatNumber(t.lowPrice)}</td>
                  <td>{formatNumber(t.quoteVolume, 0)}</td>
                  <FundingCell value={t.lastFundingRate} />
                  <td className="more-cell">
                    <button type="button" className="icon-button" aria-label={`${displaySymbol(t.symbol)} 更多資訊`} onClick={() => onMoreInfo(t.symbol)}>ⓘ</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <nav className="pagination" aria-label="行情表格分頁">
        <button type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>上一頁</button>
        <span>第 {pageCount ? currentPage : 0} / {pageCount} 頁</span>
        <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>下一頁</button>
      </nav>
      <Status {...status} />
    </section>
  );
}
