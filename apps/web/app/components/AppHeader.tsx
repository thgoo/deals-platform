'use client';

import Image from 'next/image';
import Link from 'next/link';

interface AppHeaderProps {
  children?: React.ReactNode;
}

export default function AppHeader({ children }: AppHeaderProps) {
  return (
    <header className="sticky top-0 z-40 border-(--pixel-gray) bg-(--pixel-gray)">
      <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          replace
          scroll={false}
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="relative flex h-20 w-36 cursor-pointer items-center gap-4 sm:w-48"
          aria-label="Voltar para o início"
        >
          <Image
            src="/images/barga-dark.svg"
            alt="Bargah"
            fill
            sizes="100%"
            loading="eager"
          />
        </Link>
        {children}
      </div>
    </header>
  );
}
