/** Error returned to clients as `{ code, messageKey }`; messageKey is a translation key. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly details?: unknown,
  ) {
    super(code);
    this.name = 'AppError';
  }

  get messageKey(): string {
    return `error.${this.code}`;
  }
}

export const errors = {
  validation: (details?: unknown) => new AppError(400, 'validation', details),
  unauthorized: () => new AppError(401, 'unauthorized'),
  invalidCredentials: () => new AppError(401, 'invalidCredentials'),
  banned: () => new AppError(403, 'banned'),
  notFound: () => new AppError(404, 'notFound'),
  noCharacter: () => new AppError(404, 'noCharacter'),
  emailTaken: () => new AppError(409, 'emailTaken'),
  nameTaken: () => new AppError(409, 'nameTaken'),
  characterExists: () => new AppError(409, 'characterExists'),
  insufficientItems: (itemId: string) => new AppError(400, 'insufficientItems', { itemId }),
  unknownItem: (itemId: string) => new AppError(400, 'unknownItem', { itemId }),
  rateLimited: () => new AppError(429, 'rateLimited'),
  /** details = the engine BlockReason (the client explains it: "Requer Mineração 15"). */
  actionBlocked: (reason: unknown) => new AppError(400, 'actionBlocked', reason),
  notImplemented: () => new AppError(501, 'notImplemented'),
  badSequence: () => new AppError(400, 'badSequence'),
};

/** Postgres unique violation on a given constraint/index name. */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (
    let e: unknown = err;
    typeof e === 'object' && e !== null;
    e = (e as { cause?: unknown }).cause
  ) {
    const pgErr = e as { code?: string; constraint?: string };
    if (pgErr.code === '23505' && pgErr.constraint === constraint) return true;
  }
  return false;
}
