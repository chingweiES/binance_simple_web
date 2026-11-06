import { useEffect, useRef, useState } from "react";
import { CandlestickSeries, HistogramSeries, LineSeries, createChart } from "lightweight-charts";
import { market } from "../lib/api.js";
import { INTERVALS, formatNumber, toChartTime } from "../lib/format.js";
import { COLORS, baseChartOptions } from "./chartTheme.js";
import { Status } from "./common.jsx";

const MA_PERIODS = [[7, COLORS.ma7], [25, COLORS.ma25], [99, COLORS.ma99]];

function movingAverage(bars, period) {
  const out = [];
  let sum = 0;
  bars.forEach((bar, i) => {
    sum += bar.close;
    if (i >= period) sum -= bars[i - period].close;
    if (i >= period - 1) out.push({ time: bar.time, value: sum / period });
  });
  return out;
}

const toBar = (k) => ({
  time: toChartTime(k[0]),
  open: Number(k[1]),
  high: Number(k[2]),
  low: Number(k[3]),
  close: Number(k[4]),
  volume: Number(k[5])
});

const volumeBar = (b) => ({
  time: b.time,
  value: b.volume,
  color: b.close >= b.open ? "rgba(36,180,126,.5)" : "rgba(240,91,111,.5)"
});

// TradingView 風格 K 線：蠟燭 + MA + 成交量副圖 + 即時 WebSocket 更新
export default function CandleChart({ symbol, initialInterval = "15m" }) {
  const containerRef = useRef(null);
  const [interval, setChartInterval] = useState(initialInterval);
  const [status, setStatus] = useState({ message: "載入中…" });
  const [legend, setLegend] = useState(null);

  useEffect(() => {
    const chart = createChart(containerRef.current, baseChartOptions);
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up, downColor: COLORS.down, borderVisible: false,
      wickUpColor: COLORS.up, wickDownColor: COLORS.down
    });
    const maSeries = MA_PERIODS.map(([, color]) =>
      chart.addSeries(LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false })
    );
    const volume = chart.addSeries(HistogramSeries, { priceFormat: { type: "volume" }, priceLineVisible: false }, 1);
    // 主圖:成交量 ≈ 4:1
    const [mainPane, volumePane] = chart.panes();
    mainPane.setStretchFactor(4);
    volumePane.setStretchFactor(1);

    let bars = [];
    let socket;
    let disposed = false;

    const applyMA = () => MA_PERIODS.forEach(([period], i) => maSeries[i].setData(movingAverage(bars, period)));

    chart.subscribeCrosshairMove((param) => {
      const bar = param.time ? param.seriesData.get(candles) : null;
      setLegend(bar ?? null);
    });

    (async () => {
      try {
        const klines = await market("/fapi/v1/klines", { symbol, interval, limit: "500" });
        if (disposed) return;
        bars = klines.map(toBar);
        // 依實際報價小數位設定精度（低價幣如 0.01726 需要 5 位）
        const decimals = Math.max(...klines.slice(-50).map((k) => (String(k[4]).split(".")[1] ?? "").replace(/0+$/, "").length), 2);
        candles.applyOptions({ priceFormat: { type: "price", precision: decimals, minMove: 10 ** -decimals } });
        candles.setData(bars);
        volume.setData(bars.map(volumeBar));
        applyMA();
        chart.timeScale().scrollToRealTime();
        setStatus({ message: `${bars.length} 根 · 即時更新中` });

        // 公開行情 WebSocket，不需金鑰，瀏覽器直連
        socket = new WebSocket(`wss://fstream.binance.com/ws/${symbol.toLowerCase()}@kline_${interval}`);
        socket.onmessage = (event) => {
          const k = JSON.parse(event.data).k;
          const bar = toBar([k.t, k.o, k.h, k.l, k.c, k.v]);
          const last = bars.at(-1);
          if (last && bar.time < last.time) return;
          if (last && bar.time === last.time) bars[bars.length - 1] = bar;
          else bars.push(bar);
          candles.update(bar);
          volume.update(volumeBar(bar));
          applyMA();
        };
        socket.onerror = () => setStatus({ message: `${bars.length} 根 · 即時連線失敗`, error: true });
      } catch (error) {
        if (!disposed) setStatus({ message: `載入 K 線失敗：${error.message}`, error: true });
      }
    })();

    return () => {
      disposed = true;
      socket?.close();
      chart.remove();
    };
  }, [symbol, interval]);

  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        {INTERVALS.map(([value, label]) => (
          <button key={value} type="button" className={value === interval ? "active" : ""} onClick={() => setChartInterval(value)}>
            {label}
          </button>
        ))}
      </div>
      <div className="chart-legend ohlc">
        {legend ? (
          <>
            <span>開 {formatNumber(legend.open)}</span>
            <span>高 {formatNumber(legend.high)}</span>
            <span>低 {formatNumber(legend.low)}</span>
            <span className={legend.close >= legend.open ? "positive" : "negative"}>收 {formatNumber(legend.close)}</span>
          </>
        ) : (
          MA_PERIODS.map(([p, color]) => (
            <span key={p}><i className="swatch" style={{ background: color }} />MA{p}</span>
          ))
        )}
      </div>
      <div ref={containerRef} className="tv-chart tall" />
      <Status {...status} />
    </div>
  );
}
