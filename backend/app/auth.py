"""單一使用者密碼登入。

密碼雜湊存在 DATA_DIR/auth.json（Docker volume，重建容器不會遺失）。
第一次啟動時若檔案不存在，使用環境變數 ADMIN_PASSWORD 建立；之後一律以檔案為準，
登入後可在網頁上修改密碼。修改密碼會讓其他裝置上的登入全部失效。
"""
from __future__ import annotations

import json
import os
import secrets
import tempfile
import threading
import time
from functools import wraps
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, session
from werkzeug.security import check_password_hash, generate_password_hash

bp = Blueprint("auth", __name__, url_prefix="/api/auth")

MIN_PASSWORD_LENGTH = 8
_lock = threading.Lock()
# 同一 worker 內的登入失敗節流（nginx 另有每 IP 速率限制）
_failures: dict[str, tuple[int, float]] = {}
MAX_FAILURES = 5
LOCKOUT_SECONDS = 300


class AuthStore:
    def __init__(self, data_dir: str):
        self.dir = Path(data_dir)
        self.path = self.dir / "auth.json"

    def _write(self, data: dict, exclusive: bool = False) -> None:
        """原子寫入；exclusive=True 時若檔案已存在則不覆蓋（多個 worker 同時啟動）。"""
        self.dir.mkdir(parents=True, exist_ok=True)
        fd, tmp = tempfile.mkstemp(dir=self.dir, prefix=".auth-")
        try:
            with os.fdopen(fd, "w") as f:
                json.dump(data, f)
            os.chmod(tmp, 0o600)
            if exclusive:
                try:
                    os.link(tmp, self.path)
                except FileExistsError:
                    pass
            else:
                os.replace(tmp, self.path)
        finally:
            Path(tmp).unlink(missing_ok=True)

    def load(self) -> dict | None:
        try:
            return json.loads(self.path.read_text())
        except FileNotFoundError:
            return None

    def init(self, initial_password: str) -> None:
        """確保 auth.json 存在並含 session 簽章金鑰。"""
        with _lock:
            data = self.load()
            if data is not None:
                return
            if not initial_password:
                raise RuntimeError(
                    f"{self.path} 不存在且未設定 ADMIN_PASSWORD；請在 .env 設定初始密碼後重新啟動"
                )
            self._write({
                "password_hash": generate_password_hash(initial_password),
                "secret_key": secrets.token_hex(32),
                "version": secrets.token_hex(8),
            }, exclusive=True)

    def verify(self, password: str) -> bool:
        data = self.load()
        return bool(data) and check_password_hash(data["password_hash"], password)

    def set_password(self, password: str) -> str:
        with _lock:
            data = self.load() or {}
            data["password_hash"] = generate_password_hash(password)
            data["version"] = secrets.token_hex(8)
            self._write(data)
            return data["version"]

    def version(self) -> str | None:
        data = self.load()
        return data and data.get("version")


def store() -> AuthStore:
    return current_app.extensions["auth_store"]


def is_logged_in() -> bool:
    v = session.get("v")
    return bool(v) and v == store().version()


def login_required(view):
    @wraps(view)
    def wrapper(*args, **kwargs):
        if not is_logged_in():
            return jsonify({"error": "請先登入"}), 401
        return view(*args, **kwargs)
    return wrapper


def _start_session(version: str) -> None:
    session.clear()
    session.permanent = True
    session["v"] = version


def _json_body() -> dict | None:
    # 只接受 application/json：跨站表單無法送出這種請求，等同 CSRF 防護
    return request.get_json(silent=True) if request.is_json else None


@bp.get("/me")
def me():
    return jsonify({"loggedIn": is_logged_in()})


@bp.post("/login")
def login():
    body = _json_body()
    if body is None:
        return jsonify({"error": "格式錯誤"}), 400
    ip = request.headers.get("X-Real-IP") or request.remote_addr or "?"
    count, since = _failures.get(ip, (0, 0.0))
    if count >= MAX_FAILURES and time.time() - since < LOCKOUT_SECONDS:
        return jsonify({"error": "嘗試次數過多，請 5 分鐘後再試"}), 429

    if not store().verify(str(body.get("password", ""))):
        if time.time() - since >= LOCKOUT_SECONDS:
            count, since = 0, time.time()
        _failures[ip] = (count + 1, since)
        return jsonify({"error": "密碼錯誤"}), 401

    _failures.pop(ip, None)
    _start_session(store().version())
    return jsonify({"loggedIn": True})


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"loggedIn": False})


@bp.post("/password")
@login_required
def change_password():
    body = _json_body()
    if body is None:
        return jsonify({"error": "格式錯誤"}), 400
    current = str(body.get("currentPassword", ""))
    new = str(body.get("newPassword", ""))
    if not store().verify(current):
        return jsonify({"error": "目前密碼錯誤"}), 400
    if len(new) < MIN_PASSWORD_LENGTH:
        return jsonify({"error": f"新密碼至少 {MIN_PASSWORD_LENGTH} 個字元"}), 400
    if new == current:
        return jsonify({"error": "新密碼不可與目前密碼相同"}), 400
    # 換掉 version：其他裝置的 session 失效，目前這個 session 改用新 version 繼續登入
    _start_session(store().set_password(new))
    return jsonify({"ok": True})
