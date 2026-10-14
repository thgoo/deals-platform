'use client';

import { Tag } from 'lucide-react';
import { useState } from 'react';

interface CouponCopyProps {
  code: string;
}

export default function CouponCopy({ code }: CouponCopyProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // no-op
    }
  };

  return (
    <div className="border-foreground flex items-center gap-3 rounded-lg border-3 bg-(--pixel-purple) p-3 shadow-[3px_3px_0px_var(--pixel-dark)]">
      <Tag className="h-4 w-4 text-white" />
      <code className="flex-1 text-sm font-bold text-white">{code}</code>
      <button
        onClick={handleCopy}
        className="pixel-btn rounded py-1! text-xs"
        title="Copiar cupom"
      >
        {copied ? '✓ Copiado!' : 'Copiar'}
      </button>
    </div>
  );
}
