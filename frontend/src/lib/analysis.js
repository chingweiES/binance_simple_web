import { market } from "./api.js";

export const MODES = {
  body: {
    label: "平均 BodyAmp",
    description: "BodyAmp = (收盤價 − 開盤價) ÷ 開盤價 × 100%，可正可負；以最近選定根數計算平均值。",
    columns: [["averageBodyAmp", "平均 BodyAmp (%)"]],
    sort: { key: "averageBodyAmp", direction: "desc" }
  },
  whole: {
    label: "平均 WholeAmp",
    description: "WholeAmp = (最高價 − 最低價) ÷ 最低價 × 100%；以最近選定根數計算平均值。",
    columns: [["averageWholeAmp", "平均 WholeAmp (%)"]],
    sort: { key: "averageWholeAmp", direction: "desc" }
  },
  continue: {
    label: "連續方向與振幅",
    description: "檢查最近選定根數是否同為陽線或陰線，並檢查 BodyAmp 與其絕對值是否逐根遞增。",
    columns: [
      ["direction", "連續陽／陰線"],
      ["sameDirection", "方向一致"],
      ["bodyIncreasing", "BodyAmp 遞增"],
      ["absBodyIncreasing", "絕對值遞增"],
      ["averageBodyAmp", "平均 BodyAmp (%)"],
      ["averageWholeAmp", "平均 WholeAmp (%)"]
    ],
    sort: { key: "symbol", direction: "asc" }
  },
  spike: {
    label: "突升降",
    description: "只顯示符合條件的交易對：最後一根分析 K 線 |BodyAmp| > 5%，且前面的每根 K 線 |BodyAmp| < 1%。可用於篩選突升或突降。",
    columns: [["direction", "突升／突降"], ["lastBodyAmp", "最後一根 BodyAmp (%)"]],
    sort: { key: "absLastBodyAmp", direction: "desc" },
    filter: (row) => row.spikeMatch
  }
};

// 額外資訊欄位：historyKey 有值者為歷史資料，可點擊開啟圖表
export const EXTRA_COLUMNS = [
  { key: "globalAccountRatio", label: "多空人數比", historyKey: "globalAccountHistory", kind: "account" },
  { key: "openInterest", label: "最新持倉量" },
  { key: "topPositionRatio", label: "大戶持倉量多空比", historyKey: "topPositionHistory", kind: "position" },
  { key: "topAccountRatio", label: "大戶帳戶數多空比", historyKey: "topAccountHistory", kind: "account" },
  { key: "totalVolume", label: "成交量" },
  { key: "totalQuoteVolume", label: "成交額" },
  { key: "totalTakerBuyVolume", label: "主動買入成交量" },
  { key: "totalTakerBuyQuoteVolume", label: "主動買入成交額" },
  { key: "totalTakerSellVolume", label: "主動賣出成交量" },
  { key: "totalTakerSellQuoteVolume", label: "主動賣出成交額" }
];

export function parseCandles(klines, symbol) {
  return klines.map((k) => {
    const [open, high, low, close, volume, quoteVolume, takerBuyVolume, takerBuyQuoteVolume] = [
      k[1],
      k[2],
      k[3],
      k[4],
      k[5],
      k[7],
      k[9],
      k[10]
    ].map(Number);
    if (![open, high, low, close, volume, quoteVolume, takerBuyVolume, takerBuyQuoteVolume].every(Number.isFinite) || open === 0 || low === 0) {
      throw new Error(`${symbol} K 線資料格式不正確`);
    }
    return {
      bodyAmp: ((close - open) / open) * 100,
      wholeAmp: ((high - low) / low) * 100,
      bull: close >= open,
      volume,
      quoteVolume,
      takerBuyVolume,
      takerBuyQuoteVolume
    };
  });
}

export function makeAnalysisRow(symbol, allCandles, count, fundingRate) {
  const candles = allCandles.slice(-count);
  const bodyAmps = candles.map((c) => c.bodyAmp);
  const sum = (values) => values.reduce((acc, v) => acc + v, 0);
  const avg = (values) => values.reduce((sum, v) => sum + v, 0) / values.length;
  const totalVolume = sum(candles.map((c) => c.volume));
  const totalQuoteVolume = sum(candles.map((c) => c.quoteVolume));
  const totalTakerBuyVolume = sum(candles.map((c) => c.takerBuyVolume));
  const totalTakerBuyQuoteVolume = sum(candles.map((c) => c.takerBuyQuoteVolume));
  const sameDirection = candles.every((c) => c.bull === candles[0].bull);
  const lastBodyAmp = bodyAmps.at(-1);
  return {
    symbol,
    fundingRate,
    direction: sameDirection ? (candles[0].bull ? "連續陽線" : "連續陰線") : "多空混合",
    sameDirection,
    bodyIncreasing: bodyAmps.every((v, i) => i === 0 || v >= bodyAmps[i - 1]),
    absBodyIncreasing: bodyAmps.every((v, i) => i === 0 || Math.abs(v) >= Math.abs(bodyAmps[i - 1])),
    averageBodyAmp: avg(bodyAmps),
    averageWholeAmp: avg(candles.map((c) => c.wholeAmp)),
    lastBodyAmp,
    absLastBodyAmp: Math.abs(lastBodyAmp),
    spikeMatch: Math.abs(lastBodyAmp) > 5 && bodyAmps.slice(0, -1).every((v) => Math.abs(v) < 1),
    totalVolume,
    totalQuoteVolume,
    totalTakerBuyVolume,
    totalTakerBuyQuoteVolume,
    totalTakerSellVolume: totalVolume - totalTakerBuyVolume,
    totalTakerSellQuoteVolume: totalQuoteVolume - totalTakerBuyQuoteVolume,
    candles: candles.length,
    extraLoading: true
  };
}

function latestRatio(list) {
  if (!list.length) return null;
  const latest = list.reduce((a, b) => (Number(b.timestamp) > Number(a.timestamp) ? b : a));
  return Number(latest.longShortRatio);
}

// 比例類為歷史資料（period 沿用分析的 K 線頻率；limit 不設，用預設 30）
export async function fetchExtraInfo(symbol, period) {
  const results = await Promise.allSettled([
    market("/futures/data/globalLongShortAccountRatio", { symbol, period }),
    market("/fapi/v1/openInterest", { symbol }),
    market("/futures/data/topLongShortPositionRatio", { symbol, period }),
    market("/futures/data/topLongShortAccountRatio", { symbol, period })
  ]);
  const [globalAccount, openInterest, topPosition, topAccount] = results;
  const history = (r) => (r.status === "fulfilled" && Array.isArray(r.value) ? r.value : []);
  const globalAccountHistory = history(globalAccount);
  const topPositionHistory = history(topPosition);
  const topAccountHistory = history(topAccount);
  return {
    globalAccountHistory,
    topPositionHistory,
    topAccountHistory,
    globalAccountRatio: latestRatio(globalAccountHistory),
    topPositionRatio: latestRatio(topPositionHistory),
    topAccountRatio: latestRatio(topAccountHistory),
    openInterest: openInterest.status === "fulfilled" ? Number(openInterest.value.openInterest) : null,
    extraFailures: results.filter((r) => r.status === "rejected").length,
    extraLoading: false
  };
}
