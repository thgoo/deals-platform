'use client';

import { sendGAEvent } from '@next/third-parties/google';
import { Zap, SearchX, ArrowUp } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useEffect, useState } from 'react';
import type { Item, PaginatedResponse } from './types';
import AlertBell from './components/AlertBell';
import AppHeader from './components/AppHeader';
import DealList from './components/DealList';
import DealModal from './components/DealModal';
import SearchFilters from './components/SearchFilters';
import { useAlerts } from './hooks/useAlerts';
import { useDebounce } from './hooks/useDebounce';
import useInfiniteDeals from './hooks/useInfiniteDeals';

interface LiveClientProps {
  initialData: PaginatedResponse | null;
}

export default function LiveClient({ initialData }: LiveClientProps) {
  const [search] = useQueryState('search', parseAsString.withDefault(''));
  const [stores] = useQueryState(
    'stores',
    parseAsArrayOf(parseAsString).withDefault([]),
  );

  const { alerts, isLoading: alertsLoading, isSupported, createAlert, deleteAlert } = useAlerts();

  const [selectedDeal, setSelectedDeal] = useState<Item | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const debouncedSearch = useDebounce(search, 500);

  const {
    items,
    hasMore,
    isLoadingMore,
    isInitialLoading,
    isFilteringInProgress,
    observerTarget,
  } = useInfiniteDeals({
    initialData,
    search: debouncedSearch,
    stores,
  });

  const handleDealClick = (deal: Item) => {
    sendGAEvent('event', 'deal_click', {
      deal_id: deal.id,
      deal_title: deal.product,
    });
    setSelectedDeal(deal);
  };

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDeal(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  useEffect(() => {
    if (selectedDeal) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [selectedDeal]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 300);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  if (isInitialLoading) {
    return (
      <div className="bg-background flex min-h-screen items-center justify-center">
        <div className="space-y-4 text-center">
          <div className="pixel-spinner mx-auto h-16 w-16" />
          <p className="text-foreground text-sm font-black tracking-wider uppercase">
            Carregando promos...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-background pixel-dots relative min-h-screen">
      <div inert={!!selectedDeal}>
      <AppHeader>
        <AlertBell
          alerts={alerts}
          isLoading={alertsLoading}
          isSupported={isSupported}
          createAlert={createAlert}
          deleteAlert={deleteAlert}
        />
      </AppHeader>

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <SearchFilters
          availableStores={initialData?.availableStores}
          onCreateAlert={createAlert}
        />

        {isFilteringInProgress && (
          <div className="border-foreground mt-4 flex items-center justify-center gap-3 rounded-lg border-2 bg-white px-6 py-3 shadow-[3px_3px_0px_var(--pixel-dark)]">
            <div className="pixel-spinner h-5 w-5" />
            <span className="text-foreground text-sm font-black">
              Aplicando filtros...
            </span>
          </div>
        )}

        {!isFilteringInProgress && !isInitialLoading && items.length === 0 && (
          <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
            <div className="border-foreground mb-4 rounded-full border-3 bg-(--pixel-yellow) p-6 shadow-[3px_3px_0px_var(--pixel-dark)]">
              <SearchX className="h-12 w-12" />
            </div>
            <h3 className="text-foreground mb-2 text-xl font-black uppercase">
              Nenhuma promo encontrada
            </h3>
          </div>
        )}

        {items.length > 0 && (
          <DealList items={items} onDealClick={handleDealClick} />
        )}

        <div ref={observerTarget} className="flex justify-center py-12">
          {isLoadingMore && (
            <div className="border-foreground flex items-center gap-3 rounded-lg border-3 bg-white px-6 py-3 shadow-[4px_4px_0px_var(--pixel-dark)]">
              <div className="pixel-spinner h-5 w-5" />
              <span className="text-foreground text-sm font-black">
                Carregando...
              </span>
            </div>
          )}
          {!hasMore && items.length > 0 && (
            <div className="flex flex-row items-center gap-x-2 text-lg font-black tracking-wider text-(--pixel-gray) uppercase">
              <Zap className="h-8 w-8 text-(--pixel-yellow)" /> Você chegou ao
              fim <Zap className="h-8 w-8 text-(--pixel-yellow)" />
            </div>
          )}
        </div>
      </div>

      <footer className="border-foreground mt-8 border-t-3 bg-white">
        <div className="mx-auto max-w-[1400px] px-4 py-8 text-sm text-(--pixel-gray) sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <div className="text-foreground text-xs font-black tracking-wider uppercase">
                Disclosures
              </div>
              <div className="mt-3 space-y-2">
                <a href="/amzn" className="font-bold underline">
                  Amazon
                </a>
              </div>
            </div>
          </div>

          <div className="mt-8 text-center text-xs text-(--pixel-gray)/70">
            © {new Date().getFullYear()} #bargah.com.br
          </div>
        </div>
      </footer>

      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="pixel-btn fixed! right-6 bottom-6 z-50 flex cursor-pointer items-center justify-center rounded-full border-2 bg-(--pixel-green)! shadow-[3px_3px_0px_var(--pixel-dark)] transition-all"
          aria-label="Voltar ao topo"
        >
          <ArrowUp className="h-6 w-6" />
        </button>
      )}
      </div>

      {selectedDeal && (
        <DealModal deal={selectedDeal} onClose={() => setSelectedDeal(null)} />
      )}
    </div>
  );
}
