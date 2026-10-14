/* eslint-disable no-console -- access-log middleware; console is the sink */
import type { MiddlewareHandler } from 'hono';

// Matches ConsoleLogger's behavior: structured JSON in production (so log
// collectors can parse it and no raw ANSI escapes leak into the output),
// colored single-line access logs in development.
const isProduction = process.env['NODE_ENV'] === 'production';

export const requestLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const start = Date.now();

    await next();

    const elapsed = Date.now() - start;
    const { method } = c.req;
    const url = new URL(c.req.url);
    const path = url.pathname + url.search;
    const status = c.res.status;

    if (isProduction) {
      console.log(JSON.stringify({
        level: 'info',
        message: 'request',
        timestamp: new Date().toISOString(),
        method,
        path,
        status,
        durationMs: elapsed,
      }));
      return;
    }

    // ── Development: colored single-line access log ──
    let statusColor = '\x1b[32m'; // Green for 2xx
    if (status >= 300 && status < 400) statusColor = '\x1b[36m'; // Cyan for 3xx
    if (status >= 400 && status < 500) statusColor = '\x1b[33m'; // Yellow for 4xx
    if (status >= 500) statusColor = '\x1b[31m'; // Red for 5xx

    const reset = '\x1b[0m';
    const gray = '\x1b[90m';

    const time = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const queryPart = url.search ? `${gray}${url.search}${reset}` : '';

    console.log(
      `${gray}${time}${reset} ${statusColor}[${method}]${reset} ${url.pathname}${queryPart} `
      + `${statusColor}${status}${reset} ${gray}${elapsed}ms${reset}`,
    );
  };
};
