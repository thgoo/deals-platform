export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'AIServiceError';
  }
}

export class AIParsingError extends AIServiceError {
  constructor(message: string, cause?: Error) {
    super(message, cause);
    this.name = 'AIParsingError';
  }
}

export class AIAPIError extends AIServiceError {
  constructor(message: string, statusCode: number, cause?: Error) {
    super(message, cause, statusCode);
    this.name = 'AIAPIError';
  }
}
