import { ColorType, CrosshairMode } from "lightweight-charts";

export const COLORS = {
  up: "#24b47e",
  down: "#f05b6f",
  accent: "#f0b90b",
  ma7: "#f0b90b",
  ma25: "#c86bfa",
  ma99: "#4aa8ff"
};

// TradingView 深色風格基礎設定
export const baseChartOptions = {
  autoSize: true,
  layout: {
    background: { type: ColorType.Solid, color: "#0d1219" },
    textColor: "#a7b4c5",
    fontSize: 11,
    panes: { separatorColor: "#293340" }
  },
  grid: {
    vertLines: { color: "rgba(149,162,179,.12)" },
    horzLines: { color: "rgba(149,162,179,.12)" }
  },
  crosshair: { mode: CrosshairMode.Normal },
  rightPriceScale: { borderColor: "#293340" },
  leftPriceScale: { borderColor: "#293340" },
  timeScale: { borderColor: "#293340", timeVisible: true, secondsVisible: false }
};
