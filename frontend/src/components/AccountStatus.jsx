import { useState } from "react";
import { futuresAccount, walletBalance } from "../lib/api.js";
import { BoolMark, Status } from "./common.jsx";

const WALLET_ORDER = [
  "USDⓈ-M Futures",
  "Spot",
  "Earn",
  "Funding",
  "Cross Margin",
  "Isolated Margin",
  "COIN-M Futures",
  "Options",
  "Trading Bots",
  "Copy Trading"
];

const WALLET_ORDER_MAP = new Map(WALLET_ORDER.map((name, idx) => [name, idx]));

const POSITION_COLUMNS = [
  ["symbol", "交易對"],
  ["positionSide", "多空"],
  ["positionAmt", "數量"],
  ["unrealizedProfit", "未實現盈虧"],
  ["isolatedMargin", "逐倉保證金"],
  ["notional", "名義價值"],
  ["isolatedWallet", "逐倉錢包餘額"],
  ["initialMargin", "所需起始保證金"],
  ["maintMargin", "維持保證金"],
  ["updateTime", "最後更新時間"]
];

const FUTURES_SUMMARY_ROWS = [
  ["availableBalance", "可用餘額"],
  ["totalWalletBalance", "錢包總餘額"],
  ["totalUnrealizedProfit", "持倉未實現盈虧總額"],
  ["totalMarginBalance", "保證金總餘額（錢包總餘額 + 持倉未實現盈虧總額）"],
  ["totalInitialMargin", "起始保證金總額"],
  ["totalMaintMargin", "維持保證金總額"],
  ["totalPositionInitialMargin", "持倉所需起始保證金總額"],
  ["totalOpenOrderInitialMargin", "掛單所需起始保證金總額"],
  ["totalCrossWalletBalance", "全倉帳戶餘額"],
  ["totalCrossUnPnl", "全倉持倉未實現損益總額"],
  ["maxWithdrawAmount", "最大可轉出餘額"]
];

function formatBalance2(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num.toFixed(2) : "—";
}

function formatUpdateTime(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return "—";
  return new Date(n).toLocaleString("zh-TW");
}

function sortWallets(list) {
  return [...list].sort((a, b) => {
    const idxA = WALLET_ORDER_MAP.has(a.walletName) ? WALLET_ORDER_MAP.get(a.walletName) : Number.MAX_SAFE_INTEGER;
    const idxB = WALLET_ORDER_MAP.has(b.walletName) ? WALLET_ORDER_MAP.get(b.walletName) : Number.MAX_SAFE_INTEGER;
    return idxA - idxB;
  });
}

export default function AccountStatus() {
  const [tab, setTab] = useState(null); // "wallet" | "futures" | null
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [wallets, setWallets] = useState(null);
  const [futures, setFutures] = useState(null);

  const handleLoadWallet = async () => {
    setTab("wallet");
    setLoading(true);
    setError(null);
    try {
      const data = await walletBalance("USDT");
      setWallets(sortWallets(Array.isArray(data) ? data : []));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFutures = async () => {
    setTab("futures");
    setLoading(true);
    setError(null);
    try {
      const data = await futuresAccount();
      setFutures(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="account-status">
      <div className="account-status-actions">
        <button
          type="button"
          className={tab === "wallet" ? "primary" : ""}
          disabled={loading}
          onClick={handleLoadWallet}
        >
          帳戶錢包
        </button>
        <button
          type="button"
          className={tab === "futures" ? "primary" : ""}
          disabled={loading}
          onClick={handleLoadFutures}
        >
          合約帳戶
        </button>
      </div>

      {!tab && <Status message="請點選右上角「帳戶錢包」或「合約帳戶」查詢最新狀況。" />}
      {loading && <Status message="正在讀取帳戶資料…" />}
      {error && (
        <Status
          error
          message={`讀取失敗：${error}。請確認伺服器 .env 已設定 BINANCE_API_KEY 與 BINANCE_API_SECRET，且 API Key 白名單包含伺服器 IP。`}
        />
      )}

      {!loading && !error && tab === "wallet" && wallets && (
        <div className="table-wrap dialog-table">
          <table className="account-table">
            <thead>
              <tr>
                <th scope="col">錢包</th>
                <th scope="col">總價值(USDT)</th>
                <th scope="col">狀態</th>
              </tr>
            </thead>
            <tbody>
              {wallets.length === 0 ? (
                <tr>
                  <td colSpan={3} className="empty-cell">無錢包資料</td>
                </tr>
              ) : (
                wallets.map((w) => (
                  <tr key={w.walletName}>
                    <td className="symbol-cell">{w.walletName}</td>
                    <td>{formatBalance2(w.balance)}</td>
                    <td><BoolMark value={Boolean(w.activate)} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && tab === "futures" && futures && (
        <div className="futures-account-tables">
          <div className="table-wrap dialog-table">
            <table className="account-table">
              <thead>
                <tr>
                  {POSITION_COLUMNS.map(([key, label]) => (
                    <th key={key} scope="col">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {!Array.isArray(futures.positions) || futures.positions.length === 0 ? (
                  <tr>
                    <td colSpan={POSITION_COLUMNS.length} className="empty-cell">無持倉資料</td>
                  </tr>
                ) : (
                  futures.positions.map((pos, idx) => {
                    const upnl = Number(pos.unrealizedProfit);
                    const upnlClass = Number.isFinite(upnl) ? (upnl > 0 ? "positive" : upnl < 0 ? "negative" : "") : "";
                    return (
                      <tr key={`${pos.symbol ?? ""}-${pos.positionSide ?? ""}-${idx}`}>
                        <td className="symbol-cell">{pos.symbol ?? "—"}</td>
                        <td>{pos.positionSide ?? "—"}</td>
                        <td>{pos.positionAmt ?? "—"}</td>
                        <td className={upnlClass}>{pos.unrealizedProfit ?? "—"}</td>
                        <td>{pos.isolatedMargin ?? "—"}</td>
                        <td>{pos.notional ?? "—"}</td>
                        <td>{pos.isolatedWallet ?? "—"}</td>
                        <td>{pos.initialMargin ?? "—"}</td>
                        <td>{pos.maintMargin ?? "—"}</td>
                        <td>{formatUpdateTime(pos.updateTime)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="table-wrap dialog-table">
            <table className="account-table summary-table">
              <thead>
                <tr>
                  <th scope="col">項目</th>
                  <th scope="col">數值</th>
                </tr>
              </thead>
              <tbody>
                {FUTURES_SUMMARY_ROWS.map(([key, label]) => (
                  <tr key={key}>
                    <td className="symbol-cell">{label}</td>
                    <td>{futures[key] ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
