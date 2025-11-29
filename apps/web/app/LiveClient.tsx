'use client';

import { sendGAEvent } from '@next/third-parties/google';
import { Store, Tag, DollarSign, Zap, SearchX, ArrowUp } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Item, PaginatedResponse } from './types';
import DefaultDealImage from './components/DefaultDealImage';
import SearchFilters from './components/SearchFilters';
import { useDebounce } from './hooks/useDebounce';
import useInfiniteDeals from './hooks/useInfiniteDeals';
import {
  formatPrice,
  removeUrls,
  formatRelativeTime,
  formatDateTime,
} from './utils';

interface LiveClientProps {
  initialData: PaginatedResponse | null;
}

export default function LiveClient({ initialData }: LiveClientProps) {
  const [selectedDeal, setSelectedDeal] = useState<Item | null>(null);
  const [imageLoadErrors, setImageLoadErrors] = useState<Set<number>>(
    new Set(),
  );
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [hasCoupon, setHasCoupon] = useState<boolean | null>(null);
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
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
    hasCoupon,
    stores: selectedStores,
  });

  const hasImage = (item: Item) =>
    item.mediaType && item.localPath && !imageLoadErrors.has(item.id);

  const getImageSrc = (item: Item) => {
    return hasImage(item) ? `/api/media?file=${item.localPath}` : null;
  };

  const handleLogoClick = () => {
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.location.reload();
  };

  const handleDealClick = (deal: Item) => {
    setSelectedDeal(deal);
    sendGAEvent('event', 'deal_click', {
      deal_id: deal.id,
      deal_title: deal.product,
    });
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

  const handleImageError = (itemId: number) => {
    setImageLoadErrors((prev) => new Set(prev).add(itemId));
  };

  useEffect(() => {
    if (window.scrollY > 300) setTimeout(() => setShowScrollTop(true), 0);
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setShowScrollTop(true);
      } else {
        setShowScrollTop(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
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
      <div className="sticky top-0 z-40 border-(--pixel-gray) bg-(--pixel-gray)">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <button
            onClick={handleLogoClick}
            className="relative flex h-20 w-36 cursor-pointer items-center gap-4 sm:w-48"
            aria-label="Voltar para o início"
          >
            <Image
              src="/images/barga-dark.svg"
              alt="Barga"
              fill
              sizes="100%"
              loading="eager"
            />
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <SearchFilters
          search={search}
          onSearchChange={setSearch}
          hasCoupon={hasCoupon}
          onHasCouponChange={setHasCoupon}
          selectedStores={selectedStores}
          onStoresChange={setSelectedStores}
          availableStores={initialData?.availableStores}
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
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const displayText = item.product || item.description || item.text;

              return (
                <div
                  key={item.id}
                  className="pixel-slide-in h-full transition-all duration-300"
                >
                  <div className="pixel-card group relative flex h-full w-full flex-col overflow-hidden rounded-lg text-left">
                    <div className="pixel-dots border-foreground relative aspect-square w-full overflow-hidden border-b-3">
                      {getImageSrc(item) ? (
                        <Image
                          src={getImageSrc(item)!}
                          alt={displayText}
                          fill
                          sizes="100%"
                          className="object-contain transition-transform duration-300"
                          onError={() => handleImageError(item.id)}
                        />
                      ) : (
                        <DefaultDealImage />
                      )}
                      {item.store && (
                        <div className="border-foreground text-foreground absolute bottom-2 left-2 w-fit rounded border-2 bg-(--pixel-blue) px-2 pt-[5px] pb-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
                          <Store className="relative -top-px inline h-4 w-4" />{' '}
                          {item.store}
                        </div>
                      )}
                      <div
                        className="border-foreground text-foreground bg-background absolute top-2 right-2 w-fit rounded border-2 px-2 pt-[5px] pb-1 text-xs font-black tracking-wider shadow-[2px_2px_0px_var(--pixel-dark)]"
                        title={formatDateTime(item.ts)}
                      >
                        {formatRelativeTime(item.ts)}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col space-y-3 p-4">
                      <h3 className="text-foreground line-clamp-2 text-sm leading-tight font-black">
                        {removeUrls(displayText)}
                      </h3>

                      <div className="mt-auto space-y-3">
                        {item.coupons && item.coupons.length > 0 && (
                          <div className="border-foreground text-foreground w-fit rounded border-2 bg-(--pixel-green) px-2 py-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
                            <Tag className="inline h-3 w-3" />{' '}
                            {item.coupons.length}{' '}
                            {item.coupons.length === 1 ? 'cupom' : 'cupons'}
                          </div>
                        )}

                        {item.price && (
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-(--pixel-pink)">
                              {formatPrice(item.price)}
                            </span>
                          </div>
                        )}

                        <button
                          className="pixel-btn pixel-btn-pink w-full rounded-lg text-center text-xs"
                          onClick={() => handleDealClick(item)}
                        >
                          Ver detalhes
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
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

      {selectedDeal && (
        <>
          <div
            className="fixed inset-0 z-50 bg-(--pixel-dark)/60 backdrop-blur-sm"
            onClick={() => setSelectedDeal(null)}
          />

          <div className="fixed inset-4 z-50 m-auto flex max-h-[90vh] max-w-lg items-start justify-center pt-0 sm:inset-8">
            <div className="pixel-pop border-foreground max-h-full w-full overflow-y-auto rounded-xl border-4 bg-white shadow-[4px_4px_0px_var(--pixel-dark)]">
              <div className="border-foreground sticky top-0 z-10 flex items-center justify-between border-b-4 bg-(--pixel-green) p-4">
                <h2 className="text-foreground text-lg font-black">
                  Detalhes da promo
                </h2>
                <button
                  onClick={() => setSelectedDeal(null)}
                  className="pixel-btn rounded-lg px-2! py-1! text-xs"
                >
                  Fechar
                </button>
              </div>

              <div className="space-y-6 p-6">
                <div className="pixel-dots border-foreground relative aspect-video w-full overflow-hidden rounded-lg border-3">
                  {getImageSrc(selectedDeal) ? (
                    <Image
                      src={getImageSrc(selectedDeal)!}
                      alt={selectedDeal.product || selectedDeal.text}
                      fill
                      sizes="100%"
                      className="object-contain p-6"
                      onError={() => handleImageError(selectedDeal.id)}
                    />
                  ) : (
                    <DefaultDealImage />
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {selectedDeal.store && (
                    <div className="border-foreground text-foreground w-fit rounded border-2 bg-(--pixel-blue) px-2 pt-[5px] pb-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
                      <Store className="relative -top-px inline h-4 w-4" />{' '}
                      {selectedDeal.store}
                    </div>
                  )}
                  <div className="border-foreground text-foreground w-fit rounded border-2 bg-(--pixel-gray) px-2 pt-[5px] pb-1 text-xs font-black tracking-wider shadow-[2px_2px_0px_var(--pixel-dark)]">
                    {formatDateTime(selectedDeal.ts)}
                  </div>
                </div>

                <h3 className="text-foreground text-2xl leading-tight font-black">
                  {removeUrls(
                    selectedDeal.product ||
                      selectedDeal.description ||
                      selectedDeal.text,
                  )}
                </h3>

                {selectedDeal.description && selectedDeal.product && (
                  <p className="text-sm leading-relaxed text-(--pixel-gray)">
                    {selectedDeal.description}
                  </p>
                )}

                {selectedDeal.price && (
                  <div className="border-foreground flex items-center gap-4 rounded-lg border-3 bg-(--pixel-yellow) p-4 shadow-[4px_4px_0px_var(--pixel-dark)]">
                    <DollarSign className="text-foreground h-12 w-12" />
                    <div>
                      <div className="text-foreground/60 text-xs font-bold uppercase">
                        Preço
                      </div>
                      <div className="text-foreground text-3xl font-black">
                        {formatPrice(selectedDeal.price)}
                      </div>
                    </div>
                  </div>
                )}

                {selectedDeal.coupons && selectedDeal.coupons.length > 0 && (
                  <div className="space-y-3">
                    <h4 className="text-foreground text-xs font-black tracking-wider uppercase">
                      Cupons Disponíveis
                    </h4>
                    <div className="space-y-2">
                      {selectedDeal.coupons.map((coupon, idx) => (
                        <div
                          key={idx}
                          className="border-foreground flex items-center gap-3 rounded-lg border-3 bg-(--pixel-purple) p-3 shadow-[3px_3px_0px_var(--pixel-dark)]"
                        >
                          <Tag className="h-4 w-4 text-white" />
                          <code className="flex-1 text-sm font-bold text-white">
                            {coupon.code}
                          </code>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(coupon.code);
                              setCopiedCoupon(coupon.code);
                              setTimeout(() => setCopiedCoupon(null), 2000);
                            }}
                            className="pixel-btn rounded py-1! text-xs"
                            title="Copiar cupom"
                          >
                            {copiedCoupon === coupon.code
                              ? '✓ Copiado!'
                              : 'Copiar'}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {selectedDeal.links && selectedDeal.links.length > 0 && (
                  <div className="space-y-3">
                    {selectedDeal.links.map((link, idx) => (
                      <a
                        key={idx}
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="pixel-btn pixel-btn-pink block w-full rounded-lg text-center text-base"
                      >
                        {idx === 0 ? 'Ver promo' : `Opção ${idx + 1}`}{' '}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

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
  );
}
