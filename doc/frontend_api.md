# 前端 API 整理

來源：`frontend/src`（API 封裝在 [api.js](../frontend/src/lib/api.js)）。後端為 Flask（`backend/app/routes.py`），由 nginx 將同源 `/api` 轉給 Flask。

## 總覽

| 類型 | 數量 | 說明 |
|---|---|---|
| 打後端（`/api/*`） | 3 類 | 認證、健康檢查、行情代理、錢包（其中行情與錢包由後端再轉打 Binance） |
| 直接打 Binance | 1 個 | 僅 K 線 WebSocket（瀏覽器直連，公開資料無需金鑰） |

除 `/api/health`、`/api/auth/*` 外，其餘 `/api` 皆需登入（未登入回 401，前端觸發 `api:unauthorized` 事件切回登入頁）。

## 一、打後端的 API

### 1. 認證與系統

| Method | 路徑 | 用途 | 呼叫位置 |
|---|---|---|---|
| GET | `/api/health` | 後端健康檢查（回 `ok`、`signedApi`） | `App.jsx` |
| GET | `/api/auth/me` | 查詢登入狀態 | `Auth.jsx` / `App.jsx` |
| POST | `/api/auth/login` | 登入 `{password}` | `Auth.jsx` |
| POST | `/api/auth/logout` | 登出 | `Auth.jsx` |
| POST | `/api/auth/password` | 修改密碼 `{currentPassword,newPassword}` | `Auth.jsx` |

### 2. 公開行情代理 `GET /api/market/<path>`（後端白名單 + 快取，再轉打 Binance）

前端呼叫 `market(path, params)`，後端對應 Binance 期貨公開端點（`https://fapi.binance.com`）。

| 前端呼叫的 path | Binance 端點 | 參數 | 後端快取 | 呼叫位置 |
|---|---|---|---|---|
| `/fapi/v1/ticker/24hr` | 24hr 行情 | symbol | 5s | `TickerPanel.jsx` |
| `/fapi/v1/premiumIndex` | 標記價/資金費率 | symbol | 5s | `TickerPanel.jsx` |
| `/fapi/v1/klines` | K 線 | symbol, interval, limit, startTime, endTime | 3s | `CandleChart.jsx`（limit=500）、`AnalysisPanel.jsx` |
| `/fapi/v1/openInterest` | 最新持倉量 | symbol | 5s | `lib/analysis.js` |
| `/futures/data/globalLongShortAccountRatio` | 全市場多空帳戶比 | symbol, period… | 30s | `lib/analysis.js` |
| `/futures/data/topLongShortPositionRatio` | 大戶持倉多空比 | symbol, period… | 30s | `lib/analysis.js` |
| `/futures/data/topLongShortAccountRatio` | 大戶帳戶多空比 | symbol, period… | 30s | `lib/analysis.js` |

後端白名單另有 `/fapi/v1/exchangeInfo`（300s）、`/futures/data/openInterestHist`（30s），**前端目前未使用**。非白名單 path 回 404。

### 3. 錢包與帳戶（需金鑰簽名，由後端代打）

| Method | 路徑 | Binance 端點 | 用途 | 呼叫位置 |
|---|---|---|---|---|
| GET | `/api/wallet/coins` | `https://api.binance.com/sapi/v1/capital/config/getall`（USER_DATA，快取 10 分鐘） | 幣種網路/充提資訊 | `NetworkInfo.jsx` |
| GET | `/api/wallet/balance` | `https://api.binance.com/sapi/v1/asset/wallet/balance?quoteAsset=USDT`（USER_DATA） | 各帳戶錢包餘額總覽 | `AccountStatus.jsx` |
| GET | `/api/futures/account` | `https://fapi.binance.com/fapi/v3/account`（USER_DATA） | USDⓈ-M 合約帳戶持倉與保證金資訊 | `AccountStatus.jsx` |

> 金鑰僅存後端，瀏覽器不接觸。

#### 帳戶狀況彈窗（右上角「帳戶狀況」按鈕，`AccountStatus.jsx`）

點開彈窗後不會自動請求，按下彈窗內按鈕才各打一次：

| 彈窗按鈕 | 前端函式（`api.js`） | 後端路徑 | Binance 端點 | 前端使用的回傳內容 |
|---|---|---|---|---|
| 帳戶錢包 | `walletBalance(quoteAsset="USDT")` | `GET /api/wallet/balance?quoteAsset=USDT` | `GET /sapi/v1/asset/wallet/balance` | list：`walletName`、`balance`（顯示至小數第 2 位）、`activate`。依固定順序排列：USDⓈ-M Futures、Spot、Earn、Funding、Cross Margin、Isolated Margin、COIN-M Futures、Options、Trading Bots、Copy Trading |
| 合約帳戶 | `futuresAccount()` | `GET /api/futures/account` | `GET /fapi/v3/account` | `positions`（持倉表）＋帳戶總覽 11 項欄位（可用餘額、錢包總餘額…最大可轉出餘額） |

- 兩支皆不快取（每次按鈕都重新請求），後端錯誤統一回 `{error, code}`。
- `/fapi/` 請求會納入後端的 `x-mbx-used-weight-1m` 權重監控（超過上限 80% 休息 1 分鐘）。

## 二、前端直接打 Binance

| 協定 | URL | 用途 | 呼叫位置 |
|---|---|---|---|
| WebSocket | `wss://fstream.binance.com/ws/<symbol>@kline_<interval>` | K 線即時更新（公開資料，不需金鑰） | `CandleChart.jsx` |

另有非 API 的外部連結：`format.js` 產生 `https://app.binance.com/zh-TC/futures/<symbol>?...` 供使用者跳轉至 Binance App/網頁，不屬於資料請求。

## 三、備註

- `runPool(items, concurrency, task)`（`api.js`）用於控制並行請求數，避免打爆 Binance 權重。
- 所有 REST 請求皆走 `credentials: "same-origin"`，錯誤統一包成 `API 回應 <status>：<reason>`。
