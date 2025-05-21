// src/errors.ts

/**
 * Base class for custom application errors.
 */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name; // Set the error name to the class name
    // This next line is important for instanceof checks to work correctly with custom errors in some JS environments.
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error thrown when no signatures are found for a program.
 */
export class NoSignaturesFoundError extends AppError {
  public readonly programId: string;
  constructor(programId: string, message?: string) {
    super(message || `No signatures found for program: ${programId}. Signature fetch might have failed or the program has no transactions.`);
    this.programId = programId;
  }
}

/**
 * Error thrown when a transaction fetch fails after all retries
 * or the transaction is confirmed not to exist.
 */
export class TransactionNotFoundError extends AppError {
  public readonly signature: string;
  constructor(signature: string, message?: string) {
    super(message || `Transaction fetch failed for signature ${signature} after max retries or transaction not found.`);
    this.signature = signature;
  }
}

/**
 * Error thrown when blockTime is missing from a fetched transaction.
 */
export class MissingBlockTimeError extends AppError {
  public readonly signature: string;
  constructor(signature: string) {
    super(`Block time is missing from the transaction for signature: ${signature}.`);
    this.signature = signature;
  }
}

/**
 * Error thrown when an RPC operation fails after all retries due to persistent issues like rate limiting.
 */
export class RpcMaxRetriesError extends AppError {
  public readonly originalError?: Error; // Store the last underlying RPC error
  public readonly operation: string;

  constructor(operation: string, originalError?: Error) {
    let message = `RPC operation '${operation}' failed after maximum retries.`;
    if (originalError?.message) {
      message += ` Last error: ${originalError.message}`;
    }
    super(message);
    this.operation = operation;
    this.originalError = originalError;
  }
}

/**
 * Error thrown for invalid program ID format.
 */
export class InvalidProgramIdError extends AppError {
  public readonly programId: string;
  constructor(programId: string, originalError?: Error) {
    let message = `Invalid program ID format: ${programId}.`;
    if (originalError?.message) {
      message += ` Underlying error: ${originalError.message}`;
    }
    super(message);
    this.programId = programId;
  }
}
