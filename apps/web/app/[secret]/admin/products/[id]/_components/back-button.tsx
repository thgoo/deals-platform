'use client';

import { useRouter } from 'next/navigation';

interface BackButtonProps {
  fallbackHref: string;
}

/**
 * Navigates back via the browser history (preserving all table filters).
 * Falls back to `fallbackHref` when there is no history to go back to —
 * e.g. when the user opened the product page directly from a shared URL.
 */
export default function BackButton({ fallbackHref }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push(fallbackHref);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="label-eyebrow flex items-center gap-1.5 transition-colors hover:text-cyan-700"
      style={{ color: 'var(--i-text-muted)' }}
    >
      ← products
    </button>
  );
}
