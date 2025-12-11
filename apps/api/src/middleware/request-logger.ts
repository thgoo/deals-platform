import type { MiddlewareHandler } from 'hono';

export const requestLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const { method, path } = c.req;
    const start = Date.now();

    const url = new URL(c.req.url);
    const queryString = url.search;

    await next();

    const end = Date.now();
    const elapsed = end - start;
    const status = c.res.status;

    // Color status based on code
    let statusColor = '\x1b[32m'; // Green for 2xx
    if (status >= 300 && status < 400) statusColor = '\x1b[36m'; // Cyan for 3xx
    if (status >= 400 && status < 500) statusColor = '\x1b[33m'; // Yellow for 4xx
    if (status >= 500) statusColor = '\x1b[31m'; // Red for 5xx

    const reset = '\x1b[0m';
    const gray = '\x1b[90m';

    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const pathPart = path;
    const queryPart = queryString ? `${gray}${queryString}${reset}` : '';
    const methodLabel = `[${method}]`;

    // eslint-disable-next-line no-console
    console.log(
      `${gray}${time}${reset} ${statusColor}${methodLabel}${reset} ${pathPart}${queryPart} `
      + `${statusColor}${status}${reset} ${gray}${elapsed}ms${reset}`,
    );
  };
};
