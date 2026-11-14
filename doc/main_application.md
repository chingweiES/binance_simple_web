# 前端功能整理

Binance USDT-M 永續合約觀察站。前端為 React + Vite（`frontend/src`），所有 REST 請求走同源 `/api`（後端 Flask 代理，金鑰僅存後端）。各功能呼叫的 API 詳見 [frontend_api.md](./frontend_api.md)。

## 功能總覽

| # | 功能 | 位置 | 需金鑰 | 元件 |
|---|---|---|---|---|
| 1 | 登入／登出／修改密碼 | 登入頁、頁首 | — | `Auth.jsx` |
| 2 | 後端狀態標籤 | 頁首 | — | `App.jsx` |
| 3 | USDT 永續合約行情表 | 主頁第一區塊 | 否 | `TickerPanel.jsx` |
| 4 | 我的最愛 | 行情表 | 否 | `TickerPanel.jsx` |
| 5 | 最愛 K 線分析 | 主頁第二區塊 | 否 | `AnalysisPanel.jsx`、`lib/analysis.js` |
| 6 | 額外資訊（多空比、持倉量、成交量） | 分析表 | 否 | `AnalysisPanel.jsx` |
| 7 | K 線圖彈窗（即時更新） | 行情表／分析表 | 否 | `CandleChart.jsx` |
| 8 | 歷史多空比圖彈窗 | 分析表額外資訊 | 否 | `RatioChart.jsx` |
| 9 | 幣種網路資訊彈窗 | 行情表「更多資訊」 | 是 | `NetworkInfo.jsx` |
| 10 | 帳戶狀況彈窗（帳戶錢包／合約帳戶）🆕 | 頁首「帳戶狀況」 | 是 | `AccountStatus.jsx` |

> 所有彈窗共用 `Dialog.jsx`（原生 `<dialog>`，Esc 或點背景可關閉）。

## 頁面結構

```
頁首：BINANCE · USDT-M PERPETUAL ｜ 後端狀態 ｜ [帳戶狀況][修改密碼][登出]
├─ 行情面板 TickerPanel（USDT 永續合約行情）
├─ 分析面板 AnalysisPanel（最愛交易對 K 線分析）
└─ 頁尾免責聲明
```

未登入顯示登入頁；`/api` 回 401（session 過期或他處改密碼）時自動切回登入頁。

---

## 1. 認證（`Auth.jsx`）

- **登入**：輸入密碼 → `POST /api/auth/login`；失敗顯示後端原因。
- **登出**：頁首「登出」→ `POST /api/auth/logout`。
- **修改密碼**：頁首「修改密碼」開彈窗，需輸入目前密碼、新密碼（至少 8 字元）、再次確認；成功後其他裝置需重新登入。
- 進站先 `GET /api/auth/me` 確認登入狀態。

## 2. 後端狀態標籤（`App.jsx`）

載入時 `GET /api/health`，頁首顯示：
- 連線中… ／ 後端離線（紅）／ 後端正常 · 未設定金鑰（黃）／ 後端正常 · 已設定金鑰（綠）。

## 3. USDT 永續合約行情（`TickerPanel.jsx`）

- 按「載入／更新行情」同時請求 24hr ticker 與 premiumIndex（資金費率；失敗不影響主表），只保留 `USDT` 結尾交易對。
- 欄位：最愛、交易對、最新價格、24 小時漲跌幅（綠漲紅跌）、24 小時最高／最低、24 小時成交額(USDT)、最新資金費率（正綠負紅）、更多資訊。
- 點欄位標題切換升／降冪（預設漲跌幅降冪）；每頁筆數 5/10/20/50/100；分頁。
- 交易對不顯示 `USDT` 尾碼，連結可跳轉 Binance App/網頁；旁邊圖示開 K 線圖。
- 第一欄固定（橫向捲動時）。
- 結果與時間快取於 localStorage，下次進站先顯示快取（需手動更新取得最新）。

## 4. 我的最愛（`TickerPanel.jsx`）

- 點 ☆/★ 加入／移除最愛，存於 localStorage。
- 「依目前排序加入第 N–M 個最愛」：依目前排序每次批次加入 5 個。
- 「取消所有我的最愛」。

## 5. 最愛 K 線分析（`AnalysisPanel.jsx`、`lib/analysis.js`）

按「分析我的最愛」：對每個最愛交易對讀 K 線（並行 5），計算後以表格呈現，預設排除當下 K 線（多讀一根再排除）。

**選項**：K 線頻率（5m/15m/1h/4h/12h/1d，預設 15m）、分析模式、回看根數（1–50，預設 5）、包含當下 K 線、顯示額外資訊（開關，存 localStorage）。

**定義**：BodyAmp = (收−開)/開 ×100%（可正負）；WholeAmp = (高−低)/低 ×100%。

| 模式 | 說明 | 預設排序 |
|---|---|---|
| 平均 BodyAmp | 最近 N 根平均 BodyAmp | 平均值降冪 |
| 平均 WholeAmp | 最近 N 根平均 WholeAmp | 平均值降冪 |
| 連續方向與振幅 | 是否同為陽／陰線、BodyAmp 是否遞增、絕對值是否遞增，並顯示兩個平均值 | 交易對升冪 |
| 突升降 | 只顯示最後一根 \|BodyAmp\| > 5% 且前面每根 \|BodyAmp\| < 1% 者 | 最後一根絕對值降冪 |

固定欄位：交易對、資金費率（沿用行情表，正綠負紅）。布林欄位以 ✔（綠）／✘（紅）顯示。

## 6. 額外資訊（`AnalysisPanel.jsx`、`lib/analysis.js`）

「顯示額外資訊」開啟後，分析完成會再逐檔（並行 3）請求下列資料，載入中顯示「…」：

| 欄位 | 來源 | 備註 |
|---|---|---|
| 多空人數比 | globalLongShortAccountRatio | 取最新 timestamp 的 longShortRatio；可點開歷史圖 |
| 最新持倉量 | openInterest | 單一數值 |
| 大戶持倉量多空比 | topLongShortPositionRatio | 同上，可點開歷史圖 |
| 大戶帳戶數多空比 | topLongShortAccountRatio | 同上，可點開歷史圖 |
| 成交量／成交額 | K 線 `[5]`／`[7]` 加總 | 單位 M（百萬） |
| 主動買入成交量／成交額 | K 線 `[9]`／`[10]` 加總 | 單位 M |
| 主動賣出成交量／成交額 | 成交量(額) − 主動買入成交量(額) | 單位 M |

歷史資料的 period 沿用分析的 K 線頻率，limit 用 Binance 預設（30）。成交量類不管選哪種模式，皆為回看範圍內所有 K 線相加。

## 7. K 線圖（`CandleChart.jsx`）

- 入口：行情表／分析表交易對旁的圖示（分析表會帶入當前頻率）。
- TradingView 風格（lightweight-charts）：蠟燭＋MA7/25/99＋成交量副圖（主圖:副圖 ≈ 4:1）。
- 頻率可切換 1m/5m/15m/1h/4h/12h/1d；初始載入 500 根（`/api/market/fapi/v1/klines`）。
- 之後以瀏覽器直連 Binance WebSocket 即時更新（唯一不經後端的連線）。
- 游標移動顯示開高低收；價格小數位依報價自動調整。

## 8. 歷史多空比圖（`RatioChart.jsx`）

點分析表中「多空人數比」「大戶持倉量多空比」「大戶帳戶數多空比」的數值開啟：
- 仿幣安 App：多倉（綠）／空倉（紅）比例堆疊柱（左軸 %）＋多空比折線（右軸）。
- 標題顯示頻率與資料筆數；大戶持倉量圖例為「持倉 %」，其餘為「帳戶 %」。

## 9. 幣種網路資訊（`NetworkInfo.jsx`）

- 行情表最後一欄「更多資訊 ⓘ」開彈窗。
- 請求 `GET /api/wallet/coins`（整頁共用一次結果），依交易對 base 資產（會處理 1000/10000 等倍數前綴）找幣種。
- 表格呈現 `networkList`：網路、名稱、可充值、可提現（✔／✘）、提現手續費、最小提現、確認數；附原始 JSON 可展開。
- 失敗時提示檢查 `.env` 金鑰與 IP 白名單。

## 10. 帳戶狀況 🆕（`AccountStatus.jsx`）

頁首右上角「帳戶狀況」按鈕開啟彈窗；開啟時不請求，按彈窗右上角按鈕才打 API。

### 帳戶錢包 → `GET /api/wallet/balance`（Binance `/sapi/v1/asset/wallet/balance`）

表格欄位：**錢包／總價值(USDT)／狀態**
- 總價值顯示到小數第 2 位；狀態為 ✔／✘（`activate`）。
- 固定排序：USDⓈ-M Futures、Spot、Earn、Funding、Cross Margin、Isolated Margin、COIN-M Futures、Options、Trading Bots、Copy Trading（不在清單中者排最後）。

### 合約帳戶 → `GET /api/futures/account`（Binance `/fapi/v3/account`）

**表格一：持倉（`positions`）**

| 欄位 | 來源 key |
|---|---|
| 交易對 | `symbol` |
| 多空 | `positionSide` |
| 數量 | `positionAmt` |
| 未實現盈虧（正綠負紅） | `unrealizedProfit` |
| 逐倉保證金 | `isolatedMargin` |
| 名義價值 | `notional` |
| 逐倉錢包餘額 | `isolatedWallet` |
| 所需起始保證金 | `initialMargin` |
| 維持保證金 | `maintMargin` |
| 最後更新時間 | `updateTime`（本地時間格式） |

**表格二：帳戶總覽**（欄位名稱僅顯示中文，依序）

| 顯示名稱 | 來源 key |
|---|---|
| 可用餘額 | `availableBalance` |
| 錢包總餘額 | `totalWalletBalance` |
| 持倉未實現盈虧總額 | `totalUnrealizedProfit` |
| 保證金總餘額（錢包總餘額 + 持倉未實現盈虧總額） | `totalMarginBalance` |
| 起始保證金總額 | `totalInitialMargin` |
| 維持保證金總額 | `totalMaintMargin` |
| 持倉所需起始保證金總額 | `totalPositionInitialMargin` |
| 掛單所需起始保證金總額 | `totalOpenOrderInitialMargin` |
| 全倉帳戶餘額 | `totalCrossWalletBalance` |
| 全倉持倉未實現損益總額 | `totalCrossUnPnl` |
| 最大可轉出餘額 | `maxWithdrawAmount` |

---

## 本機儲存（localStorage，`lib/storage.js`）

| Key | 內容 |
|---|---|
| `binanceFuturesTickerCache` | 行情快取（時間＋ tickers） |
| `binanceFuturesFavorites` | 最愛交易對清單 |
| `binanceFuturesShowExtra` | 「顯示額外資訊」開關 |

## 其他

- `runPool`（`lib/api.js`）：限制並行請求數，避免打爆 Binance 權重（K 線 5、額外資訊 3）。
- 後端對 `/fapi/` 請求監控 `x-mbx-used-weight-1m`，超過 `REQUEST_WEIGHT_FUTURES_LIMIT_1M` 的 80% 即暫停 1 分鐘。
