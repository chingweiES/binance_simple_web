"""Binance REST client: public market data + HMAC-signed USER_DATA calls.

The API secret never leaves this process; the browser only talks to /api/*.
"""
from __future__ import annotations

import hashlib
import hmac
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import requests

FAPI_BASE = "https://fapi.binance.com"
SAPI_BASE = "https://api.binance.com"


class BinanceError(Exception):
    def __init__(self, status: int, message: str, code: int | None = None):
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


class TTLCache:
    """Tiny thread-safe in-memory cache (per gunicorn worker process)."""

    def __init__(self, max_items: int = 2000):
        self._data: dict[str, tuple[float, object]] = {}
        self._lock = threading.Lock()
        self._max = max_items

    def get(self, key: str):
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            expires, value = item
            if expires < time.monotonic():
                self._data.pop(key, None)
                return None
            return value

    def set(self, key: str, value, ttl: float):
        if ttl <= 0:
            return
        with self._lock:
            if len(self._data) >= self._max:
                now = time.monotonic()
                for k in [k for k, (exp, _) in self._data.items() if exp < now]:
                    self._data.pop(k, None)
                if len(self._data) >= self._max:
                    self._data.clear()
            self._data[key] = (time.monotonic() + ttl, value)


@dataclass
class BinanceClient:
    api_key: str = ""
    api_secret: str = ""
    timeout: float = 10.0
    request_weight_futures_limit_1m: int = 2400

    def __post_init__(self):
        self.session = requests.Session()
        self.session.headers.update({"Accept": "application/json", "User-Agent": "binance-simple-web/1.0"})
        self.cache = TTLCache()
        self._futures_weight_lock = threading.Lock()
        self._futures_cooldown_until = 0.0

    @property
    def has_credentials(self) -> bool:
        return bool(self.api_key and self.api_secret)

    @staticmethod
    def _is_futures_api(url: str) -> bool:
        return url.startswith(f"{FAPI_BASE}/fapi/")

    def _wait_futures_cooldown_if_needed(self):
        with self._futures_weight_lock:
            wait = max(0.0, self._futures_cooldown_until - time.monotonic())
        if wait > 0:
            time.sleep(wait)

    def _check_futures_weight_and_maybe_cooldown(self, url: str, used_weight_1m: str | None):
        if not self._is_futures_api(url) or not used_weight_1m:
            return
        try:
            used_weight = int(used_weight_1m)
        except ValueError:
            return
        threshold = self.request_weight_futures_limit_1m * 0.8
        if used_weight <= threshold:
            return
        with self._futures_weight_lock:
            now = time.monotonic()
            self._futures_cooldown_until = max(self._futures_cooldown_until, now + 60)
            wait = max(0.0, self._futures_cooldown_until - now)
        if wait > 0:
            time.sleep(wait)

    def _request(self, url: str, params: dict, headers: dict | None = None):
        if self._is_futures_api(url):
            self._wait_futures_cooldown_if_needed()
        try:
            res = self.session.get(url, params=params, headers=headers, timeout=self.timeout)
        except requests.RequestException as exc:
            raise BinanceError(502, f"無法連線至 Binance：{exc}") from exc
        self._check_futures_weight_and_maybe_cooldown(url, res.headers.get("x-mbx-used-weight-1m"))
        try:
            data = res.json()
        except ValueError:
            raise BinanceError(502, f"Binance 回傳非 JSON（HTTP {res.status_code}）")
        if not res.ok:
            msg = data.get("msg") if isinstance(data, dict) else None
            code = data.get("code") if isinstance(data, dict) else None
            raise BinanceError(res.status_code, msg or f"HTTP {res.status_code}", code)
        return data

    def public(self, path: str, params: dict, ttl: float = 0):
        key = f"pub:{path}?{urlencode(sorted(params.items()))}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        data = self._request(f"{FAPI_BASE}{path}", params)
        self.cache.set(key, data, ttl)
        return data

    def signed(self, path: str, params: dict | None = None, ttl: float = 0, base: str = SAPI_BASE):
        if not self.has_credentials:
            raise BinanceError(500, "伺服器未設定 BINANCE_API_KEY / BINANCE_API_SECRET")
        params = dict(params or {})
        key = f"sig:{base}{path}?{urlencode(sorted(params.items()))}"
        cached = self.cache.get(key)
        if cached is not None:
            return cached
        params.setdefault("recvWindow", "10000")
        params["timestamp"] = str(int(time.time() * 1000))
        query = urlencode(params)
        signature = hmac.new(self.api_secret.encode(), query.encode(), hashlib.sha256).hexdigest()
        data = self._request(
            f"{base}{path}?{query}&signature={signature}",
            {},
            headers={"X-MBX-APIKEY": self.api_key},
        )
        self.cache.set(key, data, ttl)
        return data
