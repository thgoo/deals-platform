'use client';

import {
  Store,
  DollarSign,
  TrendingDown,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  History,
} from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import type { Item } from '../types';
import { usePriceHistory } from '../hooks/usePriceHistory';
import {
  formatPrice,
  removeUrls,
  formatDateTime,
  formatRelativeTime,
} from '../utils';
import { getPriceIndicator } from '../utils/priceIndicator';
import CouponCopy from './CouponCopy';
import DefaultDealImage from './DefaultDealImage';

interface DealModalProps {
  deal: Item;
  onClose: () => void;
  imageLoadErrors: Set<number>;
  onImageError: (id: number) => void;
}

type TabType = 'details' | 'history';

export default function DealModal({
  deal,
  onClose,
  imageLoadErrors,
  onImageError,
}: DealModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const hasImage =
    deal.mediaType && deal.localPath && !imageLoadErrors.has(deal.id);
  const imageSrc = hasImage ? `/api/media?file=${deal.localPath}` : null;
  const hasProductKey = !!deal.productKey;

  const {
    data: priceHistory,
    isLoading: isLoadingHistory,
    error: priceHistoryError,
    notFound: priceHistoryNotFound,
  } = usePriceHistory(deal.productKey, {
    enabled: hasProductKey,
  });

  const isHistoryLoading =
    hasProductKey &&
    !!isLoadingHistory &&
    !priceHistory &&
    !priceHistoryNotFound &&
    !priceHistoryError;

  const isHistoryAvailable =
    !!priceHistory && (priceHistory.stats?.totalDeals ?? 0) >= 2;

  const isHistoryInsufficient =
    priceHistoryNotFound ||
    (!!priceHistory && (priceHistory.stats?.totalDeals ?? 0) < 2);

  const isHistoryEnabled = hasProductKey && isHistoryAvailable;

  const historyDisabledTitle = !hasProductKey
    ? undefined
    : isHistoryLoading
      ? 'Carregando histórico em background...'
      : priceHistoryError
        ? 'Não foi possível carregar o histórico agora.'
        : isHistoryInsufficient
          ? 'Histórico insuficiente: precisamos de pelo menos 2 ofertas.'
          : undefined;

  const handleToggleHistoryPanel = () => {
    if (showHistoryPanel) {
      setShowHistoryPanel(false);
      return;
    }

    if (!isHistoryEnabled) return;
    setShowHistoryPanel(true);
  };

  const handleOpenHistoryTab = () => {
    if (activeTab === 'history') return;
    if (!isHistoryEnabled) return;
    setActiveTab('history');
  };

  const priceIndicator = (() => {
    if (!isHistoryEnabled) return null;
    if (!priceHistory || !deal.price) return null;

    const result = getPriceIndicator(deal.price, priceHistory.stats);
    if (!result) return null;

    let icon = null;
    if (result.trend === 'down') icon = TrendingDown;
    else if (result.trend === 'up') icon = TrendingUp;

    let color = 'text-red-600';
    switch (result.level) {
      case 'great':
        color = 'text-green-600';
        break;
      case 'good':
        color = 'text-green-500';
        break;
      case 'average':
        color = 'text-yellow-600';
        break;
      case 'above':
        color = 'text-red-500';
        break;
      case 'high':
        color = 'text-red-600';
        break;
    }

    return { color, label: result.label, icon };
  })();

  const renderDetailsContent = () => (
    <div className="space-y-6">
      <div className="pixel-dots border-foreground relative aspect-video w-full overflow-hidden rounded-lg border-3">
        {imageSrc ? (
          <Image
            src={imageSrc}
            alt={deal.product || deal.text}
            fill
            sizes="100%"
            className="object-contain p-6"
            onError={() => onImageError(deal.id)}
          />
        ) : (
          <DefaultDealImage />
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {deal.store && (
          <div className="border-foreground text-foreground w-fit rounded border-2 bg-(--pixel-blue) px-2 pt-[5px] pb-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
            <Store className="relative -top-px inline h-4 w-4" /> {deal.store}
          </div>
        )}
        <div className="border-foreground text-foreground bg-background w-fit rounded border-2 px-2 pt-[5px] pb-1 text-xs font-black tracking-wider shadow-[2px_2px_0px_var(--pixel-dark)]">
          {formatDateTime(deal.ts)}
        </div>
      </div>

      <h3 className="text-foreground text-2xl leading-tight font-black">
        {removeUrls(deal.product || deal.description || deal.text)}
      </h3>

      {deal.description && deal.product && (
        <p className="text-sm leading-relaxed text-(--pixel-gray)">
          {deal.description}
        </p>
      )}

      {deal.price && (
        <div className="border-foreground flex items-center gap-4 rounded-lg border-3 bg-(--pixel-yellow) p-4 shadow-[4px_4px_0px_var(--pixel-dark)]">
          <DollarSign className="text-foreground h-12 w-12" />
          <div className="flex-1">
            <div className="text-foreground/60 text-xs font-bold uppercase">
              Preço
            </div>
            <div className="text-foreground text-3xl font-black">
              {formatPrice(deal.price)}
            </div>
            {priceIndicator && (
              <div
                className={`mt-1 flex items-center gap-1 text-xs font-bold ${priceIndicator.color}`}
              >
                {priceIndicator.icon && (
                  <priceIndicator.icon className="h-3 w-3" />
                )}
                {priceIndicator.label}
              </div>
            )}
          </div>
        </div>
      )}

      {deal.coupons && deal.coupons.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-foreground text-xs font-black tracking-wider uppercase">
            Cupons Disponíveis
          </h4>
          <div className="space-y-2">
            {deal.coupons.map((coupon) => (
              <CouponCopy key={coupon.code} code={coupon.code} />
            ))}
          </div>
        </div>
      )}

      {deal.links && deal.links.length > 0 && (
        <div className="space-y-3">
          {deal.links.map((link, idx) => (
            <a
              key={idx}
              href={link}
              target="_blank"
              rel="noopener noreferrer"
              className="pixel-btn pixel-btn-pink block w-full rounded-lg text-center text-base"
            >
              {idx === 0 ? 'Ver promo' : `Opção ${idx + 1}`}
            </a>
          ))}
        </div>
      )}
    </div>
  );

  const renderHistoryContent = () => {
    if (priceHistoryError) {
      return (
        <div className="py-12 text-center text-(--pixel-gray)">
          <History className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p className="font-bold">Erro ao carregar histórico</p>
          <p className="mt-1 text-sm">Tente novamente em alguns instantes.</p>
        </div>
      );
    }

    if (isLoadingHistory) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="pixel-spinner h-8 w-8" />
        </div>
      );
    }

    if (priceHistoryNotFound) {
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
    const sparkHistory = [...history].reverse();
    const sparkWidth = 280;
    const sparkHeight = 64;
    const sparkPadding = 6;
    const sparkMin = stats.minPrice;
    const sparkMax = stats.maxPrice;
    const sparkRange = sparkMax - sparkMin;

    let sparkPoints = '';
    if (sparkHistory.length >= 2 && sparkRange > 0) {
      sparkPoints = sparkHistory
        .map((h, idx) => {
          const x =
            sparkPadding +
            (idx * (sparkWidth - sparkPadding * 2)) / (sparkHistory.length - 1);
          const t = (h.price - sparkMin) / sparkRange;
          const y =
            sparkPadding +
            (1 - Math.min(1, Math.max(0, t))) *
              (sparkHeight - sparkPadding * 2);
          return `${x.toFixed(2)},${y.toFixed(2)}`;
        })
        .join(' ');
    }

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
          <div className="text-lg font-black">
            {formatPrice(stats.avgPrice)}
          </div>
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
                <span className="text-xs text-(--pixel-gray)" title={item.date}>
                  {formatRelativeTime(item.date)}
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
            <svg
              width={sparkWidth}
              height={sparkHeight}
              viewBox={`0 0 ${sparkWidth} ${sparkHeight}`}
              className="w-full"
              role="img"
              aria-label="Gráfico de preços"
            >
              <polyline
                points={sparkPoints}
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                className="text-(--pixel-blue)"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            </svg>
            <div className="mt-2 flex items-center justify-between text-xs text-(--pixel-gray)">
              <span>
                {formatPrice(stats.minPrice)} {'-'}{' '}
                {formatPrice(stats.maxPrice)}
              </span>
              <span>{stats.totalDeals} ofertas</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-(--pixel-dark)/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="fixed inset-4 z-50 m-auto flex max-h-[90vh] items-start justify-center pt-0 sm:inset-8">
        <div
          className={`pixel-pop border-foreground flex max-h-full w-full overflow-hidden rounded-xl border-4 bg-white shadow-[4px_4px_0px_var(--pixel-dark)] transition-all duration-300 md:w-auto ${
            hasProductKey && showHistoryPanel ? 'lg:max-w-4xl' : 'max-w-lg'
          }`}
        >
          <div className="flex min-w-0 flex-1 flex-col overflow-hidden md:w-[420px]">
            <div className="border-foreground sticky top-0 z-10 flex h-[60px] items-center justify-between border-b-4 bg-(--pixel-green) px-4">
              <h2 className="text-foreground text-lg font-black">
                Detalhes da promo
              </h2>
              <button
                onClick={onClose}
                className="pixel-btn rounded-lg px-2! py-1! text-xs"
              >
                Fechar
              </button>
            </div>
            {hasProductKey && (
              <div className="border-foreground flex border-b-2 lg:hidden">
                <button
                  onClick={() => setActiveTab('details')}
                  className={`flex-1 px-4 py-2 text-sm font-black transition-colors ${
                    activeTab === 'details'
                      ? 'text-foreground bg-(--pixel-green)/20'
                      : 'text-(--pixel-gray) hover:bg-gray-50'
                  }`}
                >
                  Detalhes
                </button>
                <button
                  onClick={handleOpenHistoryTab}
                  disabled={!isHistoryEnabled && activeTab !== 'history'}
                  title={historyDisabledTitle}
                  className={`flex-1 px-4 py-2 text-sm font-black transition-colors ${
                    !isHistoryEnabled && activeTab !== 'history'
                      ? 'cursor-not-allowed opacity-60'
                      : ''
                  } ${
                    activeTab === 'history'
                      ? 'text-foreground bg-(--pixel-green)/20'
                      : 'text-(--pixel-gray) hover:bg-gray-50'
                  }`}
                >
                  Histórico de preços
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-6">
              <div
                className="lg:block"
                style={{ display: activeTab === 'details' ? 'block' : 'none' }}
              >
                {renderDetailsContent()}
              </div>
              <div
                className="lg:hidden"
                style={{ display: activeTab === 'history' ? 'block' : 'none' }}
              >
                {renderHistoryContent()}
              </div>
            </div>
          </div>

          {hasProductKey && (
            <div className="hidden lg:flex">
              <div
                className="border-foreground overflow-hidden border-l-4 bg-gray-50 transition-all duration-300 ease-in-out"
                style={{ width: showHistoryPanel ? '320px' : '0px' }}
              >
                <div className="w-80 p-4 pr-6">{renderHistoryContent()}</div>
              </div>
              <button
                onClick={handleToggleHistoryPanel}
                disabled={!isHistoryEnabled && !showHistoryPanel}
                title={historyDisabledTitle}
                className={`border-foreground -ml-1 flex w-10 cursor-pointer flex-col items-center justify-center gap-2 border-l-4 bg-(--pixel-blue)/20 transition-colors hover:bg-(--pixel-blue)/30 ${
                  !isHistoryEnabled && !showHistoryPanel
                    ? 'cursor-not-allowed opacity-60'
                    : ''
                }`}
              >
                {showHistoryPanel ? (
                  <ChevronRight className="h-4 w-4" />
                ) : (
                  <ChevronLeft className="h-4 w-4" />
                )}
                <span
                  className="text-xs font-black uppercase"
                  style={{
                    writingMode: 'vertical-rl',
                    textOrientation: 'mixed',
                  }}
                >
                  Histórico de preços
                </span>
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
