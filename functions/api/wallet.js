// functions/api/wallet.js
export async function onRequestGet(context) {
  const { env } = context;

  // 1. 檢查金鑰是否存在
  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    return new Response(JSON.stringify({ error: "Missing API credentials" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const timestamp = Date.now();
    const queryString = `timestamp=${timestamp}`;

    // 2. 進行 HMAC-SHA256 簽名
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.BINANCE_API_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(queryString)
    );
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    // 3. 向幣安發送請求
    const targetUrl = `https://api.binance.com/sapi/v1/capital/config/getall?${queryString}&signature=${signature}`;
    const binanceRes = await fetch(targetUrl, {
      headers: {
        "X-MBX-APIKEY": env.BINANCE_API_KEY,
      },
    });

    const data = await binanceRes.text();

    return new Response(data, {
      status: binanceRes.status,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}