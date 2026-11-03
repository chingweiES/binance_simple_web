const API_BASE = "https://fapi.binance.com";
const CACHE_KEY = "binanceFuturesTickerCache";
const FAVORITES_KEY = "binanceFuturesFavorites";
const SHOW_EXTRA_KEY = "binanceFuturesShowExtra";
const state = {
  tickers: [],
  favorites: new Set(),
  page: 1,
  pageSize: 20,
  favoriteBatchOffset: 0,
  tickerSort: { key: "priceChangePercent", direction: "desc" },
  analysisRows: [],
  analysisSort: { key: "symbol", direction: "asc" },
  analysisInterval: null,
  showExtra: false
};

// 額外資訊欄位：historyKey 有值者為歷史資料，可點擊開啟彈窗
const EXTRA_COLUMNS = [
  { key: "globalAccountRatio", label: "多空人數比", historyKey: "globalAccountHistory" },
  { key: "openInterest", label: "最新持倉量" },
  { key: "topPositionRatio", label: "大戶持倉量多空比", historyKey: "topPositionHistory" },
  { key: "topAccountRatio", label: "大戶帳戶數多空比", historyKey: "topAccountHistory" }
];

const tickerBody = document.querySelector("#ticker-body");
const tickerCount = document.querySelector("#ticker-count");
const pageIndicator = document.querySelector("#page-indicator");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageStatus = document.querySelector("#page-status");
const analysisStatus = document.querySelector("#analysis-status");
const favoriteBatchButton = document.querySelector("#add-favorite-batch");
const clearFavoritesButton = document.querySelector("#clear-favorites");
const analysisBody = document.querySelector("#analysis-body");
const analysisHead = document.querySelector("#analysis-head");
const analysisMode = document.querySelector("#analysis-mode");
const lookbackSelect = document.querySelector("#lookback");

for (let count = 1; count <= 50; count += 1) {
  const option = document.createElement("option");
  option.value = String(count);
  option.textContent = String(count);
  if (count === 5) option.selected = true;
  lookbackSelect.append(option);
}

function setStatus(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle("error", isError);
}

function formatNumber(value, digits = 8) {
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat("zh-TW", { maximumFractionDigits: digits }).format(number)
    : "—";
}

function readStorage(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value === null ? fallback : JSON.parse(value);
  } catch (error) {
    setStatus(pageStatus, `讀取瀏覽器儲存資料失敗：${error.message}`, true);
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    setStatus(pageStatus, `無法儲存至瀏覽器：${error.message}`, true);
    return false;
  }
}

async function fetchJson(path, params = {}) {
  const url = new URL(path, API_BASE);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json();
  if (!response.ok) {
    const reason = data && data.msg ? `：${data.msg}` : "";
    throw new Error(`Binance API 回應 ${response.status}${reason}`);
  }
  return data;
}

function renderEmptyRow(body, message, columns) {
  const row = document.createElement("tr");
  const cell = document.createElement("td");
  cell.className = "empty-cell";
  cell.colSpan = columns;
  cell.textContent = message;
  row.append(cell);
  body.replaceChildren(row);
}

function compareValues(a, b, direction) {
  const first = a ?? "";
  const second = b ?? "";
  const firstNumber = Number(first);
  const secondNumber = Number(second);
  let comparison;
  if (first !== "" && second !== "" && Number.isFinite(firstNumber) && Number.isFinite(secondNumber)) {
    comparison = firstNumber - secondNumber;
  } else {
    comparison = String(first).localeCompare(String(second), "zh-Hant");
  }
  return direction === "asc" ? comparison : -comparison;
}

function updateSortIndicators(table, sort) {
  for (const button of document.querySelectorAll(`.sort-button[data-table="${table}"]`)) {
    if (button.dataset.sort === sort.key) {
      button.closest("th").setAttribute("aria-sort", sort.direction === "asc" ? "ascending" : "descending");
    } else {
      button.closest("th").removeAttribute("aria-sort");
    }
  }
}

function renderTickers() {
  updateFavoriteActionButtons();
  if (state.tickers.length === 0) {
    tickerCount.textContent = "尚未載入行情";
    renderEmptyRow(tickerBody, "尚無行情資料，請按「載入／更新行情」。", 9);
    pageIndicator.textContent = "第 0 / 0 頁";
    previousPageButton.disabled = true;
    nextPageButton.disabled = true;
    updateSortIndicators("ticker", state.tickerSort);
    return;
  }

  const sorted = getSortedTickers();
  const pageCount = Math.ceil(sorted.length / state.pageSize);
  state.page = Math.min(Math.max(state.page, 1), pageCount);
  const start = (state.page - 1) * state.pageSize;
  const visible = sorted.slice(start, start + state.pageSize);
  tickerCount.textContent = `共 ${sorted.length} 個 USDT 永續合約 · 最愛 ${state.favorites.size} 個`;
  const rows = visible.map((ticker) => {
    const row = document.createElement("tr");
    const favoriteCell = document.createElement("td");
    const favoriteButton = document.createElement("button");
    const isFavorite = state.favorites.has(ticker.symbol);
    favoriteButton.type = "button";
    favoriteButton.className = `favorite-toggle${isFavorite ? " is-favorite" : ""}`;
    favoriteButton.textContent = isFavorite ? "★" : "☆";
    favoriteButton.setAttribute("aria-label", `${isFavorite ? "從最愛移除" : "加入最愛"} ${ticker.symbol}`);
    favoriteButton.setAttribute("aria-pressed", String(isFavorite));
    favoriteButton.addEventListener("click", () => toggleFavorite(ticker.symbol));
    favoriteCell.append(favoriteButton);

    const symbolCell = document.createElement("td");
    symbolCell.className = "symbol-cell";
    symbolCell.append(createBinanceLink(ticker.symbol));
    row.append(favoriteCell, symbolCell);

    for (const key of ["lastPrice", "priceChangePercent", "highPrice", "lowPrice", "quoteVolume", "lastFundingRate"]) {
      const cell = document.createElement("td");
      const value = Number(ticker[key]);
      if (key === "priceChangePercent") {
        cell.className = value >= 0 ? "positive" : "negative";
        cell.textContent = `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}%`;
      } else if (key === "lastFundingRate") {
        fillFundingCell(cell, ticker[key]);
      } else {
        cell.textContent = formatNumber(value, key === "quoteVolume" ? 0 : 8);
      }
      row.append(cell);
    }

    const moreCell = document.createElement("td");
    moreCell.className = "more-cell";
    const moreButton = document.createElement("button");
    moreButton.type = "button";
    moreButton.className = "icon-button";
    moreButton.textContent = "ⓘ";
    moreButton.setAttribute("aria-label", `${displaySymbol(ticker.symbol)} 更多資訊`);
    moreButton.addEventListener("click", () => openNetworkDialog(ticker.symbol));
    moreCell.append(moreButton);
    row.append(moreCell);
    return row;
  });
  tickerBody.replaceChildren(...rows);
  pageIndicator.textContent = `第 ${state.page} / ${pageCount} 頁`;
  previousPageButton.disabled = state.page <= 1;
  nextPageButton.disabled = state.page >= pageCount;
  updateSortIndicators("ticker", state.tickerSort);
}

function getSortedTickers() {
  return [...state.tickers].sort((a, b) =>
    compareValues(a[state.tickerSort.key], b[state.tickerSort.key], state.tickerSort.direction)
  );
}

function updateFavoriteActionButtons() {
  const sortedCount = state.tickers.length;
  const batchEnd = Math.min(state.favoriteBatchOffset + 5, sortedCount);
  const hasNextBatch = state.favoriteBatchOffset < sortedCount;
  favoriteBatchButton.disabled = !hasNextBatch;
  favoriteBatchButton.textContent = hasNextBatch
    ? `依目前排序加入第 ${state.favoriteBatchOffset + 1}–${batchEnd} 個最愛`
    : sortedCount > 0
      ? "已加入完所有批次"
      : "依目前排序加入第 1–5 個最愛";
  clearFavoritesButton.disabled = state.favorites.size === 0;
}

function toggleFavorite(symbol) {
  if (state.favorites.has(symbol)) {
    state.favorites.delete(symbol);
  } else {
    state.favorites.add(symbol);
  }
  const saved = writeStorage(FAVORITES_KEY, [...state.favorites]);
  renderTickers();
  setStatus(
    pageStatus,
    saved
      ? `${symbol} 已${state.favorites.has(symbol) ? "加入" : "從"}最愛清單`
      : `${symbol} 已更新最愛狀態，但無法儲存到瀏覽器`,
    !saved
  );
}

function addNextFavoriteBatch() {
  const sorted = getSortedTickers();
  if (state.favoriteBatchOffset >= sorted.length) {
    updateFavoriteActionButtons();
    return;
  }

  const start = state.favoriteBatchOffset;
  const batch = sorted.slice(start, start + 5);
  batch.forEach((ticker) => state.favorites.add(ticker.symbol));
  state.favoriteBatchOffset += batch.length;
  const saved = writeStorage(FAVORITES_KEY, [...state.favorites]);
  renderTickers();
  const range = `${start + 1}–${start + batch.length}`;
  setStatus(
    pageStatus,
    saved
      ? `已依目前排序將第 ${range} 個交易對加入最愛`
      : `已將第 ${range} 個交易對加入最愛，但無法儲存到瀏覽器`,
    !saved
  );
}

function clearFavorites() {
  if (state.favorites.size === 0) return;
  state.favorites.clear();
  state.favoriteBatchOffset = 0;
  const saved = writeStorage(FAVORITES_KEY, []);
  renderTickers();
  state.analysisRows = [];
  renderAnalysis();
  setStatus(
    pageStatus,
    saved ? "已取消所有我的最愛" : "已清空最愛，但無法儲存到瀏覽器",
    !saved
  );
  setStatus(analysisStatus, "最愛清單已清空");
}

async function loadTickers() {
  const button = document.querySelector("#load-tickers");
  button.disabled = true;
  button.textContent = "載入中…";
  setStatus(pageStatus, "正在載入 USDT 永續合約 24 小時行情…");
  try {
    const data = await fetchJson("/fapi/v1/ticker/24hr");
    // 緊接著取得最新標記價格與資金費率（不帶 symbol → 回傳全部）
    let fundingMap = new Map();
    let fundingError = "";
    try {
      const premium = await fetchJson("/fapi/v1/premiumIndex");
      fundingMap = new Map(premium.map((item) => [item.symbol, item.lastFundingRate]));
    } catch (error) {
      fundingError = `；資金費率載入失敗：${error.message}`;
    }
    state.tickers = data
      .filter((item) => item.symbol.endsWith("USDT"))
      .map((item) => ({ ...item, lastFundingRate: fundingMap.get(item.symbol) ?? null }));
    state.page = 1;
    state.favoriteBatchOffset = 0;
    renderTickers();
    const cached = writeStorage(CACHE_KEY, { savedAt: Date.now(), tickers: state.tickers });
    setStatus(
      pageStatus,
      `行情已更新，共 ${state.tickers.length} 個交易對 · ${new Date().toLocaleTimeString("zh-TW")}${cached ? "" : "；但無法儲存快取"}${fundingError}`,
      !cached || Boolean(fundingError)
    );
  } catch (error) {
    setStatus(pageStatus, `載入行情失敗：${error.message}`, true);
  } finally {
    button.disabled = false;
    button.textContent = "載入／更新行情";
  }
}

function updateModeDescription() {
  const descriptions = {
    body: "BodyAmp = (收盤價 − 開盤價) ÷ 開盤價 × 100%，可正可負；以最近選定根數計算平均值。",
    whole: "WholeAmp = (最高價 − 最低價) ÷ 最低價 × 100%；以最近選定根數計算平均值。",
    continue: "檢查最近選定根數是否同為陽線或陰線，並檢查 BodyAmp 與其絕對值是否逐根遞增。",
    spike: "只顯示符合條件的交易對：最後一根分析 K 線 |BodyAmp| > 5%，且前面的每根 K 線 |BodyAmp| < 1%。可用於篩選突升或突降。"
  };
  document.querySelector("#mode-description").textContent = descriptions[analysisMode.value];
}

function makeAnalysisRow(item, mode, count) {
  const candles = item.candles.slice(-count);
  const bodyAmps = candles.map((candle) => candle.bodyAmp);
  const wholeAmps = candles.map((candle) => candle.wholeAmp);
  const sameDirection = candles.every((candle) => candle.bull === candles[0].bull);
  const bodyIncreasing = bodyAmps.every((value, index) => index === 0 || value >= bodyAmps[index - 1]);
  const absBodyIncreasing = bodyAmps.every((value, index) =>
    index === 0 || Math.abs(value) >= Math.abs(bodyAmps[index - 1])
  );
  const avg = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
  const lastBodyAmp = bodyAmps.at(-1);
  const spikeMatch = Math.abs(lastBodyAmp) > 5
    && bodyAmps.slice(0, -1).every((value) => Math.abs(value) < 1);

  return {
    symbol: item.symbol,
    direction: sameDirection ? (candles[0].bull ? "連續陽線" : "連續陰線") : "多空混合",
    sameDirection,
    bodyIncreasing,
    absBodyIncreasing,
    averageBodyAmp: avg(bodyAmps),
    averageWholeAmp: avg(wholeAmps),
    lastBodyAmp,
    absLastBodyAmp: Math.abs(lastBodyAmp),
    spikeMatch,
    candles: candles.length,
    fundingRate: state.tickers.find((ticker) => ticker.symbol === item.symbol)?.lastFundingRate ?? null,
    mode
  };
}

function renderAnalysis() {
  const mode = analysisMode.value;
  const descriptions = {
    body: [
      ["symbol", "交易對"],
      ["averageBodyAmp", "平均 BodyAmp (%)"]
    ],
    whole: [
      ["symbol", "交易對"],
      ["averageWholeAmp", "平均 WholeAmp (%)"]
    ],
    continue: [
      ["symbol", "交易對"],
      ["direction", "連續陽／陰線"],
      ["sameDirection", "方向一致"],
      ["bodyIncreasing", "BodyAmp 遞增"],
      ["absBodyIncreasing", "絕對值遞增"],
      ["averageBodyAmp", "平均 BodyAmp (%)"],
      ["averageWholeAmp", "平均 WholeAmp (%)"]
    ],
    spike: [
      ["symbol", "交易對"],
      ["direction", "突升／突降"],
      ["lastBodyAmp", "最後一根 BodyAmp (%)"]
    ]
  };
  const columns = [...descriptions[mode]];
  columns.splice(1, 0, ["fundingRate", "資金費率"]);
  if (state.showExtra) {
    for (const column of EXTRA_COLUMNS) columns.push([column.key, column.label]);
  }
  analysisHead.replaceChildren();
  const headerRow = document.createElement("tr");
  for (const [key, label] of columns) {
    const header = document.createElement("th");
    header.scope = "col";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sort-button";
    button.dataset.table = "analysis";
    button.dataset.sort = key;
    button.textContent = label;
    header.append(button);
    headerRow.append(header);
  }
  analysisHead.append(headerRow);

  const visibleRows = mode === "spike"
    ? state.analysisRows.filter((item) => item.spikeMatch)
    : state.analysisRows;
  if (visibleRows.length === 0) {
    const message = state.analysisRows.length === 0
      ? "先加入最愛，再按「分析我的最愛」。"
      : mode === "spike"
        ? "目前沒有符合突升降條件的交易對。"
        : "沒有可顯示的分析結果。";
    renderEmptyRow(analysisBody, message, columns.length);
    updateSortIndicators("analysis", state.analysisSort);
    return;
  }

  const sortedRows = [...visibleRows].sort((a, b) =>
    compareValues(a[state.analysisSort.key], b[state.analysisSort.key], state.analysisSort.direction)
  );
  const rows = sortedRows.map((item) => {
    const row = document.createElement("tr");
    for (const [key] of columns) {
      const cell = document.createElement("td");
      const value = item[key];
      if (key === "symbol") {
        cell.className = "symbol-cell";
        cell.append(createBinanceLink(value, state.analysisInterval));
      } else if (key === "fundingRate") {
        fillFundingCell(cell, value);
      } else if (key === "averageBodyAmp" || key === "averageWholeAmp") {
        cell.className = value >= 0 ? "positive" : "negative";
        cell.textContent = `${value >= 0 ? "+" : ""}${formatNumber(value, 4)}%`;
      } else if (key === "lastBodyAmp") {
        cell.className = value >= 0 ? "positive" : "negative";
        cell.textContent = `${value >= 0 ? "+" : ""}${formatNumber(value, 4)}%`;
      } else if (key === "sameDirection" || key === "bodyIncreasing" || key === "absBodyIncreasing") {
        cell.className = `bool-cell ${value ? "positive" : "negative"}`;
        cell.textContent = value ? "✔" : "✘";
        cell.setAttribute("aria-label", value ? "是" : "否");
      } else if (key === "direction" && mode === "spike") {
        cell.className = item.lastBodyAmp >= 0 ? "positive" : "negative";
        cell.textContent = item.lastBodyAmp >= 0 ? "突升" : "突降";
      } else if (EXTRA_COLUMNS.some((column) => column.key === key)) {
        renderExtraCell(cell, item, EXTRA_COLUMNS.find((column) => column.key === key));
      } else {
        cell.textContent = String(value);
      }
      row.append(cell);
    }
    return row;
  });
  analysisBody.replaceChildren(...rows);
  updateSortIndicators("analysis", state.analysisSort);
}

function renderExtraCell(cell, item, column) {
  const value = item[column.key];
  if (item.extraLoading) {
    cell.textContent = "…";
    return;
  }
  if (value === null || value === undefined) {
    cell.textContent = "—";
    return;
  }
  const text = formatNumber(value, column.key === "openInterest" ? 3 : 4);
  const history = column.historyKey ? item[column.historyKey] : null;
  if (!history || history.length === 0) {
    cell.textContent = text;
    return;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "history-button";
  button.textContent = text;
  button.title = "點擊查看歷史資料";
  button.addEventListener("click", () => openHistoryDialog(item.symbol, column.label, history));
  cell.append(button);
}

function fillFundingCell(cell, raw) {
  const value = Number(raw);
  if (raw === null || raw === undefined || !Number.isFinite(value)) {
    cell.textContent = "—";
    return;
  }
  cell.className = value > 0 ? "positive" : value < 0 ? "negative" : "";
  cell.textContent = `${value > 0 ? "+" : ""}${formatNumber(value * 100, 4)}%`;
}

function openInfoDialog(title, ...content) {
  document.querySelector("#dialog-title").textContent = title;
  document.querySelector("#dialog-content").replaceChildren(...content);
  document.querySelector("#info-dialog").showModal();
}

const SVG_NS = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}

// 仿幣安 APP「大戶多空比」：堆疊柱（多倉綠／空倉紅，左軸 %）+ 多空比折線（右軸）
function buildRatioChart(history, longLabel, shortLabel) {
  const data = [...history].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
  const W = 640, H = 300, L = 46, R = 56, T = 14, B = 30;
  const plotW = W - L - R, plotH = H - T - B;
  const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, class: "ratio-chart", role: "img" });

  const ratios = data.map((d) => Number(d.longShortRatio));
  let min = Math.min(...ratios), max = Math.max(...ratios);
  if (max - min < 1e-9) { min -= 0.01; max += 0.01; }
  const pad = (max - min) * 0.08;
  min -= pad; max += pad;
  const yRatio = (r) => T + (1 - (r - min) / (max - min)) * plotH;

  // 格線與左右軸標籤
  [0, 0.5, 1].forEach((p) => {
    const y = T + (1 - p) * plotH;
    svg.append(svgEl("line", { x1: L, x2: W - R, y1: y, y2: y, class: "chart-grid" }));
    svg.append(svgEl("text", { x: L - 8, y: y + 4, "text-anchor": "end", class: "chart-axis" }, `${p * 100}%`));
    svg.append(svgEl("text", { x: W - R + 8, y: y + 4, class: "chart-axis" }, formatNumber(min + p * (max - min), 3)));
  });

  const slot = plotW / data.length;
  const barW = Math.max(2, slot * 0.62);
  const spanMs = data.length > 1 ? Number(data.at(-1).timestamp) - Number(data[0].timestamp) : 0;
  const timeText = (ts) => {
    const d = new Date(Number(ts));
    const hm = d.toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
    return spanMs > 36 * 3600 * 1000 ? `${d.getMonth() + 1}/${d.getDate()}${spanMs > 10 * 86400000 ? "" : ` ${hm}`}` : hm;
  };

  const points = [];
  data.forEach((d, i) => {
    const x = L + i * slot + (slot - barW) / 2;
    const longPct = Number(d.longAccount);
    const longH = longPct * plotH;
    const group = svgEl("g", { class: "chart-bar" });
    group.append(svgEl("rect", { x, y: T, width: barW, height: plotH - longH, class: "bar-short" }));
    group.append(svgEl("rect", { x, y: T + plotH - longH, width: barW, height: longH, class: "bar-long" }));
    group.append(svgEl("title", {}, `${new Date(Number(d.timestamp)).toLocaleString("zh-TW", { hour12: false })}\n${longLabel}：${formatNumber(longPct * 100, 2)}%\n${shortLabel}：${formatNumber(Number(d.shortAccount) * 100, 2)}%\n多空比：${formatNumber(d.longShortRatio, 4)}`));
    svg.append(group);
    points.push(`${L + i * slot + slot / 2},${yRatio(Number(d.longShortRatio))}`);
  });
  svg.append(svgEl("polyline", { points: points.join(" "), class: "chart-line" }));

  const labelCount = Math.min(4, data.length);
  for (let k = 0; k < labelCount; k += 1) {
    const i = labelCount === 1 ? 0 : Math.round((k * (data.length - 1)) / (labelCount - 1));
    svg.append(svgEl("text", { x: L + i * slot + slot / 2, y: H - 8, "text-anchor": "middle", class: "chart-axis" }, timeText(data[i].timestamp)));
  }

  const legend = document.createElement("div");
  legend.className = "chart-legend";
  legend.innerHTML = `<span><i class="swatch short"></i>${shortLabel}</span><span><i class="swatch long"></i>${longLabel}</span><span><i class="swatch line"></i>多空比值</span>`;
  const wrap = document.createElement("div");
  wrap.className = "chart-wrap";
  wrap.append(svg, legend);
  return wrap;
}

function openHistoryDialog(symbol, label, history) {
  const isPosition = label.includes("持倉量");
  const chart = isPosition
    ? buildRatioChart(history, "多倉持倉 %", "空倉持倉 %")
    : buildRatioChart(history, "多倉帳戶 %", "空倉帳戶 %");
  openInfoDialog(`${displaySymbol(symbol)} · ${label}（${state.analysisInterval ?? ""}，${history.length} 筆）`, chart);
}

// ===== 更多資訊：/sapi/v1/capital/config/getall（USER_DATA，需 API Key + Secret 簽名） =====
const CREDENTIALS_KEY = "binanceApiCredentials";

function getCredentials() {
  return null;
}

async function fetchSigned(path, params = {}) {
  const query = new URLSearchParams(params);
  query.set("recvWindow", query.get("recvWindow") || "10000");
  query.set("timestamp", String(Date.now()));

  const response = await fetch(`/api/wallet?path=${encodeURIComponent(path)}&${query.toString()}`);
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = data && (data.error || data.msg) ? `${data.error || data.msg}` : `HTTP ${response.status}`;
    throw new Error(`Cloudflare Function 回應 ${response.status}：${msg}`);
  }
  return data;
}

async function loadCoinConfig() {
  const data = await fetchSigned("/sapi/v1/capital/config/getall");
  state.coinMap = new Map(data.map((coin) => [coin.coin, coin]));
  console.log("已載入幣種資訊", data);
}

function coinForSymbol(symbol) {
  const base = displaySymbol(symbol);
  const candidates = [base, base.replace(/^(1000000|100000|10000|1000|1M)/, "")];
  return candidates.map((name) => state.coinMap?.get(name)).find(Boolean) ?? null;
}

async function openNetworkDialog(symbol) {
  const title = `${displaySymbol(symbol)} · 更多資訊`;
  const message = (text, isError = false) => {
    const p = document.createElement("p");
    p.className = `status${isError ? " error" : ""}`;
    p.textContent = text;
    return p;
  };
  if (!state.coinMap) {
    openInfoDialog(title, message("正在讀取幣種資訊…"));
    try {
      await loadCoinConfig();
    } catch (error) {
      openInfoDialog(title, message(`讀取失敗：${error.message}。請確認 Cloudflare Functions 已設定 BINANCE_API_KEY 與 BINANCE_API_SECRET。`, true));
      return;
    }
  }
  const coin = coinForSymbol(symbol);
  if (!coin) {
    openInfoDialog(title, message(`getall 回傳中找不到 ${displaySymbol(symbol)} 對應的幣種。`, true));
    return;
  }
  const networks = Array.isArray(coin.networkList) ? coin.networkList : [];
  const columns = [
    ["network", "網路"], ["name", "名稱"], ["depositEnable", "可充值"], ["withdrawEnable", "可提現"],
    ["withdrawFee", "提現手續費"], ["withdrawMin", "最小提現"], ["minConfirm", "確認數"]
  ];
  const table = document.createElement("table");
  const head = document.createElement("tr");
  for (const [, label] of columns) {
    const th = document.createElement("th");
    th.scope = "col";
    th.textContent = label;
    head.append(th);
  }
  const thead = document.createElement("thead");
  thead.append(head);
  const tbody = document.createElement("tbody");
  for (const network of networks) {
    const row = document.createElement("tr");
    for (const [key] of columns) {
      const td = document.createElement("td");
      const value = network[key];
      if (typeof value === "boolean") {
        td.className = `bool-cell ${value ? "positive" : "negative"}`;
        td.textContent = value ? "✔" : "✘";
      } else {
        td.textContent = value ?? "—";
      }
      row.append(td);
    }
    tbody.append(row);
  }
  table.append(thead, tbody);
  const tableWrap = document.createElement("div");
  tableWrap.className = "table-wrap dialog-table";
  tableWrap.append(table);
  const raw = document.createElement("details");
  raw.className = "raw-json";
  raw.innerHTML = "<summary>原始 networkList JSON</summary>";
  const pre = document.createElement("pre");
  pre.textContent = JSON.stringify(networks, null, 2);
  raw.append(pre);
  openInfoDialog(`${title}（networkList ${networks.length} 筆）`, tableWrap, raw);
}

function latestEntry(history) {
  if (!Array.isArray(history) || history.length === 0) return null;
  return history.reduce((latest, entry) => (Number(entry.timestamp) > Number(latest.timestamp) ? entry : latest));
}

// 額外資訊：比例類為歷史資料（period 必填，沿用分析的 K 線頻率；limit 不設，用預設 30）
async function fetchExtraInfo(symbol, period) {
  const [globalAccount, openInterest, topPosition, topAccount] = await Promise.allSettled([
    fetchJson("/futures/data/globalLongShortAccountRatio", { symbol, period }),
    fetchJson("/fapi/v1/openInterest", { symbol }),
    fetchJson("/futures/data/topLongShortPositionRatio", { symbol, period }),
    fetchJson("/futures/data/topLongShortAccountRatio", { symbol, period })
  ]);
  const history = (result) => (result.status === "fulfilled" && Array.isArray(result.value) ? result.value : []);
  const ratio = (list) => {
    const entry = latestEntry(list);
    return entry ? Number(entry.longShortRatio) : null;
  };
  const globalAccountHistory = history(globalAccount);
  const topPositionHistory = history(topPosition);
  const topAccountHistory = history(topAccount);
  const failures = [globalAccount, openInterest, topPosition, topAccount].filter((r) => r.status === "rejected").length;
  return {
    globalAccountHistory,
    topPositionHistory,
    topAccountHistory,
    globalAccountRatio: ratio(globalAccountHistory),
    topPositionRatio: ratio(topPositionHistory),
    topAccountRatio: ratio(topAccountHistory),
    openInterest: openInterest.status === "fulfilled" ? Number(openInterest.value.openInterest) : null,
    extraFailures: failures
  };
}

async function loadExtraInfo(rows, period) {
  rows.forEach((row) => { row.extraLoading = true; });
  renderAnalysis();
  let nextIndex = 0;
  let completed = 0;
  let failedRequests = 0;
  async function worker() {
    while (nextIndex < rows.length) {
      const row = rows[nextIndex];
      nextIndex += 1;
      Object.assign(row, await fetchExtraInfo(row.symbol, period), { extraLoading: false });
      failedRequests += row.extraFailures;
      completed += 1;
      setStatus(analysisStatus, `${analysisStatus.dataset.base} · 額外資訊 ${completed}/${rows.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(3, rows.length) }, () => worker()));
  renderAnalysis();
  setStatus(
    analysisStatus,
    `${analysisStatus.dataset.base} · 額外資訊完成${failedRequests ? `（${failedRequests} 個請求失敗）` : ""}`,
    failedRequests > 0 || analysisStatus.classList.contains("error")
  );
}

function displaySymbol(symbol) {
  return symbol.endsWith("USDT") ? symbol.slice(0, -4) : symbol;
}

// 幣安 APP 深連結：_dp 為 "/trade/trade?at=futures&symbol=XXX[&interval=15m]" 的 base64
function binanceFuturesUrl(symbol, interval) {
  let deepPath = `/trade/trade?at=futures&symbol=${symbol}`;
  if (interval) deepPath += `&interval=${interval}`;
  return `https://app.binance.com/zh-TC/futures/${symbol}?_dp=${encodeURIComponent(btoa(deepPath))}`;
}

function createBinanceLink(symbol, interval) {
  const link = document.createElement("a");
  link.href = binanceFuturesUrl(symbol, interval);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.className = "symbol-link";
  link.textContent = displaySymbol(symbol);
  link.title = `在幣安 APP 開啟 ${symbol} 永續合約`;
  return link;
}

async function analyzeFavorites() {
  const button = document.querySelector("#analyze-favorites");
  const symbols = [...state.favorites];
  if (symbols.length === 0) {
    setStatus(analysisStatus, "最愛清單目前是空的，請先在行情表格點選星號。", true);
    return;
  }

  button.disabled = true;
  button.textContent = "分析中…";
  state.analysisRows = [];
  renderAnalysis();
  const interval = document.querySelector("#interval").value;
  state.analysisInterval = interval;
  const intervalLabel = document.querySelector("#interval").selectedOptions[0].textContent;
  const count = Number(lookbackSelect.value);
  const includeCurrentKline = document.querySelector("#include-current-kline").checked;
  const requestLimit = count + (includeCurrentKline ? 0 : 1);
  const selectedMode = analysisMode.value;
  let nextIndex = 0;
  let completed = 0;
  let failed = 0;
  const results = [];
  const failedSymbols = [];
  setStatus(analysisStatus, `正在讀取 ${symbols.length} 個最愛交易對的 ${intervalLabel} K 線…`);

  async function worker() {
    while (nextIndex < symbols.length) {
      const symbol = symbols[nextIndex];
      nextIndex += 1;
      try {
        const data = await fetchJson("/fapi/v1/klines", { symbol, interval, limit: String(requestLimit) });
        const selectedCandles = includeCurrentKline ? data : data.slice(0, -1);
        const candles = selectedCandles.map((kline) => {
          const open = Number(kline[1]);
          const high = Number(kline[2]);
          const low = Number(kline[3]);
          const close = Number(kline[4]);
          if (![open, high, low, close].every(Number.isFinite) || open === 0 || low === 0) {
            throw new Error(`${symbol} K 線資料格式不正確`);
          }
          return {
            bodyAmp: ((close - open) / open) * 100,
            wholeAmp: ((high - low) / low) * 100,
            bull: close >= open
          };
        });
        results.push({ symbol, candles });
      } catch (error) {
        failed += 1;
        failedSymbols.push(`${symbol}（${error.message}）`);
      } finally {
        completed += 1;
        setStatus(analysisStatus, `讀取進度 ${completed}/${symbols.length} · 失敗 ${failed} 個`);
      }
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.min(5, symbols.length) }, () => worker()));
    state.analysisRows = results
      .filter((item) => item.candles.length > 0)
      .map((item) => makeAnalysisRow(item, selectedMode, count));
    const defaultSort = selectedMode === "body"
      ? "averageBodyAmp"
      : selectedMode === "whole"
        ? "averageWholeAmp"
        : selectedMode === "spike"
          ? "absLastBodyAmp"
          : "symbol";
    state.analysisSort = { key: defaultSort, direction: selectedMode === "continue" ? "asc" : "desc" };
    renderAnalysis();
    if (state.analysisRows.length === 0 && failed > 0) {
      renderEmptyRow(analysisBody, `所有 K 線查詢均失敗：${failedSymbols.join("；")}`, analysisHead.querySelectorAll("th").length);
    }
    const summary = `分析完成：成功 ${results.length} 個${failed ? `，失敗 ${failed} 個（${failedSymbols.join("；")}）` : ""} · ${intervalLabel} · 最近 ${count} 根 · ${includeCurrentKline ? "包含當下 K 線" : `排除當下 K 線（API 讀取 ${requestLimit} 根）`}`;
    analysisStatus.dataset.base = summary;
    setStatus(analysisStatus, summary, failed > 0);
    if (state.analysisRows.length > 0) await loadExtraInfo(state.analysisRows, interval);
  } finally {
    button.disabled = false;
    button.textContent = "分析我的最愛";
  }
}

function analysisSortKeyForMode(mode) {
  if (mode === "body") return "averageBodyAmp";
  if (mode === "whole") return "averageWholeAmp";
  if (mode === "spike") return "absLastBodyAmp";
  return "symbol";
}

document.querySelector("#load-tickers").addEventListener("click", loadTickers);
document.querySelector("#analyze-favorites").addEventListener("click", analyzeFavorites);
favoriteBatchButton.addEventListener("click", addNextFavoriteBatch);
clearFavoritesButton.addEventListener("click", clearFavorites);
document.querySelector("#page-size").addEventListener("change", (event) => {
  state.pageSize = Number(event.target.value);
  state.page = 1;
  renderTickers();
});
previousPageButton.addEventListener("click", () => {
  state.page -= 1;
  renderTickers();
});
nextPageButton.addEventListener("click", () => {
  state.page += 1;
  renderTickers();
});
analysisMode.addEventListener("change", () => {
  state.analysisSort = { key: analysisSortKeyForMode(analysisMode.value), direction: analysisMode.value === "continue" ? "asc" : "desc" };
  updateModeDescription();
  renderAnalysis();
});
lookbackSelect.addEventListener("change", () => {
  if (state.analysisRows.length === 0) return;
  setStatus(analysisStatus, "回看根數已變更，請重新按「分析我的最愛」更新結果。");
});

document.addEventListener("click", (event) => {
  const button = event.target.closest(".sort-button");
  if (!button) return;
  const table = button.dataset.table;
  const sortState = table === "ticker" ? state.tickerSort : state.analysisSort;
  if (sortState.key === button.dataset.sort) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.key = button.dataset.sort;
    sortState.direction = "asc";
  }
  if (table === "ticker") {
    state.favoriteBatchOffset = 0;
    state.page = 1;
    renderTickers();
  } else {
    renderAnalysis();
  }
});

const extraToggle = document.querySelector("#show-extra");
state.showExtra = readStorage(SHOW_EXTRA_KEY, false) === true;
extraToggle.checked = state.showExtra;
extraToggle.addEventListener("change", () => {
  state.showExtra = extraToggle.checked;
  writeStorage(SHOW_EXTRA_KEY, state.showExtra);
  renderAnalysis();
});
document.querySelector("#dialog-close").addEventListener("click", () => {
  document.querySelector("#info-dialog").close();
});
document.querySelector("#info-dialog").addEventListener("click", (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});

const apiKeyInput = document.querySelector("#api-key");
const apiSecretInput = document.querySelector("#api-secret");
const apiStatus = document.querySelector("#api-status");
const savedCredentials = getCredentials();
if (savedCredentials) {
  apiKeyInput.value = savedCredentials.apiKey;
  apiSecretInput.value = savedCredentials.apiSecret;
  setStatus(apiStatus, "已從本機瀏覽器載入 API 設定");
}
document.querySelector("#save-api").addEventListener("click", () => {
  setStatus(apiStatus, "此頁面不直接使用 API Key，請在 Cloudflare Functions 的環境變數中設定 BINANCE_API_KEY 與 BINANCE_API_SECRET", false);
  apiKeyInput.value = "";
  apiSecretInput.value = "";
  state.coinMap = null;
});
document.querySelector("#clear-api").addEventListener("click", () => {
  localStorage.removeItem(CREDENTIALS_KEY);
  apiKeyInput.value = "";
  apiSecretInput.value = "";
  state.coinMap = null;
  setStatus(apiStatus, "已清除前端範例欄位；真正的金鑰請在 Cloudflare 環境變數中設定");
});

const storedFavorites = readStorage(FAVORITES_KEY, []);
if (Array.isArray(storedFavorites)) state.favorites = new Set(storedFavorites.filter((symbol) => typeof symbol === "string"));
const cached = readStorage(CACHE_KEY, null);
if (cached && Array.isArray(cached.tickers)) {
  state.tickers = cached.tickers;
  renderTickers();
  const cachedAt = Number(cached.savedAt);
  const cachedTime = Number.isFinite(cachedAt) ? new Date(cachedAt).toLocaleString("zh-TW") : "時間不明";
  setStatus(pageStatus, `已載入快取行情（${cachedTime}）；按「載入／更新行情」取得最新資料。`);
} else {
  renderTickers();
}
updateModeDescription();
renderAnalysis();
