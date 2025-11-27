'use client';

import { useEffect, useRef, useCallback } from 'react';
import {
  EventSourceOptions,
  EventHandler,
  UseEventSourceReturn,
} from './types';

/**
 * Custom hook for managing an EventSource connection
 * Maintains a persistent connection and handles reconnection logic
 */
export function useEventSource(
  options: EventSourceOptions,
): UseEventSourceReturn {
  const {
    url,
    autoReconnect = true,
    baseDelay = 1000,
    maxReconnectDelay = 30000,
  } = options;

  // Use refs to avoid recreating the EventSource on every render
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const eventHandlersRef = useRef<Map<string, Set<EventHandler>>>(new Map());
  const mountedRef = useRef(true);

  // Function declarations to handle circular references
  const closeRef = useRef<() => void>(() => {});
  const connectRef = useRef<() => void>(() => {});

  // Close the connection
  const close = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  // Connect to the EventSource
  const connect = useCallback(() => {
    // Close any existing connection first
    if (closeRef.current) {
      closeRef.current();
    }

    try {
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        reconnectAttemptsRef.current = 0;

        // Re-register all event handlers
        eventHandlersRef.current.forEach((handlers, eventType) => {
          handlers.forEach((handler) => {
            eventSource.addEventListener(eventType, handler);
          });
        });
      };

      eventSource.onerror = () => {
        if (eventSource.readyState === EventSource.CLOSED) {
          // CLOSED
          eventSource.close();

          if (autoReconnect && mountedRef.current) {
            const delay = Math.min(
              baseDelay * Math.pow(2, reconnectAttemptsRef.current),
              maxReconnectDelay,
            );
            reconnectAttemptsRef.current++;

            reconnectTimeoutRef.current = setTimeout(() => {
              if (mountedRef.current && connectRef.current) {
                connectRef.current();
              }
            }, delay);
          }
        }
      };
    } catch {
      if (autoReconnect && mountedRef.current) {
        const delay = Math.min(
          baseDelay * Math.pow(2, reconnectAttemptsRef.current),
          maxReconnectDelay,
        );
        reconnectAttemptsRef.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          if (mountedRef.current && connectRef.current) {
            connectRef.current();
          }
        }, delay);
      }
    }
  }, [url, autoReconnect, baseDelay, maxReconnectDelay]);

  // Add an event listener
  const addEventListener = useCallback(
    (eventType: string, handler: EventHandler) => {
      if (!eventHandlersRef.current.has(eventType)) {
        eventHandlersRef.current.set(eventType, new Set());
      }

      eventHandlersRef.current.get(eventType)!.add(handler);

      if (
        eventSourceRef.current &&
        eventSourceRef.current.readyState === EventSource.OPEN
      ) {
        eventSourceRef.current.addEventListener(eventType, handler);
      }
    },
    [],
  );

  // Remove an event listener
  const removeEventListener = useCallback(
    (eventType: string, handler: EventHandler) => {
      const handlers = eventHandlersRef.current.get(eventType);
      if (handlers) {
        handlers.delete(handler);

        if (eventSourceRef.current) {
          eventSourceRef.current.removeEventListener(eventType, handler);
        }

        if (handlers.size === 0) {
          eventHandlersRef.current.delete(eventType);
        }
      }
    },
    [],
  );

  useEffect(() => {
    closeRef.current = close;
  }, [close]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    mountedRef.current = true;

    connect();

    return () => {
      mountedRef.current = false;
      if (closeRef.current) {
        closeRef.current();
      }
    };
  }, [connect]);

  return {
    addEventListener,
    removeEventListener,
    close,
    reconnect: connect,
  };
}
