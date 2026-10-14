import type { Item } from '../types';
import AmazonCard from './AmazonCard';
import CardGrid from './CardGrid';

interface AmazonListProps {
  items: Item[];
}

export default function AmazonList({ items }: AmazonListProps) {
  return (
    <CardGrid>
      {items.map((item) => {
        const primaryLink = item.links[0];
        if (!primaryLink) return null;
        return (
          <AmazonCard key={item.id} item={item} primaryLink={primaryLink} />
        );
      })}
    </CardGrid>
  );
}
