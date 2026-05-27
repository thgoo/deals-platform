'use client';

import {
  AnimatedAreaSeries,
  AnimatedAxis,
  AnimatedGrid,
  Tooltip,
  XYChart,
} from '@visx/xychart';
import { useEffect, useRef, useState } from 'react';
import type { DailyCount } from '../_lib/types';

interface TimeSeriesChartProps {
  data: DailyCount[];
  height?: number;
}

interface ChartPoint {
  x: number;
  y: number;
  day: string;
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
 * Deals-per-day area chart, last N days. Single-series, neon-cyan accent.
 * Lives in a client component because visx needs the DOM.
 */
export default function TimeSeriesChart({
  data,
  height = 200,
}: TimeSeriesChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>();

  const points: ChartPoint[] = data.map((d, i) => ({
    x: i,
    y: d.count,
    day: d.day,
  }));

  if (points.length < 2) {
    return (
      <div ref={ref} className="text-xs text-zinc-400">
        not enough data yet — at least 2 days needed
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <XYChart
          width={width}
          height={height}
          margin={{ top: 8, right: 8, bottom: 24, left: 36 }}
          xScale={{ type: 'point' }}
          yScale={{ type: 'linear', nice: true, zero: true }}
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
            tickLabelProps={() => ({
              fill: '#71717a',
              fontSize: 10,
              textAnchor: 'end',
              dx: '-4px',
            })}
          />
          <AnimatedAxis
            orientation="bottom"
            numTicks={Math.min(7, points.length)}
            stroke="rgba(0,0,0,0.15)"
            tickFormat={(v: number | Date | string) => {
              const i = typeof v === 'number' ? v : Number(v);
              const p = points[i];
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
          <AnimatedAreaSeries
            dataKey="deals"
            data={points}
            xAccessor={(d) => d.x}
            yAccessor={(d) => d.y}
            fillOpacity={0.18}
            fill="#06b6d4"
            stroke="#06b6d4"
            lineProps={{ strokeWidth: 2 }}
          />
          <Tooltip<ChartPoint>
            showVerticalCrosshair
            snapTooltipToDatumX
            snapTooltipToDatumY
            zIndex={9999}
            style={{ background: 'transparent', boxShadow: 'none', padding: 0 }}
            renderTooltip={({ tooltipData }) => {
              const nearest = tooltipData?.nearestDatum?.datum;
              if (!nearest) return null;
              return (
                <div className="mono border border-cyan-500 bg-white px-2 py-1 text-xs text-zinc-800 shadow-sm">
                  <div>{nearest.day}</div>
                  <div className="tabular-nums">{nearest.y} deals</div>
                </div>
              );
            }}
          />
        </XYChart>
      )}
    </div>
  );
}
