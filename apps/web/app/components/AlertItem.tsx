'use client';

import { Trash2 } from 'lucide-react';
import { memo } from 'react';
import type { Alert } from '@/app/hooks/useAlerts';

interface AlertItemProps {
  alert: Alert;
  onDelete: (id: string) => void;
}

const AlertItem = memo(function AlertItem({ alert, onDelete }: AlertItemProps) {
  return (
    <div className="flex items-center justify-between rounded border-(length:--border-width) border-(--color-border) bg-(--color-surface-hover) pl-3 text-sm">
      <span className="text-foreground font-(--font-weight-ui)">
        {alert.keyword}
      </span>
      <button
        onClick={() => onDelete(alert.id)}
        className="ml-2 cursor-pointer rounded-full p-2 text-(--color-text-muted) opacity-70 transition-opacity hover:opacity-100"
        aria-label={`Remover alerta para "${alert.keyword}"`}
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
});

export default AlertItem;
