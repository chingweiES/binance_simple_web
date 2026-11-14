# Binance 永續合約觀察站

React（前端）+ Flask（後端）+ nginx，用 Docker Compose 部署在自有固定 IP 的機器上。
Binance API Secret 只存在伺服器的 `.env`，瀏覽器只會呼叫同源的 `/api/*`。

```
瀏覽器 ──► nginx :80 ──┬─ /            React 靜態檔（Vite build）
                       └─ /api/*  ──► Flask (gunicorn :8000) ──► Binance REST（簽名在這裡做）
瀏覽器 ──► wss://fstream.binance.com   K 線即時更新（公開串流，不需金鑰）
```

## 目錄

| 路徑 | 說明 |
| --- | --- |
| `backend/app/binance.py` | Binance client：公開行情、HMAC-SHA256 簽名、記憶體 TTL 快取 |
| `backend/app/routes.py` | API 路由；`PUBLIC_ENDPOINTS` 是允許代理的公開端點白名單 |
| `frontend/src/components/` | React 元件；`CandleChart.jsx`、`RatioChart.jsx` 使用 TradingView [lightweight-charts](https://github.com/tradingview/lightweight-charts) |
| `frontend/src/lib/analysis.js` | BodyAmp / WholeAmp / 連續 / 突升降 分析邏輯與模式定義 |
| `nginx/default.conf` | 靜態檔 + `/api` 反向代理 + 速率限制 |

## API

| 路徑 | 說明 |
| --- | --- |
| `GET /api/health` | 後端狀態，`signedApi` 表示是否已設定金鑰（不需登入） |
| `GET /api/auth/me` | 是否已登入 |
| `POST /api/auth/login` | `{"password"}` 登入（每 IP 每分鐘 10 次，連錯 5 次鎖 5 分鐘） |
| `POST /api/auth/logout` | 登出 |
| `POST /api/auth/password` | `{"currentPassword","newPassword"}` 修改密碼，其他裝置的登入會失效 |
| `GET /api/market/<binance path>?...` | 代理白名單內的 fapi / futures/data 公開端點，例如 `/api/market/fapi/v1/klines?symbol=BTCUSDT&interval=15m` |
| `GET /api/wallet/coins` | 簽名呼叫 `/sapi/v1/capital/config/getall`（快取 10 分鐘） |

新增 Binance 端點時：公開端點加進 `PUBLIC_ENDPOINTS`；需要簽名的端點在 `routes.py` 寫一個專用路由。
**不要**做「任意 path 都幫你簽名」的通用代理，否則任何人都能透過你的伺服器呼叫下單、提現等端點。

## 部署（伺服器）

1. 在 Binance 建立 API Key：**只勾「允許讀取」**，IP 存取限制填這台機器的固定 IP。
2. 安裝 Docker 與 Docker Compose plugin。
3. 設定並啟動：

```bash
cp .env.example .env   # 填入 BINANCE_API_KEY / BINANCE_API_SECRET / ADMIN_PASSWORD（初始密碼）
```

```bash
docker compose up -d --build
```

4. 開啟 `http://<你的IP>/`，右上角顯示「後端正常 · 已設定金鑰」即完成。

更新程式碼後：

```bash
git pull && docker compose up -d --build
```

看 log：

```bash
docker compose logs -f backend
```

### 安全建議

- 網站需要密碼登入（單一使用者）。`ADMIN_PASSWORD` 只在第一次啟動時用來建立 `/data/auth.json`
  （Docker volume `appdata`），之後在網頁右上角「修改密碼」更改即可，改完 `.env` 的值不再有作用。
  - 忘記密碼：`docker compose exec backend rm /data/auth.json`，在 `.env` 設新的 `ADMIN_PASSWORD` 後 `docker compose restart backend`。
- 目前是 HTTP，密碼會以明文經過網路；有網域後請加 HTTPS 並設 `SESSION_COOKIE_SECURE=1`。
- 有網域時建議加 HTTPS（例如在前面再放 Caddy / certbot，或把憑證掛進 nginx 容器）。
- 所有使用者共用伺服器 IP 的 Binance 權重額度（fapi 每分鐘 2400），後端已對常用端點做短暫快取，nginx 也有每 IP 速率限制。

## 本機開發

```bash
cd backend
uv sync

DATA_DIR="$HOME/.local/share/binance-simple-web-dev" \
  uv run --env-file ../.env python -m flask --app wsgi:app run --debug --host 127.0.0.1 --port 8000
```

```bash
cd frontend && npm install && npm run dev
```

Vite 開在 http://localhost:5173，`/api` 會自動轉到 Flask 的 :8000。

## 為什麼選 Flask 而不是 Django

這個專案的後端主要工作是「代理 Binance + 伺服器端簽名 + 快取」，沒有資料庫、使用者系統或後台管理需求。
Flask 幾十行就能完成，容器也小；Django 的 ORM、admin、migration 在這裡都用不到。
之後若需要帳號系統或把分析結果存進資料庫，再加 Flask-SQLAlchemy 即可，或屆時再評估換 Django。
