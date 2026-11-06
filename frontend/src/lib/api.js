// 所有請求都走同源 /api（由 nginx 轉給 Flask），瀏覽器不接觸任何金鑰。
async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const reason = data && (data.error || data.msg) ? `：${data.error || data.msg}` : "";
    throw new Error(`API 回應 ${response.status}${reason}`);
  }
  return data;
}

export function market(path, params = {}) {
  const query = new URLSearchParams(params).toString();
  return getJson(`/api/market${path}${query ? `?${query}` : ""}`);
}

export const walletCoins = () => getJson("/api/wallet/coins");

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
