'use client';

import { Store, Tag, DollarSign, Zap, SearchX } from 'lucide-react';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import type { Item, PaginatedResponse } from './types';
import SearchFilters from './components/SearchFilters';
import { useDebounce } from './hooks/useDebounce';
import useInfiniteDeals from './hooks/useInfiniteDeals';
import { formatPrice, removeUrls } from './utils';

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

  // Close modal on ESC
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedDeal(null);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Lock body scroll when modal open
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

  const handleImageError = (itemId: number) => {
    setImageLoadErrors((prev) => new Set(prev).add(itemId));
  };

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
      {/* Top Bar - Game Boy Style */}
      <div className="sticky top-0 z-40 border-(--pixel-gray) bg-(--pixel-gray)">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <div className="flex items-center gap-4">
            <Image
              src="/images/barga-dark.svg"
              alt="Barga"
              width={220}
              height={198}
            />
          </div>
        </div>
      </div>

      {/* Main Content */}
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

        {/* Indicador de filtragem em andamento */}
        {isFilteringInProgress && (
          <div className="border-foreground mt-4 flex items-center justify-center gap-3 rounded-lg border-2 bg-white px-6 py-3 shadow-[3px_3px_0px_var(--pixel-dark)]">
            <div className="pixel-spinner h-5 w-5" />
            <span className="text-foreground text-sm font-black">
              Aplicando filtros...
            </span>
          </div>
        )}
        {/* Estado de sem resultados */}
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

        {/* Grid - Responsive */}
        {items.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => {
              const displayText = item.product || item.description || item.text;

              return (
                <div
                  key={item.id}
                  className="pixel-slide-in h-full transition-all duration-300"
                >
                  <button
                    onClick={() => setSelectedDeal(item)}
                    className="pixel-card group relative flex h-full w-full flex-col overflow-hidden rounded-lg text-left"
                  >
                    {/* Image */}
                    {hasImage(item) && (
                      <div className="pixel-dots border-foreground relative aspect-square w-full overflow-hidden border-b-3">
                        <Image
                          src={`/api/media?file=${item.localPath}`}
                          alt={displayText}
                          fill
                          className="object-contain transition-transform duration-300"
                          onError={() => handleImageError(item.id)}
                        />
                        {/* Store Badge - Floating */}
                        {item.store && (
                          <div className="border-foreground text-foreground absolute bottom-2 left-2 w-fit rounded border-2 bg-(--pixel-blue) px-2 pt-[5px] pb-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
                            <Store className="relative -top-px inline h-4 w-4" />{' '}
                            {item.store}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex flex-1 flex-col space-y-3 p-4">
                      {/* Title */}
                      <h3 className="text-foreground line-clamp-2 text-sm leading-tight font-black">
                        {removeUrls(displayText)}
                      </h3>

                      {/* Bottom Section - Price + Coupons + CTA */}
                      <div className="mt-auto space-y-3">
                        {/* Coupons */}
                        {item.coupons && item.coupons.length > 0 && (
                          <div className="border-foreground text-foreground w-fit rounded border-2 bg-(--pixel-green) px-2 py-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
                            <Tag className="inline h-3 w-3" />{' '}
                            {item.coupons.length}{' '}
                            {item.coupons.length === 1 ? 'cupom' : 'cupons'}
                          </div>
                        )}

                        {/* Price */}
                        {item.price && (
                          <div className="flex items-center gap-2">
                            <span className="text-2xl font-black text-(--pixel-pink)">
                              {formatPrice(item.price)}
                            </span>
                          </div>
                        )}

                        {/* CTA */}
                        <div className="pixel-btn pixel-btn-pink w-full rounded-lg text-center text-xs">
                          Ver detalhes
                        </div>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Load More */}
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

      {/* Modal  */}
      {selectedDeal && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-(--pixel-dark)/60 backdrop-blur-sm"
            onClick={() => setSelectedDeal(null)}
          />

          {/* Modal */}
          <div className="fixed inset-4 z-50 m-auto flex max-h-[90vh] max-w-lg items-start justify-center pt-0 sm:inset-8">
            <div className="pixel-pop border-foreground max-h-full w-full overflow-y-auto rounded-xl border-4 bg-white shadow-[4px_4px_0px_var(--pixel-dark)]">
              {/* Header */}
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

              {/* Content */}
              <div className="space-y-6 p-6">
                {/* Image */}
                {hasImage(selectedDeal) && (
                  <div className="pixel-dots border-foreground relative aspect-video w-full overflow-hidden rounded-lg border-3">
                    <Image
                      src={`/api/media?file=${selectedDeal.localPath}`}
                      alt={selectedDeal.product || selectedDeal.text}
                      fill
                      className="object-contain p-6"
                      onError={() => handleImageError(selectedDeal.id)}
                    />
                  </div>
                )}

                {/* Store */}
                {selectedDeal.store && (
                  <div className="border-foreground text-foreground w-fit rounded border-2 bg-(--pixel-blue) px-2 pt-[5px] pb-1 text-xs font-black tracking-wider uppercase shadow-[2px_2px_0px_var(--pixel-dark)]">
                    <Store className="relative -top-px inline h-4 w-4" />{' '}
                    {selectedDeal.store}
                  </div>
                )}

                {/* Title */}
                <h3 className="text-foreground text-2xl leading-tight font-black">
                  {removeUrls(
                    selectedDeal.product ||
                      selectedDeal.description ||
                      selectedDeal.text,
                  )}
                </h3>

                {/* Description */}
                {selectedDeal.description && selectedDeal.product && (
                  <p className="text-sm leading-relaxed text-(--pixel-gray)">
                    {selectedDeal.description}
                  </p>
                )}

                {/* Price */}
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

                {/* Coupons */}
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

                {/* Links */}
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
    </div>
  );
}
