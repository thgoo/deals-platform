import type { Logger } from './types';

/**
 * Console Logger with pretty output for development
 * Uses colored, human-readable format in dev and JSON in production
 */
export class ConsoleLogger implements Logger {
  private readonly isDevelopment: boolean;

  constructor() {
    this.isDevelopment = process.env.NODE_ENV !== 'production';
  }

  private shouldLog(): boolean {
    return process.env.NODE_ENV !== 'test';
  }

  private getLogIcon(level: string): string {
    switch (level) {
      case 'info': return '[INFO]';
      case 'warn': return '[WARN]';
      case 'error': return '[ERROR]';
      case 'debug': return '[DEBUG]';
      default: return '[LOG]';
    }
  }

  private getLogColor(level: string): string {
    switch (level) {
      case 'info': return '\x1b[36m';   // Cyan
      case 'warn': return '\x1b[33m';   // Yellow
      case 'error': return '\x1b[31m';  // Red
      case 'debug': return '\x1b[90m';  // Gray
      default: return '\x1b[0m';        // Reset
    }
  }

  private formatMeta(meta?: Record<string, unknown>): string {
    if (!meta || Object.keys(meta).length === 0) return '';

    const entries = Object.entries(meta)
      .map(([key, value]) => {
        const formattedValue = typeof value === 'string'
          ? value
          : JSON.stringify(value);
        return `\x1b[90m${key}=\x1b[0m${formattedValue}`;
      })
      .join(' ');

    return ` ${entries}`;
  }

  private log(level: string, message: string, meta?: Record<string, unknown>) {
    if (!this.shouldLog()) return;

    const now = new Date();
    const timestamp = now.toISOString();

    // Production: JSON format for log aggregators
    if (!this.isDevelopment) {
      const logData = {
        level,
        message,
        timestamp,
        ...meta,
      };
      // eslint-disable-next-line no-console
      const output = level === 'error' ? console.error : console.log;
      output(JSON.stringify(logData));
      return;
    }

    // Development: Pretty format with local time
    const color = this.getLogColor(level);
    const icon = this.getLogIcon(level);
    const reset = '\x1b[0m';
    const gray = '\x1b[90m';

    // Format time in local timezone (HH:MM:SS)
    const time = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const metaStr = this.formatMeta(meta);

    const prettyLog = `${gray}${time}${reset} ${color}${icon} ${message}${reset}${metaStr}`;

    // eslint-disable-next-line no-console
    const output = level === 'error' ? console.error : console.log;
    output(prettyLog);
  }

  info(message: string, meta?: Record<string, unknown>) {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>) {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>) {
    this.log('error', message, meta);
  }

  debug(message: string, meta?: Record<string, unknown>) {
    this.log('debug', message, meta);
  }
}
