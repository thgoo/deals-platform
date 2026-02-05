'use client';

import {
  AnimatedGrid,
  AnimatedAxis,
  AnimatedLineSeries,
  Tooltip,
  XYChart,
} from '@visx/xychart';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PriceHistoryItem } from '../types';
import { formatPrice, formatRelativeTime } from '../utils';

type ChartPoint = {
  x: Date;
  y: number;
  rawDate: string;
  store: string | null;
};

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setSize({ width: rect.width, height: rect.height });
    };

    update();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }

    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return { ref, size };
}

export default function PriceHistoryChart({
  history,
}: {
  history: PriceHistoryItem[];
}) {
  const { ref, size } = useElementSize<HTMLDivElement>();

  const data = useMemo<ChartPoint[]>(() => {
    const chronological = [...history].reverse();
    return chronological
      .map((item) => {
        const d = new Date(`${item.date}T00:00:00`);
        if (Number.isNaN(d.getTime())) return null;
        return {
          x: d,
          y: item.price,
          rawDate: item.date,
          store: item.store,
        };
      })
      .filter((v): v is ChartPoint => v !== null);
  }, [history]);

  const width = Math.floor(size.width);
  const height = 120;

  const dateFmt = useMemo(
    () =>
      new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      }),
    [],
  );

  if (data.length < 2) {
    return (
      <div ref={ref} className="w-full">
        <div className="text-xs text-(--pixel-gray)">
          Histórico insuficiente para gráfico.
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <XYChart
          width={width}
          height={height}
          margin={{ top: 10, right: 12, bottom: 26, left: 44 }}
          xScale={{ type: 'time' }}
          yScale={{ type: 'linear', nice: true, zero: false }}
        >
          <AnimatedGrid
            columns={false}
            numTicks={4}
            lineStyle={{ stroke: 'rgba(0,0,0,0.12)', strokeWidth: 1 }}
          />

          <AnimatedAxis
            orientation="bottom"
            numTicks={4}
            tickFormat={(v: Date | number | string) =>
              v instanceof Date ? dateFmt.format(v) : String(v)
            }
            tickLabelProps={() => ({
              fill: 'rgba(0,0,0,0.55)',
              fontSize: 10,
              fontWeight: 800,
            })}
            stroke="rgba(0,0,0,0.2)"
          />

          <AnimatedAxis
            orientation="left"
            numTicks={4}
            tickFormat={(v: Date | number | string) => {
              const n = typeof v === 'number' ? v : Number(v);
              if (!Number.isFinite(n)) return '';
              return formatPrice(Math.round(n));
            }}
            tickLabelProps={() => ({
              fill: 'rgba(0,0,0,0.55)',
              fontSize: 10,
              fontWeight: 800,
              textAnchor: 'end',
              dx: '-6px',
            })}
            stroke="rgba(0,0,0,0.2)"
          />

          <AnimatedLineSeries
            dataKey="price"
            data={data}
            xAccessor={(d) => d.x}
            yAccessor={(d) => d.y}
            stroke="var(--pixel-blue)"
            strokeWidth={3}
          />

          <Tooltip<ChartPoint>
            showVerticalCrosshair
            snapTooltipToDatumX
            snapTooltipToDatumY
            zIndex={9999}
            style={{
              background: 'transparent',
              boxShadow: 'none',
              padding: 0,
              borderRadius: 0,
            }}
            renderTooltip={({ tooltipData }) => {
              const nearest = tooltipData?.nearestDatum?.datum;
              if (!nearest) return null;

              return (
                <div className="border-foreground bg-background rounded border-2 px-2 pt-[5px] pb-1 text-xs font-black shadow-[2px_2px_0px_var(--pixel-dark)]">
                  <div className="text-foreground">
                    {formatPrice(nearest.y)}
                  </div>
                  <div className="text-(--pixel-gray)">
                    {formatRelativeTime(nearest.rawDate)}
                    {nearest.store ? ` • ${nearest.store}` : ''}
                  </div>
                </div>
              );
            }}
          />
        </XYChart>
      )}
    </div>
  );
}
