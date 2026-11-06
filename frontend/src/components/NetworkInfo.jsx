import { useEffect, useState } from "react";
import { walletCoins } from "../lib/api.js";
import { displaySymbol } from "../lib/format.js";
import { BoolMark, Status } from "./common.jsx";

let coinMapPromise = null; // 整個頁面共用一次 getall 結果

function loadCoinMap() {
  coinMapPromise ??= walletCoins()
    .then((data) => new Map(data.map((coin) => [coin.coin, coin])))
    .catch((error) => {
      coinMapPromise = null;
      throw error;
    });
  return coinMapPromise;
}

function coinForSymbol(map, symbol) {
  const base = displaySymbol(symbol);
  return [base, base.replace(/^(1000000|100000|10000|1000|1M)/, "")].map((n) => map.get(n)).find(Boolean) ?? null;
}

const COLUMNS = [
  ["network", "網路"], ["name", "名稱"], ["depositEnable", "可充值"], ["withdrawEnable", "可提現"],
  ["withdrawFee", "提現手續費"], ["withdrawMin", "最小提現"], ["minConfirm", "確認數"]
];

export default function NetworkInfo({ symbol }) {
  const [state, setState] = useState({ loading: true });

  useEffect(() => {
    loadCoinMap()
      .then((map) => setState({ coin: coinForSymbol(map, symbol) }))
      .catch((error) => setState({ error: error.message }));
  }, [symbol]);

  if (state.loading) return <Status message="正在讀取幣種資訊…" />;
  if (state.error) return <Status error message={`讀取失敗：${state.error}。請確認伺服器 .env 已設定 BINANCE_API_KEY 與 BINANCE_API_SECRET，且 API Key 白名單包含伺服器 IP。`} />;
  if (!state.coin) return <Status error message={`getall 回傳中找不到 ${displaySymbol(symbol)} 對應的幣種。`} />;

  const networks = Array.isArray(state.coin.networkList) ? state.coin.networkList : [];
  return (
    <>
      <p className="muted">networkList {networks.length} 筆</p>
      <div className="table-wrap dialog-table">
        <table>
          <thead>
            <tr>{COLUMNS.map(([, label]) => <th key={label} scope="col">{label}</th>)}</tr>
          </thead>
          <tbody>
            {networks.map((network) => (
              <tr key={network.network}>
                {COLUMNS.map(([key]) => (
                  <td key={key}>{typeof network[key] === "boolean" ? <BoolMark value={network[key]} /> : network[key] ?? "—"}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details className="raw-json">
        <summary>原始 networkList JSON</summary>
        <pre>{JSON.stringify(networks, null, 2)}</pre>
      </details>
    </>
  );
}
