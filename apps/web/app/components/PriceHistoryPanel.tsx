'use client';

import { History } from 'lucide-react';
import type { PriceHistoryResponse } from '../types';
import { formatDateTime, formatPrice, formatRelativeTime } from '../utils';
import PriceHistoryChart from './PriceHistoryChart';

interface PriceHistoryPanelProps {
  priceHistory: PriceHistoryResponse | null;
  isLoading: boolean;
  error: Error | null;
  notFound: boolean;
}

export default function PriceHistoryPanel({
  priceHistory,
  isLoading,
  error,
  notFound,
}: PriceHistoryPanelProps) {
  if (error) {
    return (
      <div className="py-12 text-center text-(--pixel-gray)">
        <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p className="font-bold">Erro ao carregar histórico</p>
        <p className="mt-1 text-sm">Tente novamente em alguns instantes.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="pixel-spinner h-8 w-8" />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="py-12 text-center text-(--pixel-gray)">
        <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p className="font-bold">Sem histórico disponível</p>
        <p className="mt-1 text-sm">
          Este produto ainda não tem dados suficientes.
        </p>
      </div>
    );
  }

  if (priceHistory && priceHistory.stats.totalDeals < 2) {
    return (
      <div className="py-12 text-center text-(--pixel-gray)">
        <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
        <p className="font-bold">Histórico insuficiente</p>
        <p className="mt-1 text-sm">
          Precisamos de pelo menos 2 ofertas para mostrar o histórico.
        </p>
      </div>
    );
  }

  if (!priceHistory) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="pixel-spinner h-8 w-8" />
      </div>
    );
  }

  const { stats, history } = priceHistory;

  return (
    <div className="space-y-6">
      <h4 className="text-foreground mb-2 text-xs font-black tracking-wider uppercase">
        Resumo
      </h4>
      <div className="grid grid-cols-2 gap-3">
        <div className="border-foreground rounded-lg border-2 bg-green-50 p-3 shadow-[2px_2px_0px_var(--pixel-dark)]">
          <div className="text-xs font-bold text-green-600 uppercase">
            Menor preço
          </div>
          <div className="text-lg font-black text-green-700">
            {formatPrice(stats.minPrice)}
          </div>
        </div>
        <div className="border-foreground rounded-lg border-2 bg-red-50 p-3 shadow-[2px_2px_0px_var(--pixel-dark)]">
          <div className="text-xs font-bold text-red-600 uppercase">
            Maior preço
          </div>
          <div className="text-lg font-black text-red-700">
            {formatPrice(stats.maxPrice)}
          </div>
        </div>
      </div>

      <div className="border-foreground rounded-lg border-2 bg-(--pixel-blue)/10 p-3 shadow-[2px_2px_0px_var(--pixel-dark)]">
        <div className="text-xs font-bold text-(--pixel-blue) uppercase">
          Preço médio
        </div>
        <div className="text-lg font-black">{formatPrice(stats.avgPrice)}</div>
        <div className="mt-1 text-xs text-(--pixel-gray)">
          Baseado em {stats.totalDeals}{' '}
          {stats.totalDeals === 1 ? 'oferta' : 'ofertas'}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-foreground text-xs font-black tracking-wider uppercase">
          Últimas ofertas
        </h4>
        <div className="space-y-2">
          {history.slice(0, 6).map((item, idx) => (
            <div
              key={idx}
              className="border-foreground flex items-center justify-between rounded border-2 bg-white p-2 text-sm"
            >
              <div>
                <span className="font-black">{formatPrice(item.price)}</span>
                {item.store && (
                  <span className="ml-2 text-xs text-(--pixel-gray)">
                    {item.store}
                  </span>
                )}
              </div>
              <span
                className="text-xs text-(--pixel-gray)"
                title={formatDateTime(item.ts)}
                suppressHydrationWarning
              >
                {formatRelativeTime(item.ts)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-foreground text-xs font-black tracking-wider uppercase">
          Evolução de preços
        </h4>
        <div className="border-foreground rounded-lg border-2 bg-white p-3 shadow-[2px_2px_0px_var(--pixel-dark)]">
          <PriceHistoryChart history={history} />
          <div className="mt-2 flex items-center justify-between text-xs text-(--pixel-gray)">
            <span className="ml-auto">{stats.totalDeals} ofertas</span>
          </div>
        </div>
      </div>
    </div>
  );
}
