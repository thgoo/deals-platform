import type { Metadata } from 'next';
import type { Item, PaginatedResponse } from '../types';
import { getApiUrl } from '@/lib/config';
import AmazonList from '../components/AmazonList';
import AppHeader from '../components/AppHeader';

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
      <AppHeader />

      <div className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
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
          <AmazonList items={deals} />
        )}
      </div>
    </div>
  );
}
