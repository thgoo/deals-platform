'use client';

import { Bell } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alert, CreateAlertResult } from '@/app/hooks/useAlerts';
import AlertPanel from './AlertPanel';

interface AlertBellProps {
  alerts: Alert[];
  isLoading: boolean;
  isSupported: boolean;
  createAlert: (keyword: string) => Promise<CreateAlertResult>;
  deleteAlert: (id: string) => void;
}

export default function AlertBell({
  alerts,
  isLoading,
  isSupported,
  createAlert,
  deleteAlert,
}: AlertBellProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close panel when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={toggle}
        className="pixel-btn rounded-lg! px-3! py-2!"
        aria-label="Alertas de promoção"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" />
        {alerts.length > 0 && (
          <span className="absolute -top-3 -right-3 flex h-5 w-5 items-center justify-center rounded-full bg-(--pixel-dark) text-[10px] font-bold text-(--pixel-yellow)">
            {alerts.length}
          </span>
        )}
      </button>

      {isOpen && (
        <AlertPanel
          alerts={alerts}
          isLoading={isLoading}
          isSupported={isSupported}
          createAlert={createAlert}
          deleteAlert={deleteAlert}
        />
      )}
    </div>
  );
}
