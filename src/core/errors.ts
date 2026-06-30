export class DomainError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Action non autorisée') {
    super(message, 'FORBIDDEN', 403);
  }
}

export class ValidationError extends DomainError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 422);
  }
}
