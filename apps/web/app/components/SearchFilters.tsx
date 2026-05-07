'use client';

import { Search, Store, X } from 'lucide-react';
import { parseAsArrayOf, parseAsString, useQueryState } from 'nuqs';
import { useState } from 'react';

interface SearchFiltersProps {
  availableStores?: string[];
}

const AVAILABLE_STORES = [
  'Amazon',
  'Magalu',
  'Kabum',
  'Pichau',
  'Mercado Livre',
  'Americanas',
  'Casas Bahia',
  'Extra',
];

export default function SearchFilters({ availableStores }: SearchFiltersProps) {
  const [search, setSearch] = useQueryState(
    'search',
    parseAsString
      .withDefault('')
      .withOptions({
        throttleMs: 500,
        history: 'replace',
        clearOnDefault: true,
      }),
  );
  const [stores, setStores] = useQueryState(
    'stores',
    parseAsArrayOf(parseAsString)
      .withDefault([])
      .withOptions({ history: 'replace' }),
  );
  const [showStoreDropdown, setShowStoreDropdown] = useState(false);

  const toggleStore = (store: string) => {
    const next = stores.includes(store)
      ? stores.filter((s) => s !== store)
      : [...stores, store];
    setStores(next.length > 0 ? next : null);
  };

  const clearAllFilters = () => {
    setSearch(null);
    setStores(null); // nuqs batches both into a single URL push
  };

  const hasActiveFilters = !!search || stores.length > 0;

  return (
    <div className="space-y-4">
      <div className="group relative">
        <Search className="absolute top-3.5 left-4 z-10 h-5 w-5 text-(--pixel-gray) group-focus-within:translate-px" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value || null)}
          placeholder="Ex: tv, iphone, lençol, etc..."
          className="border-foreground text-foreground relative w-full rounded-lg border-3 bg-white py-3 pr-4 pl-12 text-sm font-bold shadow-[3px_3px_0px_var(--pixel-dark)] placeholder:text-(--pixel-gray)/50 focus:translate-px focus:shadow-[2px_2px_0px_var(--pixel-dark)] focus:outline-none"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <button
            onClick={() => setShowStoreDropdown(!showStoreDropdown)}
            className="pixel-btn rounded-lg bg-white py-1.5! text-xs text-(--pixel-gray)"
          >
            <Store className="inline h-4 w-4" /> Lojas
            {stores.length > 0 && (
              <span className="bg-foreground ml-1 rounded-full px-2 py-0.5 text-xs text-white">
                {stores.length}
              </span>
            )}
          </button>

          {showStoreDropdown && (
            <>
              <div
                className="fixed inset-0 z-20"
                onClick={() => setShowStoreDropdown(false)}
              />
              <div className="border-foreground absolute top-full left-0 z-30 mt-2 w-64 rounded-lg border-3 bg-white p-3 shadow-[4px_4px_0px_var(--pixel-dark)]">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-foreground text-xs font-black uppercase">
                    Selecione as lojas
                  </span>
                  {stores.length > 0 && (
                    <button
                      onClick={() => setStores(null)}
                      className="cursor-pointer text-xs font-bold text-(--pixel-pink) hover:underline"
                    >
                      Limpar
                    </button>
                  )}
                </div>
                <div className="space-y-2">
                  {(availableStores || AVAILABLE_STORES).map((store) => (
                    <label
                      key={store}
                      className="hover:bg-background flex cursor-pointer items-center gap-2 rounded p-2"
                    >
                      <input
                        type="checkbox"
                        checked={stores.includes(store)}
                        onChange={() => toggleStore(store)}
                        className="h-4 w-4 cursor-pointer accent-(--pixel-blue)"
                      />
                      <span className="text-foreground text-sm font-bold">
                        {store}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>

        {hasActiveFilters && (
          <button
            onClick={clearAllFilters}
            className="pixel-btn rounded-lg bg-(--pixel-pink) py-1.5! text-xs"
          >
            Limpar Filtros
          </button>
        )}
      </div>

      {hasActiveFilters && (
        <div className="animate-fadeIn flex flex-wrap gap-2">
          {search && (
            <div className="border-foreground group flex items-center gap-2 rounded border-2 bg-(--pixel-orange) px-3 py-1 text-xs font-bold transition-all">
              <Search className="h-3 w-3" />
              {search}
              <button
                onClick={() => setSearch(null)}
                className="ml-1 cursor-pointer rounded-full p-0.5 opacity-70 transition-opacity group-hover:opacity-100 hover:bg-black/10 hover:opacity-100"
                title="Remover filtro"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {stores.map((store) => (
            <div
              key={store}
              className="border-foreground group flex items-center gap-2 rounded border-2 bg-(--pixel-blue) px-3 py-1 text-xs font-bold transition-all"
            >
              <Store className="h-3 w-3" />
              {store}
              <button
                onClick={() => setStores(stores.filter((s) => s !== store))}
                className="ml-1 cursor-pointer rounded-full p-0.5 opacity-70 transition-opacity group-hover:opacity-100 hover:bg-black/10 hover:opacity-100"
                title="Remover filtro"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
