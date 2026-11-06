import { useEffect, useRef } from "react";
import { HistogramSeries, LineSeries, createChart } from "lightweight-charts";
import { toChartTime } from "../lib/format.js";
import { COLORS, baseChartOptions } from "./chartTheme.js";

// 仿幣安 APP「多空比」：多倉／空倉比例堆疊柱（左軸 %）+ 多空比折線（右軸）
export default function RatioChart({ history, longLabel, shortLabel }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const data = [...history].sort((a, b) => Number(a.timestamp) - Number(b.timestamp));
    const chart = createChart(containerRef.current, {
      ...baseChartOptions,
      leftPriceScale: { ...baseChartOptions.leftPriceScale, visible: true, scaleMargins: { top: 0.05, bottom: 0 } }
    });
    const percent = { type: "custom", formatter: (v) => `${v.toFixed(1)}%` };
    // 先畫 100% 紅柱（空），再疊上綠柱（多）＝堆疊效果
    const shortBars = chart.addSeries(HistogramSeries, {
      priceScaleId: "left", color: "rgba(240,91,111,.7)", priceFormat: percent, priceLineVisible: false, lastValueVisible: false
    });
    const longBars = chart.addSeries(HistogramSeries, {
      priceScaleId: "left", color: "rgba(36,180,126,.8)", priceFormat: percent, priceLineVisible: false
    });
    const ratioLine = chart.addSeries(LineSeries, { color: COLORS.accent, lineWidth: 2, priceLineVisible: false });

    shortBars.setData(data.map((d) => ({ time: toChartTime(d.timestamp), value: 100 })));
    longBars.setData(data.map((d) => ({ time: toChartTime(d.timestamp), value: Number(d.longAccount) * 100 })));
    ratioLine.setData(data.map((d) => ({ time: toChartTime(d.timestamp), value: Number(d.longShortRatio) })));
    // 彈窗剛開啟時容器寬度可能還是 0，尺寸確定後再 fit，避免資料擠在右側
    const observer = new ResizeObserver(() => chart.timeScale().fitContent());
    observer.observe(containerRef.current);
    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [history]);

  return (
    <div className="chart-wrap">
      <div ref={containerRef} className="tv-chart" />
      <div className="chart-legend">
        <span><i className="swatch short" />{shortLabel}</span>
        <span><i className="swatch long" />{longLabel}</span>
        <span><i className="swatch line" />多空比值（右軸）</span>
      </div>
    </div>
  );
}
