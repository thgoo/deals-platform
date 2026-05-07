'use client';

import {
  ChevronLeft,
  ChevronRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';
import type { Item } from '../types';
import { usePriceHistory } from '../hooks/usePriceHistory';
import { getPriceIndicator, PRICE_LEVEL } from '../utils/priceIndicator';
import DealDetails, { type PriceIndicatorDisplay } from './DealDetails';
import PriceHistoryPanel from './PriceHistoryPanel';

interface DealModalProps {
  deal: Item;
  onClose: () => void;
}

type TabType = 'details' | 'history';

export default function DealModal({ deal, onClose }: DealModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  const hasProductKey = !!deal.productKey;

  const {
    data: priceHistory,
    isLoading: isLoadingHistory,
    error: priceHistoryError,
    notFound: priceHistoryNotFound,
  } = usePriceHistory(deal.productKey, { enabled: hasProductKey });

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

  const priceIndicator = ((): PriceIndicatorDisplay | null => {
    if (!isHistoryEnabled || !priceHistory || !deal.price) return null;
    const result = getPriceIndicator(deal.price, priceHistory.stats);
    if (!result) return null;

    const icon = result.trend === 'down' ? TrendingDown
      : result.trend === 'up' ? TrendingUp
      : null;

    const COLOR_MAP: Record<string, string> = {
      [PRICE_LEVEL.HISTORICAL_MIN]: 'text-green-700',
      [PRICE_LEVEL.GREAT]:          'text-green-600',
      [PRICE_LEVEL.GOOD]:           'text-green-500',
      [PRICE_LEVEL.AVERAGE]:        'text-yellow-600',
      [PRICE_LEVEL.ABOVE]:          'text-red-500',
      [PRICE_LEVEL.HIGH]:           'text-red-600',
    };
    const color = COLOR_MAP[result.level] ?? 'text-gray-500';

    return { color, label: result.label, icon };
  })();

  const handleToggleHistoryPanel = () => {
    if (showHistoryPanel) {
      setShowHistoryPanel(false);
      return;
    }
    if (!isHistoryEnabled) return;
    setShowHistoryPanel(true);
  };

  const handleOpenHistoryTab = () => {
    if (activeTab === 'history' || !isHistoryEnabled) return;
    setActiveTab('history');
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
                className={
                  activeTab === 'details' ? 'block' : 'hidden lg:block'
                }
              >
                <DealDetails deal={deal} priceIndicator={priceIndicator} />
              </div>
              <div
                className={
                  activeTab === 'history' ? 'block lg:hidden' : 'hidden'
                }
              >
                <PriceHistoryPanel
                  priceHistory={priceHistory}
                  isLoading={isLoadingHistory}
                  error={priceHistoryError}
                  notFound={priceHistoryNotFound}
                />
              </div>
            </div>
          </div>

          {hasProductKey && (
            <div className="hidden lg:flex">
              <div
                className="border-foreground overflow-hidden border-l-4 bg-gray-50 transition-all duration-300 ease-in-out"
                style={{ width: showHistoryPanel ? '320px' : '0px' }}
              >
                <div className="w-80 p-4 pr-6">
                  <PriceHistoryPanel
                    priceHistory={priceHistory}
                    isLoading={isLoadingHistory}
                    error={priceHistoryError}
                    notFound={priceHistoryNotFound}
                  />
                </div>
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
