"""HTTP routes. Only whitelisted Binance endpoints are reachable from the browser."""
from __future__ import annotations

from flask import Blueprint, current_app, jsonify, request

from .binance import BinanceError

bp = Blueprint("api", __name__, url_prefix="/api")

# 公開行情白名單：path -> (允許的 query 參數, 快取秒數)
PUBLIC_ENDPOINTS: dict[str, tuple[set[str], float]] = {
    "/fapi/v1/ticker/24hr": ({"symbol"}, 5),
    "/fapi/v1/premiumIndex": ({"symbol"}, 5),
    "/fapi/v1/exchangeInfo": (set(), 300),
    "/fapi/v1/klines": ({"symbol", "interval", "limit", "startTime", "endTime"}, 3),
    "/fapi/v1/openInterest": ({"symbol"}, 5),
    "/futures/data/globalLongShortAccountRatio": ({"symbol", "period", "limit", "startTime", "endTime"}, 30),
    "/futures/data/topLongShortPositionRatio": ({"symbol", "period", "limit", "startTime", "endTime"}, 30),
    "/futures/data/topLongShortAccountRatio": ({"symbol", "period", "limit", "startTime", "endTime"}, 30),
    "/futures/data/openInterestHist": ({"symbol", "period", "limit", "startTime", "endTime"}, 30),
}


def client():
    return current_app.extensions["binance"]


@bp.errorhandler(BinanceError)
def handle_binance_error(err: BinanceError):
    status = err.status if 400 <= err.status < 600 else 502
    return jsonify({"error": err.message, "code": err.code}), status


@bp.get("/health")
def health():
    return jsonify({"ok": True, "signedApi": client().has_credentials})


@bp.get("/market/<path:path>")
def market(path: str):
    path = "/" + path
    spec = PUBLIC_ENDPOINTS.get(path)
    if spec is None:
        return jsonify({"error": f"不允許的端點：{path}"}), 404
    allowed, ttl = spec
    params = {k: v for k, v in request.args.items() if k in allowed}
    return jsonify(client().public(path, params, ttl=ttl))


@bp.get("/wallet/coins")
def wallet_coins():
    """/sapi/v1/capital/config/getall（USER_DATA）。結果變動不頻繁，快取 10 分鐘。"""
    return jsonify(client().signed("/sapi/v1/capital/config/getall", ttl=600))
