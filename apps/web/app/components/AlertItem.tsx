'use client';

import { X } from 'lucide-react';
import { memo } from 'react';
import type { Alert } from '@/app/hooks/useAlerts';

interface AlertItemProps {
  alert: Alert;
  onDelete: (id: string) => void;
}

const AlertItem = memo(function AlertItem({ alert, onDelete }: AlertItemProps) {
  return (
    <div className="flex items-center justify-between rounded border-[length:var(--border-width)] border-(--color-border) bg-(--color-surface-hover) px-3 py-2 text-sm">
      <span className="text-foreground font-[var(--font-weight-ui)]">
        {alert.keyword}
      </span>
      <button
        onClick={() => onDelete(alert.id)}
        className="ml-2 cursor-pointer rounded-full p-0.5 text-(--color-text-muted) opacity-70 transition-opacity hover:opacity-100"
        aria-label={`Remover alerta para "${alert.keyword}"`}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
});

export default AlertItem;
