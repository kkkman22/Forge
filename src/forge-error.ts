/**
 * Base error class for all forge-loop errors.
 * Provides a machine-readable error code for programmatic handling.
 *
 * All domain-specific error classes should extend `ForgeError` and define
 * a unique `code` string for programmatic discrimination.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
export abstract class ForgeError extends Error {
  /** Machine-readable error code unique to each subclass. */
  abstract readonly code: string;

  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}
