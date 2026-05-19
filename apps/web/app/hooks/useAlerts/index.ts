'use client';

import { useCallback, useEffect, useState } from 'react';
import { getApiUrl } from '@/lib/config';
import { isPushSupported, subscribeToPush } from '@/app/lib/pushSubscription';

export interface Alert {
  id: string;
  keyword: string;
  expiresAt: string;
}

export type CreateAlertResult =
  | { ok: true }
  | { ok: false; reason: 'permission_denied' | 'not_supported' | 'error'; message?: string };

const STORAGE_KEY = 'bargah-alerts';

interface StoredAlert {
  id: string;
  keyword: string;
}

function readStorage(): StoredAlert[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function writeStorage(alerts: StoredAlert[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const isSupported = isPushSupported();

  // Sync with API on mount and silently renew expiry
  useEffect(() => {
    const stored = readStorage();
    if (stored.length === 0) {
      setIsLoading(false);
      return;
    }

    const ids = stored.map((a) => a.id).join(',');
    fetch(getApiUrl(`/api/alerts?ids=${ids}`))
      .then((r) => r.json())
      .then((data: Alert[]) => {
        setAlerts(data);
        // Reconcile localStorage with server (remove alerts that no longer exist)
        const serverIds = new Set(data.map((a) => a.id));
        writeStorage(stored.filter((a) => serverIds.has(a.id)));
        // Renew expiry fire-and-forget
        data.forEach((a) =>
          fetch(getApiUrl(`/api/alerts/${a.id}/renew`), { method: 'POST' }).catch(() => {})
        );
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const createAlert = useCallback(async (keyword: string): Promise<CreateAlertResult> => {
    if (!isSupported) {
      return { ok: false, reason: 'not_supported' };
    }

    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return { ok: false, reason: 'permission_denied' };
    }

    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.error('[useAlerts] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not configured');
      return { ok: false, reason: 'error' };
    }

    try {
      const subscription = await subscribeToPush(vapidKey);
      const res = await fetch(getApiUrl('/api/alerts'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), subscription }),
      });

      if (!res.ok) throw new Error('Failed to create alert');

      const alert: Alert = await res.json();
      writeStorage([...readStorage(), { id: alert.id, keyword: alert.keyword }]);
      setAlerts((prev) => [...prev, alert]);
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: 'error', message: String(err) };
    }
  }, [isSupported]);

  const deleteAlert = useCallback(async (id: string): Promise<void> => {
    await fetch(getApiUrl(`/api/alerts/${id}`), { method: 'DELETE' }).catch(() => {});
    writeStorage(readStorage().filter((a) => a.id !== id));
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  return { alerts, isLoading, isSupported, createAlert, deleteAlert };
}
