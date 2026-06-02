'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useRef, useState } from 'react';

interface ProductsSearchProps {
  /** Current search value (for controlled input). */
  defaultValue: string;
  /** Base path for this page, e.g. "/<secret>/admin/products". */
  basePath: string;
}

/**
 * Debounced text search. Reads the current URL params via useSearchParams so
 * it can preserve sort/order when updating q — only primitives are needed from
 * the server component, not functions (which can't cross the server→client
 * boundary in the App Router).
 */
export default function ProductsSearch({
  defaultValue,
  basePath,
}: ProductsSearchProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(defaultValue);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChange = (raw: string) => {
    setValue(raw);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // Preserve sort/order; reset q and page.
      const params = new URLSearchParams(searchParams.toString());
      if (raw) {
        params.set('q', raw);
      } else {
        params.delete('q');
      }
      params.delete('page');
      const qs = params.toString();
      router.push(qs ? `${basePath}?${qs}` : basePath);
    }, 350);
  };

  return (
    <div className="relative">
      <span className="mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-[11px] text-zinc-400">
        /
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search products…"
        className="mono h-8 w-full border border-zinc-200 bg-white pr-3 pl-6 text-xs text-zinc-800 placeholder-zinc-400 outline-none focus:border-cyan-600"
      />
    </div>
  );
}
