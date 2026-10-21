const API_BASE = "https://fapi.binance.com";
const CACHE_KEY = "binanceFuturesTickerCache";
const FAVORITES_KEY = "binanceFuturesFavorites";
const state = {
  tickers: [],
  favorites: new Set(),
  page: 1,
  pageSize: 20,
  favoriteBatchOffset: 0,
  tickerSort: { key: "priceChangePercent", direction: "desc" },
  analysisRows: [],
  analysisSort: { key: "symbol", direction: "asc" }
};

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
    renderEmptyRow(tickerBody, "尚無行情資料，請按「載入／更新行情」。", 7);
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
    symbolCell.textContent = ticker.symbol;
    row.append(favoriteCell, symbolCell);

    for (const key of ["lastPrice", "priceChangePercent", "highPrice", "lowPrice", "quoteVolume"]) {
      const cell = document.createElement("td");
      const value = Number(ticker[key]);
      if (key === "priceChangePercent") {
        cell.className = value >= 0 ? "positive" : "negative";
        cell.textContent = `${value >= 0 ? "+" : ""}${formatNumber(value, 2)}%`;
      } else {
        cell.textContent = formatNumber(value, key === "quoteVolume" ? 0 : 8);
      }
      row.append(cell);
    }
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
    state.tickers = data.filter((item) => item.symbol.endsWith("USDT"));
    state.page = 1;
    state.favoriteBatchOffset = 0;
    renderTickers();
    const cached = writeStorage(CACHE_KEY, { savedAt: Date.now(), tickers: state.tickers });
    setStatus(
      pageStatus,
      `行情已更新，共 ${state.tickers.length} 個交易對 · ${new Date().toLocaleTimeString("zh-TW")}${cached ? "" : "；但無法儲存快取"}`,
      !cached
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
    mode
  };
}

function renderAnalysis() {
  const mode = analysisMode.value;
  const descriptions = {
    body: [
      ["symbol", "交易對"],
      ["averageBodyAmp", "平均 BodyAmp (%)"],
      ["candles", "分析根數"]
    ],
    whole: [
      ["symbol", "交易對"],
      ["averageWholeAmp", "平均 WholeAmp (%)"],
      ["candles", "分析根數"]
    ],
    continue: [
      ["symbol", "交易對"],
      ["direction", "連續陽／陰線"],
      ["sameDirection", "方向一致"],
      ["bodyIncreasing", "BodyAmp 遞增"],
      ["absBodyIncreasing", "絕對值遞增"],
      ["averageBodyAmp", "平均 BodyAmp (%)"],
      ["averageWholeAmp", "平均 WholeAmp (%)"],
      ["candles", "分析根數"]
    ],
    spike: [
      ["symbol", "交易對"],
      ["direction", "突升／突降"],
      ["lastBodyAmp", "最後一根 BodyAmp (%)"],
      ["candles", "檢查根數"]
    ]
  };
  const columns = descriptions[mode];
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
        cell.textContent = value;
      } else if (key === "averageBodyAmp" || key === "averageWholeAmp") {
        cell.className = value >= 0 ? "positive" : "negative";
        cell.textContent = `${value >= 0 ? "+" : ""}${formatNumber(value, 4)}%`;
      } else if (key === "lastBodyAmp") {
        cell.className = value >= 0 ? "positive" : "negative";
        cell.textContent = `${value >= 0 ? "+" : ""}${formatNumber(value, 4)}%`;
      } else if (key === "sameDirection" || key === "bodyIncreasing" || key === "absBodyIncreasing") {
        cell.textContent = value ? "是" : "否";
        if (key === "sameDirection") cell.textContent = item.direction;
      } else if (key === "direction" && mode === "spike") {
        cell.className = item.lastBodyAmp >= 0 ? "positive" : "negative";
        cell.textContent = item.lastBodyAmp >= 0 ? "突升" : "突降";
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
    setStatus(
      analysisStatus,
      `分析完成：成功 ${results.length} 個${failed ? `，失敗 ${failed} 個（${failedSymbols.join("；")}）` : ""} · ${intervalLabel} · 最近 ${count} 根 · ${includeCurrentKline ? "包含當下 K 線" : `排除當下 K 線（API 讀取 ${requestLimit} 根）`}`,
      failed > 0
    );
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
