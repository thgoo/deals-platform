'use client';

import {
  AnimatedAxis,
  AnimatedGrid,
  AnimatedLineSeries,
  Tooltip,
  XYChart,
} from '@visx/xychart';
import { useEffect, useRef, useState } from 'react';
import type { PricePoint } from '../_lib/types';
import { formatBRL } from './format';

interface PriceFloorChartProps {
  points: PricePoint[];
  /** Robust band in cents — drawn as reference lines over the series. */
  p10: number;
  median: number;
  height?: number;
}

interface ChartPoint {
  x: number;
  y: number;
  day: string;
  store: string | null;
}

/** Resize-aware container so visx redraws on layout changes. */
function useElementWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setWidth(el.getBoundingClientRect().width);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, width };
}

/**
 * Price-over-time for a single product, with the p10 (floor) and median drawn
 * as flat reference lines. The gap between the live price and the floor is the
 * "how good is this deal, really" signal — the whole reason the dataset is
 * worth something. x is the deal index (deals are irregularly spaced); the
 * bottom axis still labels real dates.
 */
export default function PriceFloorChart({
  points,
  p10,
  median,
  height = 240,
}: PriceFloorChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();

  const series: ChartPoint[] = points.map((p, i) => ({
    x: i,
    y: p.price / 100,
    day: p.ts.slice(0, 10),
    store: p.store,
  }));

  if (series.length < 2) {
    return (
      <div ref={ref} className="text-xs text-zinc-400">
        not enough priced deals yet — at least 2 needed
      </div>
    );
  }

  const floor = series.map((d) => ({ x: d.x, y: p10 / 100 }));
  const mid = series.map((d) => ({ x: d.x, y: median / 100 }));

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <XYChart
          width={width}
          height={height}
          margin={{ top: 8, right: 12, bottom: 24, left: 56 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', nice: true, zero: false }}
        >
          <AnimatedGrid
            columns={false}
            numTicks={4}
            lineStyle={{ stroke: 'rgba(0,0,0,0.06)', strokeWidth: 1 }}
          />
          <AnimatedAxis
            orientation="left"
            numTicks={4}
            stroke="rgba(0,0,0,0.15)"
            tickFormat={(v: number | { valueOf(): number }) =>
              formatBRL(Number(v) * 100)
            }
            tickLabelProps={() => ({
              fill: '#71717a',
              fontSize: 10,
              textAnchor: 'end',
              dx: '-4px',
            })}
          />
          <AnimatedAxis
            orientation="bottom"
            numTicks={Math.min(7, series.length)}
            stroke="rgba(0,0,0,0.15)"
            tickFormat={(v: number | Date | string) => {
              const i = typeof v === 'number' ? v : Number(v);
              const p = series[i];
              if (!p) return '';
              return p.day.slice(5); // MM-DD
            }}
            tickLabelProps={() => ({
              fill: '#71717a',
              fontSize: 10,
              textAnchor: 'middle',
              dy: '0.5em',
            })}
          />
          {/* p10 floor — emerald dashed reference line. */}
          <AnimatedLineSeries
            dataKey="floor"
            data={floor}
            xAccessor={(d) => d.x}
            yAccessor={(d) => d.y}
            stroke="#059669"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
          {/* median — zinc dashed reference line. */}
          <AnimatedLineSeries
            dataKey="median"
            data={mid}
            xAccessor={(d) => d.x}
            yAccessor={(d) => d.y}
            stroke="#a1a1aa"
            strokeWidth={1}
            strokeDasharray="2 3"
          />
          {/* Live price series. */}
          <AnimatedLineSeries
            dataKey="price"
            data={series}
            xAccessor={(d) => d.x}
            yAccessor={(d) => d.y}
            stroke="#06b6d4"
            strokeWidth={2}
          />
          <Tooltip<ChartPoint>
            showVerticalCrosshair
            snapTooltipToDatumX
            snapTooltipToDatumY
            zIndex={9999}
            style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}
            renderTooltip={({ tooltipData }) => {
              const nearest = tooltipData?.nearestDatum?.datum as
                | ChartPoint
                | undefined;
              if (!nearest) return null;
              return (
                <div className="mono border border-cyan-500 bg-white px-2 py-1 text-xs text-zinc-800 shadow-sm">
                  <div>{nearest.day}</div>
                  <div className="tabular-nums">
                    {formatBRL(nearest.y * 100)}
                  </div>
                  {nearest.store ? (
                    <div className="text-[10px] text-zinc-500">
                      {nearest.store}
                    </div>
                  ) : null}
                </div>
              );
            }}
          />
        </XYChart>
      )}
    </div>
  );
}
