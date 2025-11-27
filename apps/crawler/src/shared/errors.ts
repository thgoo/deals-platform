export class AppError extends Error {
  constructor(message: string, public cause?: unknown) {
    super(message);
    this.name = 'AppError';
  }
}

export class AuthError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'AuthError';
  }
}

export class ProcessingError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, cause);
    this.name = 'ProcessingError';
  }
}

export function handleError(error: unknown): void {
  const errorMsg = error instanceof Error ? error.message : String(error);
  console.error('[ERROR]', errorMsg);
}
