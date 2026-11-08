import os
from datetime import timedelta

from flask import Flask

from .auth import AuthStore
from .auth import bp as auth_bp
from .binance import BinanceClient
from .routes import bp


def create_app() -> Flask:
    app = Flask(__name__)
    app.json.ensure_ascii = False
    app.extensions["binance"] = BinanceClient(
        api_key=os.environ.get("BINANCE_API_KEY", "").strip(),
        api_secret=os.environ.get("BINANCE_API_SECRET", "").strip(),
        timeout=float(os.environ.get("BINANCE_TIMEOUT", "10")),
    )

    auth_store = AuthStore(os.environ.get("DATA_DIR", "/data"))
    auth_store.init(os.environ.get("ADMIN_PASSWORD", ""))
    app.extensions["auth_store"] = auth_store
    app.config.update(
        SECRET_KEY=auth_store.load()["secret_key"],
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Lax",
        # 有 HTTPS 時在 .env 設 SESSION_COOKIE_SECURE=1
        SESSION_COOKIE_SECURE=os.environ.get("SESSION_COOKIE_SECURE", "0") == "1",
        PERMANENT_SESSION_LIFETIME=timedelta(days=30),
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(bp)
    return app
