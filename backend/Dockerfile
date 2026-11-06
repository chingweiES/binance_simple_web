FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8000
# gthread：I/O 密集（等待 Binance 回應），用執行緒處理並行
CMD ["gunicorn", "wsgi:app", "--bind", "0.0.0.0:8000", "--worker-class", "gthread", "--workers", "2", "--threads", "8", "--timeout", "30", "--access-logfile", "-"]
