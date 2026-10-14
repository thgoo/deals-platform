'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface AdminNavProps {
  secret: string;
}

const LINKS = [
  { label: 'intelligence', href: (s: string) => `/${s}/admin` },
  { label: 'products', href: (s: string) => `/${s}/admin/products` },
] as const;

/**
 * Top-level navigation for the admin dashboard. Uses the HUD design language:
 * label-eyebrow typography, accent underline on the active page, muted text
 * for inactive links. Client component so it can read the live pathname.
 */
export default function AdminNav({ secret }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-6 border-b border-zinc-200 pb-4">
      {LINKS.map(({ label, href }) => {
        const target = href(secret);
        // Exact match for intelligence (root), prefix match for sub-pages.
        const isActive =
          label === 'intelligence'
            ? pathname === target
            : pathname.startsWith(target);

        return (
          <Link
            key={label}
            href={target}
            className="label-eyebrow relative pb-1 transition-colors"
            style={{
              color: isActive ? 'var(--i-accent)' : 'var(--i-text-muted)',
            }}
          >
            {label}
            {isActive && (
              <span
                className="absolute inset-x-0 bottom-0 h-px"
                style={{ background: 'var(--i-accent)' }}
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
