export function formatNumber(value, digits = 8) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits }).format(number)
    : "—";
}

export const signedPercent = (value, digits = 4) =>
  `${value >= 0 ? "+" : ""}${formatNumber(value, digits)}%`;

export const displaySymbol = (symbol) => (symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol);

export function compareValues(a, b, direction) {
  const first = a ?? "";
  const second = b ?? "";
  const n1 = Number(first);
  const n2 = Number(second);
  const comparison =
    first !== "" && second !== "" && Number.isFinite(n1) && Number.isFinite(n2)
      ? n1 - n2
      : String(first).localeCompare(String(second), "zh-Hant");
  return direction === "asc" ? comparison : -comparison;
}

// 幣安 APP 深連結：_dp 為 "/trade/trade?at=futures&symbol=XXX[&interval=15m]" 的 base64
export function binanceFuturesUrl(symbol, interval) {
  let deepPath = `/trade/trade?at=futures&symbol=${symbol}`;
  if (interval) deepPath += `&interval=${interval}`;
  // 部分交易對含中文（如 币安人生USDT），btoa 只吃 Latin1，先轉 UTF-8 位元組
  const base64 = btoa(String.fromCharCode(...new TextEncoder().encode(deepPath)));
  return `https://app.binance.com/zh-TC/futures/${encodeURIComponent(symbol)}?_dp=${encodeURIComponent(base64)}`;
}

// lightweight-charts 以 UTC 秒顯示；平移成本地時區讓軸上時間符合使用者時鐘
const TZ_OFFSET_SEC = -new Date().getTimezoneOffset() * 60;
export const toChartTime = (ms) => Math.floor(Number(ms) / 1000) + TZ_OFFSET_SEC;

export const INTERVALS = [
  ["1m", "1 分鐘"], ["5m", "5 分鐘"], ["15m", "15 分鐘"], ["1h", "1 小時"],
  ["4h", "4 小時"], ["12h", "12 小時"], ["1d", "1 天"]
];
