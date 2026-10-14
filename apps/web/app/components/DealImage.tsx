'use client';

import Image from 'next/image';
import { useState } from 'react';
import DefaultDealImage from './DefaultDealImage';

interface DealImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
}

export default function DealImage({ src, alt, className }: DealImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || src === failedSrc) return <DefaultDealImage />;

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes="100%"
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
