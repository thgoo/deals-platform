'use client';

import type { Item } from '../types';
import CardGrid from './CardGrid';
import DealCard from './DealCard';

interface DealListProps {
  items: Item[];
  onDealClick: (item: Item) => void;
}

export default function DealList({ items, onDealClick }: DealListProps) {
  return (
    <CardGrid>
      {items.map((item) => (
        <DealCard key={item.id} item={item} onClick={onDealClick} />
      ))}
    </CardGrid>
  );
}
