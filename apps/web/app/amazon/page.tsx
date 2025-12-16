import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import type { Item, PaginatedResponse } from '../types';
import { getApiUrl } from '@/lib/config';
import CouponCopy from '../components/CouponCopy';
import DefaultDealImage from '../components/DefaultDealImage';
import { formatDateTime, formatRelativeTime, removeUrls } from '../utils';

export const metadata: Metadata = {
  title: 'Amazon | #bargah.com.br',
  description: 'Links da Amazon com identificação de afiliado.',
};

function isAmazonLink(link: string): boolean {
  const l = link.toLowerCase();
  return l.includes('amazon.com.br') || l.includes('amzn.');
}

async function getAmazonDeals(limit = 50): Promise<Item[]> {
  const res = await fetch(getApiUrl(`/api/deals?limit=${limit}`), {
    next: { revalidate: 300 },
  });

  if (!res.ok) return [];

  const data: PaginatedResponse = await res.json();

  return (data.items || [])
    .filter(
      (item) => Array.isArray(item.links) && item.links.some(isAmazonLink),
    )
    .map((item) => ({
      ...item,
      links: item.links.filter(isAmazonLink),
    }));
}

export default async function AmazonPage() {
  const deals = await getAmazonDeals(60);

  return (
    <div className="bg-background pixel-dots relative min-h-screen">
      <div className="sticky top-0 z-40 border-(--pixel-gray) bg-(--pixel-gray)">
        <div className="mx-auto flex h-20 max-w-[1400px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
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
          </Link>
        </div>
      </div>

      <div className="relative z-10 mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
        <div className="border-foreground rounded-lg border-3 bg-white p-5 shadow-[4px_4px_0px_var(--pixel-dark)]">
          <h1 className="text-foreground text-lg font-black uppercase">
            Links da Amazon
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-(--pixel-gray)">
            Como Associado da Amazon, eu ganho com compras qualificadas. Isso
            ajuda a manter o site no ar e melhorar o serviço. Os links desta
            página levam diretamente para a Amazon.
          </p>
        </div>

        {deals.length === 0 ? (
          <div className="mt-8 flex flex-col items-center justify-center py-12 text-center">
            <h3 className="text-foreground mb-2 text-xl font-black uppercase">
              Nenhum link da Amazon encontrado
            </h3>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {deals.map((item) => {
              const displayText = item.product || item.description || item.text;
              const primaryLink = item.links[0];

              return (
                <div
                  key={item.id}
                  className="pixel-slide-in h-full transition-all duration-300"
                >
                  <div className="pixel-card group relative flex h-full w-full flex-col overflow-hidden rounded-lg text-left">
                    <div className="pixel-dots border-foreground relative aspect-square w-full overflow-hidden border-b-3">
                      {item.localPath ? (
                        <Image
                          src={`/api/media?file=${item.localPath}`}
                          alt={displayText}
                          fill
                          sizes="100%"
                          className="object-contain transition-transform duration-300"
                        />
                      ) : (
                        <DefaultDealImage />
                      )}
                      <div
                        className="border-foreground text-foreground bg-background absolute top-2 right-2 w-fit rounded border-2 px-2 pt-[5px] pb-1 text-xs font-black tracking-wider shadow-[2px_2px_0px_var(--pixel-dark)]"
                        title={formatDateTime(item.ts)}
                      >
                        {formatRelativeTime(item.ts)}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col space-y-3 p-4">
                      <h3 className="text-foreground text-sm leading-tight font-black">
                        {removeUrls(displayText)}
                      </h3>

                      {item.description && item.product && (
                        <p className="text-xs leading-relaxed text-(--pixel-gray)">
                          {item.description}
                        </p>
                      )}

                      <div className="mt-auto space-y-3">
                        {item.coupons && item.coupons.length > 0 && (
                          <div className="mb-3">
                            <CouponCopy code={item.coupons[0]!.code} />
                          </div>
                        )}
                        {primaryLink && (
                          <a
                            href={primaryLink}
                            target="_blank"
                            rel="nofollow noopener noreferrer"
                            className="pixel-btn pixel-btn-pink block w-full rounded-lg text-center text-base"
                          >
                            Ver na Amazon
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
