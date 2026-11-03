// functions/api/wallet.js
export async function onRequestGet(context) {
  const { request, env } = context;

  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    return new Response(JSON.stringify({
      error: "Missing Cloudflare env BINANCE_API_KEY or BINANCE_API_SECRET"
    }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const url = new URL(request.url);
    const targetPath = url.searchParams.get("path") || "/sapi/v1/capital/config/getall";
    const params = new URLSearchParams(url.searchParams);
    params.delete("path");
    params.set("recvWindow", params.get("recvWindow") || "10000");
    params.set("timestamp", String(Date.now()));

    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(env.BINANCE_API_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const queryString = params.toString();
    const signatureBuffer = await crypto.subtle.sign("HMAC", key, encoder.encode(queryString));
    const signature = Array.from(new Uint8Array(signatureBuffer))
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

    const targetUrl = `https://api.binance.com${targetPath}?${queryString}&signature=${signature}`;
    const binanceRes = await fetch(targetUrl, {
      headers: {
        "X-MBX-APIKEY": env.BINANCE_API_KEY,
        Accept: "application/json"
      }
    });

    const data = await binanceRes.text();
    return new Response(data, {
      status: binanceRes.status,
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}