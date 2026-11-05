export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/wallet" || url.pathname === "/api/wallet/") {
      return handleWalletRequest(request, env);
    }

    if (url.pathname.startsWith("/api/")) {
      return jsonResponse({ error: "Not found" }, 404);
    }

    const asset = await env.ASSETS.fetch(request);
    if (asset.status !== 404) {
      return asset;
    }

    return new Response("Not found", { status: 404 });
  }
};

async function handleWalletRequest(request, env) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!env.BINANCE_API_KEY || !env.BINANCE_API_SECRET) {
    return jsonResponse({
      error: "Missing Cloudflare Worker env BINANCE_API_KEY or BINANCE_API_SECRET"
    }, 500);
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
    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      key,
      encoder.encode(queryString)
    );
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

    const body = await binanceRes.text();
    return new Response(body, {
      status: binanceRes.status,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}
