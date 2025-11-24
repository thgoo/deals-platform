import type { MiddlewareHandler } from 'hono';

/**
 * Custom request logger middleware that includes query strings
 * Follows the same format as ConsoleLogger with timestamp and colored query params
 */
export const requestLogger = (): MiddlewareHandler => {
  return async (c, next) => {
    const { method, path } = c.req;
    const start = Date.now();

    // Capturar query string
    const url = new URL(c.req.url);
    const queryString = url.search; // Retorna ?param=value ou string vazia

    await next();

    const end = Date.now();
    const elapsed = end - start;
    const status = c.res.status;

    // Colorir status baseado no código
    let statusColor = '\x1b[32m'; // Verde para 2xx
    if (status >= 300 && status < 400) statusColor = '\x1b[36m'; // Cyan para 3xx
    if (status >= 400 && status < 500) statusColor = '\x1b[33m'; // Amarelo para 4xx
    if (status >= 500) statusColor = '\x1b[31m'; // Vermelho para 5xx

    const reset = '\x1b[0m';
    const gray = '\x1b[90m';

    // Formatar hora no mesmo padrão do ConsoleLogger (HH:MM:SS)
    const now = new Date();
    const time = now.toLocaleTimeString('pt-BR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });

    // Construir log com query string em cinza
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
