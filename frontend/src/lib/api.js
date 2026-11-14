// 所有請求都走同源 /api（由 nginx 轉給 Flask），瀏覽器不接觸任何金鑰。

// session 過期或在其他裝置改了密碼時，後端回 401；App 收到事件後切回登入畫面
export const UNAUTHORIZED_EVENT = "api:unauthorized";

async function request(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "same-origin",
    headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) }
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && !url.startsWith("/api/auth/")) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    }
    const reason = data && (data.error || data.msg) ? `：${data.error || data.msg}` : "";
    const error = new Error(`API 回應 ${response.status}${reason}`);
    error.status = response.status;
    error.reason = data?.error || data?.msg || "";
    throw error;
  }
  return data;
}

const getJson = (url) => request(url);
const postJson = (url, body = {}) => request(url, { method: "POST", body: JSON.stringify(body) });

export function market(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return getJson(`/api/market${path}${query ? `?${query}` : ""}`);
}

export const walletCoins = () => getJson("/api/wallet/coins");
export const walletBalance = (quoteAsset = "USDT") =>
  getJson(`/api/wallet/balance?quoteAsset=${encodeURIComponent(quoteAsset)}`);
export const futuresAccount = () => getJson("/api/futures/account");

export const auth = {
  me: () => getJson("/api/auth/me"),
  login: (password) => postJson("/api/auth/login", { password }),
  logout: () => postJson("/api/auth/logout"),
  changePassword: (currentPassword, newPassword) => postJson("/api/auth/password", { currentPassword, newPassword })
};

// 以固定並行數處理清單，避免一次打爆 Binance 權重
export async function runPool(items, concurrency, task) {
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      await task(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}
