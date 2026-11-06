import os

from flask import Flask

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
    app.register_blueprint(bp)
    return app
