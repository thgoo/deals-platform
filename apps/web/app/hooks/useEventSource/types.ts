/**
 * Options for configuring the EventSource connection
 */
export interface EventSourceOptions {
  /**
   * URL for the EventSource connection
   */
  url: string;

  /**
   * Whether to automatically reconnect on error
   * @default true
   */
  autoReconnect?: boolean;

  /**
   * Base delay for reconnection attempts in milliseconds
   * @default 1000
   */
  baseDelay?: number;

  /**
   * Maximum delay for reconnection attempts in milliseconds
   * @default 30000
   */
  maxReconnectDelay?: number;
}

/**
 * Event handler function type for EventSource events
 */
export type EventHandler = (event: MessageEvent) => void;

/**
 * Return type for the useEventSource hook
 */
export interface UseEventSourceReturn {
  /**
   * Add an event listener for a specific event type
   */
  addEventListener: (eventType: string, handler: EventHandler) => void;

  /**
   * Remove an event listener for a specific event type
   */
  removeEventListener: (eventType: string, handler: EventHandler) => void;

  /**
   * Close the EventSource connection
   */
  close: () => void;

  /**
   * Manually reconnect the EventSource
   */
  reconnect: () => void;
}
