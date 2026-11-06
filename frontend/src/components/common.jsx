import { binanceFuturesUrl, displaySymbol, formatNumber } from "../lib/format.js";

export function Status({ message, error }) {
  return (
    <p className={`status${error ? " error" : ""}`} role="status" aria-live="polite">
      {message}
    </p>
  );
}

export function SortHeader({ sortKey, label, sort, onSort, className }) {
  const active = sort.key === sortKey;
  return (
    <th scope="col" className={className} aria-sort={active ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" className="sort-button" onClick={() => onSort(sortKey)}>
        {label}
      </button>
    </th>
  );
}

export function toggleSort(sort, key) {
  return sort.key === key
    ? { key, direction: sort.direction === "asc" ? "desc" : "asc" }
    : { key, direction: "asc" };
}

export function FundingCell({ value }) {
  const n = Number(value);
  if (value === null || value === undefined || !Number.isFinite(n)) return <td>—</td>;
  return (
    <td className={n > 0 ? "positive" : n < 0 ? "negative" : ""}>
      {`${n > 0 ? "+" : ""}${formatNumber(n * 100, 4)}%`}
    </td>
  );
}

export function BoolMark({ value }) {
  return (
    <span className={`bool-mark ${value ? "positive" : "negative"}`} aria-label={value ? "是" : "否"}>
      {value ? "✔" : "✘"}
    </span>
  );
}

export function SymbolCell({ symbol, interval, onChart }) {
  return (
    <td className="symbol-cell">
      <span className="symbol-inner">
        <a
          className="symbol-link"
          href={binanceFuturesUrl(symbol, interval)}
          target="_blank"
          rel="noopener noreferrer"
          title={`在幣安 APP 開啟 ${symbol} 永續合約`}
        >
          {displaySymbol(symbol)}
        </a>
        {onChart && (
          <button type="button" className="chart-button" title="K 線圖" aria-label={`${displaySymbol(symbol)} K 線圖`} onClick={() => onChart(symbol)}>
            <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 2v12M3 5h2v5H3zM8 1v14M7 4h2v7H7zM13 3v10M12 6h2v4h-2z" /></svg>
          </button>
        )}
      </span>
    </td>
  );
}
