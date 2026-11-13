import { useMemo, useState } from "react";
import { market, runPool } from "../lib/api.js";
import { EXTRA_COLUMNS, MODES, fetchExtraInfo, makeAnalysisRow, parseCandles } from "../lib/analysis.js";
import { INTERVALS, compareValues, displaySymbol, formatNumber, signedPercent } from "../lib/format.js";
import { KEYS, readStorage, writeStorage } from "../lib/storage.js";
import { BoolMark, FundingCell, SortHeader, Status, SymbolCell, toggleSort } from "./common.jsx";
import RatioChart from "./RatioChart.jsx";

const ANALYSIS_INTERVALS = INTERVALS.filter(([v]) => v !== "1m");
const BOOL_KEYS = new Set(["sameDirection", "bodyIncreasing", "absBodyIncreasing"]);
const PCT_KEYS = new Set(["averageBodyAmp", "averageWholeAmp", "lastBodyAmp"]);
const MILLION_KEYS = new Set([
  "totalVolume",
  "totalQuoteVolume",
  "totalTakerBuyVolume",
  "totalTakerBuyQuoteVolume",
  "totalTakerSellVolume",
  "totalTakerSellQuoteVolume"
]);

export default function AnalysisPanel({ favorites, tickers, openDialog, onChart }) {
  const [interval, setIntervalValue] = useState("15m");
  const [mode, setMode] = useState("body");
  const [lookback, setLookback] = useState(5);
  const [includeCurrent, setIncludeCurrent] = useState(false);
  const [showExtra, setShowExtra] = useState(() => readStorage(KEYS.showExtra, false) === true);
  const [rows, setRows] = useState([]);
  const [analysisInterval, setAnalysisInterval] = useState(null);
  const [sort, setSort] = useState(MODES.body.sort);
  const [status, setStatus] = useState({ message: "尚未分析" });
  const [running, setRunning] = useState(false);

  const modeSpec = MODES[mode];
  const columns = [
    ["symbol", "交易對"],
    ["fundingRate", "資金費率"],
    ...modeSpec.columns,
    ...(showExtra ? EXTRA_COLUMNS.map((c) => [c.key, c.label]) : [])
  ];

  const visibleRows = useMemo(() => {
    const filtered = modeSpec.filter ? rows.filter(modeSpec.filter) : rows;
    return [...filtered].sort((a, b) => compareValues(a[sort.key], b[sort.key], sort.direction));
  }, [rows, modeSpec, sort]);

  async function analyze() {
    const symbols = [...favorites];
    if (!symbols.length) {
      setStatus({ message: "最愛清單目前是空的，請先在行情表格點選星號。", error: true });
      return;
    }
    setRunning(true);
    setRows([]);
    setAnalysisInterval(interval);
    setSort(modeSpec.sort);
    const intervalLabel = ANALYSIS_INTERVALS.find(([v]) => v === interval)[1];
    const requestLimit = lookback + (includeCurrent ? 0 : 1);
    const fundingMap = new Map(tickers.map((t) => [t.symbol, t.lastFundingRate]));
    const results = [];
    const failures = [];
    let done = 0;
    setStatus({ message: `正在讀取 ${symbols.length} 個最愛交易對的 ${intervalLabel} K 線…` });

    try {
      await runPool(symbols, 5, async (symbol) => {
        try {
          const data = await market("/fapi/v1/klines", { symbol, interval, limit: String(requestLimit) });
          const candles = parseCandles(includeCurrent ? data : data.slice(0, -1), symbol);
          if (candles.length) results.push(makeAnalysisRow(symbol, candles, lookback, fundingMap.get(symbol) ?? null));
        } catch (error) {
          failures.push(`${displaySymbol(symbol)}（${error.message}）`);
        } finally {
          done += 1;
          setStatus({ message: `讀取進度 ${done}/${symbols.length} · 失敗 ${failures.length} 個` });
        }
      });

      setRows(results);
      const summary = `分析完成：成功 ${results.length} 個${failures.length ? `，失敗 ${failures.length} 個（${failures.join("；")}）` : ""} · ${intervalLabel} · 最近 ${lookback} 根 · ${includeCurrent ? "包含當下 K 線" : `排除當下 K 線（API 讀取 ${requestLimit} 根）`}`;
      setStatus({ message: summary, error: failures.length > 0 });
      if (!results.length) return;

      let extraDone = 0;
      let extraFailed = 0;
      await runPool(results, 3, async (row) => {
        const extra = await fetchExtraInfo(row.symbol, interval);
        extraDone += 1;
        extraFailed += extra.extraFailures;
        setRows((prev) => prev.map((r) => (r.symbol === row.symbol ? { ...r, ...extra } : r)));
        setStatus({ message: `${summary} · 額外資訊 ${extraDone}/${results.length}`, error: failures.length > 0 });
      });
      setStatus({
        message: `${summary} · 額外資訊完成${extraFailed ? `（${extraFailed} 個請求失敗）` : ""}`,
        error: failures.length > 0 || extraFailed > 0
      });
    } finally {
      setRunning(false);
    }
  }

  function openHistory(row, column) {
    const isPosition = column.kind === "position";
    openDialog({
      title: `${displaySymbol(row.symbol)} · ${column.label}（${analysisInterval}，${row[column.historyKey].length} 筆）`,
      wide: true,
      content: (
        <RatioChart
          history={row[column.historyKey]}
          longLabel={isPosition ? "多倉持倉 %" : "多倉帳戶 %"}
          shortLabel={isPosition ? "空倉持倉 %" : "空倉帳戶 %"}
        />
      )
    });
  }

  function renderCell(row, key) {
    const value = row[key];
    if (key === "symbol") return <SymbolCell key={key} symbol={value} interval={analysisInterval} onChart={(s) => onChart(s, analysisInterval)} />;
    if (key === "fundingRate") return <FundingCell key={key} value={value} />;
    if (PCT_KEYS.has(key)) return <td key={key} className={value >= 0 ? "positive" : "negative"}>{signedPercent(value)}</td>;
    if (BOOL_KEYS.has(key)) return <td key={key}><BoolMark value={value} /></td>;
    if (key === "direction" && mode === "spike") {
      return <td key={key} className={row.lastBodyAmp >= 0 ? "positive" : "negative"}>{row.lastBodyAmp >= 0 ? "突升" : "突降"}</td>;
    }
    const extra = EXTRA_COLUMNS.find((c) => c.key === key);
    if (extra) {
      if (row.extraLoading) return <td key={key}>…</td>;
      if (value === null || value === undefined) return <td key={key}>—</td>;
      const text = MILLION_KEYS.has(key)
        ? `${formatNumber(value / 1_000_000, 2)} M`
        : formatNumber(value, key === "openInterest" ? 3 : 4);
      const history = extra.historyKey ? row[extra.historyKey] : null;
      return (
        <td key={key}>
          {history?.length ? (
            <button type="button" className="history-button" title="點擊查看歷史圖表" onClick={() => openHistory(row, extra)}>{text}</button>
          ) : text}
        </td>
      );
    }
    return <td key={key}>{String(value)}</td>;
  }

  const emptyMessage = rows.length === 0
    ? "先加入最愛，再按「分析我的最愛」。"
    : mode === "spike" ? "目前沒有符合突升降條件的交易對。" : "沒有可顯示的分析結果。";

  return (
    <section className="panel" aria-labelledby="analysis-title">
      <div className="section-heading">
        <div>
          <p className="eyebrow">KLINE ANALYSIS</p>
          <h2 id="analysis-title">最愛交易對 K 線分析</h2>
          <p className="section-description">每個最愛交易對依回看根數讀取永續合約 K 線；若排除當下 K 線，API 會多讀一根後再排除最新資料。</p>
        </div>
        <button className="primary" type="button" onClick={analyze} disabled={running}>
          {running ? "分析中…" : "分析我的最愛"}
        </button>
      </div>

      <div className="toolbar">
        <label>K 線頻率
          <select value={interval} onChange={(e) => setIntervalValue(e.target.value)}>
            {ANALYSIS_INTERVALS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
        <label>分析模式
          <select value={mode} onChange={(e) => { setMode(e.target.value); setSort(MODES[e.target.value].sort); }}>
            {Object.entries(MODES).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
          </select>
        </label>
        <label>回看根數
          <select value={lookback} onChange={(e) => {
            setLookback(Number(e.target.value));
            if (rows.length) setStatus({ message: "回看根數已變更，請重新按「分析我的最愛」更新結果。" });
          }}>
            {Array.from({ length: 50 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="checkbox-control">
          <input type="checkbox" checked={includeCurrent} onChange={(e) => setIncludeCurrent(e.target.checked)} />
          包含當下 K 線
        </label>
        <label className="checkbox-control switch-control">
          <input type="checkbox" role="switch" checked={showExtra} onChange={(e) => { setShowExtra(e.target.checked); writeStorage(KEYS.showExtra, e.target.checked); }} />
          <span className="switch-track" aria-hidden="true" />
          顯示額外資訊
        </label>
      </div>
      <p className="formula-note">{modeSpec.description}</p>
      <Status {...status} />
      <div className="table-wrap">
        <table className="analysis-table">
          <thead>
            <tr>{columns.map(([key, label]) => <SortHeader key={key} sortKey={key} label={label} sort={sort} onSort={(k) => setSort(toggleSort(sort, k))} />)}</tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td className="empty-cell" colSpan={columns.length}>{emptyMessage}</td></tr>
            ) : visibleRows.map((row) => <tr key={row.symbol}>{columns.map(([key]) => renderCell(row, key))}</tr>)}
          </tbody>
        </table>
      </div>
    </section>
  );
}
