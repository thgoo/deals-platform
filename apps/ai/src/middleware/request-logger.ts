import type { MiddlewareHandler } from 'hono';

export const requestLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const { method, path } = c.req;
    const start = Date.now();

    const url = new URL(c.req.url);
    const queryString = url.search;

    await next();

    const elapsed = Date.now() - start;
    const status = c.res.status;

    let statusColor = '\x1b[32m';
    if (status >= 300 && status < 400) statusColor = '\x1b[36m';
    if (status >= 400 && status < 500) statusColor = '\x1b[33m';
    if (status >= 500) statusColor = '\x1b[31m';

    const reset = '\x1b[0m';
    const gray = '\x1b[90m';

    const time = new Date().toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    const queryPart = queryString ? `${gray}${queryString}${reset}` : '';
    const methodLabel = `[${method}]`;

    console.log(
      `${gray}${time}${reset} ${statusColor}${methodLabel}${reset} ${path}${queryPart} `
      + `${statusColor}${status}${reset} ${gray}${elapsed}ms${reset}`,
    );
  };
};
