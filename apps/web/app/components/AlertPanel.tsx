'use client';

import { Bell } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';
import type { Alert, CreateAlertResult } from '@/app/hooks/useAlerts';
import AlertItem from './AlertItem';
import IOSInstallBanner from './IOSInstallBanner';

interface AlertPanelProps {
  alerts: Alert[];
  isLoading: boolean;
  isSupported: boolean;
  createAlert: (keyword: string) => Promise<CreateAlertResult>;
  deleteAlert: (id: string) => void;
}

export default function AlertPanel({
  alerts,
  isLoading,
  isSupported,
  createAlert,
  deleteAlert,
}: AlertPanelProps) {
  const [keyword, setKeyword] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleCreate = useCallback(async () => {
    const trimmed = keyword.trim();
    if (!trimmed || isCreating) return;

    setIsCreating(true);
    setError(null);

    const result = await createAlert(trimmed);

    if (result.ok) {
      setKeyword('');
      inputRef.current?.focus();
    } else {
      const messages: Record<string, string> = {
        permission_denied: 'Permissão de notificação negada.',
        not_supported: 'Notificações push não suportadas neste navegador.',
        error: 'Não foi possível criar o alerta. Tente novamente.',
      };
      if (result.reason === 'error' && 'message' in result) {
        console.error('[AlertPanel] createAlert error:', result.message);
      }
      setError(messages[result.reason] ?? 'Erro inesperado.');
    }

    setIsCreating(false);
  }, [keyword, isCreating, createAlert]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleCreate();
    },
    [handleCreate],
  );

  return (
    <div className="pixel-shadow border-foreground absolute top-full right-0 z-50 mt-2 w-80 rounded-lg border-3 bg-white p-4">
      <h3 className="text-foreground mb-3 text-sm font-black tracking-wider uppercase">
        Alertas
      </h3>

      <IOSInstallBanner />

      {isSupported && (
        <div className="mt-3 flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="ex: RTX 5070"
            className="pixel-input text-foreground min-w-0 flex-1 px-3 py-1.5 text-sm placeholder:text-(--pixel-gray)/50 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={!keyword.trim() || isCreating}
            className="pixel-btn rounded-lg! py-1.5! text-xs"
          >
            {isCreating ? '...' : 'Adicionar'}
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      <div className="mt-5 space-y-2">
        {isLoading ? (
          <p className="text-xs text-(--color-text-muted)">Carregando...</p>
        ) : alerts.length === 0 ? (
          <p className="flex items-center gap-2 text-xs text-(--color-text-muted)">
            <Bell className="h-3 w-3" />
            Nenhum alerta criado.
          </p>
        ) : (
          alerts.map((alert) => (
            <AlertItem key={alert.id} alert={alert} onDelete={deleteAlert} />
          ))
        )}
      </div>
    </div>
  );
}
