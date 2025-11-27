import { ConsoleLogger } from './console-logger';

/**
 * Default logger instance
 * Uses ConsoleLogger but can be replaced with any Logger implementation
 */
export const logger = new ConsoleLogger();
