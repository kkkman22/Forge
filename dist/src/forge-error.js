/**
 * Base error class for all forge-loop errors.
 * Provides a machine-readable error code for programmatic handling.
 *
 * All domain-specific error classes should extend `ForgeError` and define
 * a unique `code` string for programmatic discrimination.
 *
 * **Validates: Requirements 9.1, 9.2**
 */
export class ForgeError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
    }
}
//# sourceMappingURL=forge-error.js.map