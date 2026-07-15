/**
 * Shared Result type for fallible operations (audit P2: error-boundary unification).
 *
 * Prior state: ~260 catch clauses mixed throw / return null / return default /
 * silent swallow with no convention. This leaf module provides the project's
 * canonical discriminated-union Result, mirroring the style already used in
 * `src/forge-dispatcher/allowlist.ts` (AllowResult/RejectResult).
 *
 * Convention:
 *   - Recoverable ops (parse, read-best-effort): return `Result<T, E>`
 *   - Unrecoverable ops (invariant violation): `throw`
 *   - Legitimate fail-soft (process probe, best-effort cleanup): keep try/catch
 *     but add a comment explaining why the error is intentionally swallowed.
 *
 * This module is a leaf — no imports from other src/ files — so it cannot form
 * a dependency cycle.
 */

/** Successful result. @public */
export interface Ok<T> {
  ok: true;
  value: T;
}

/** Failed result with a machine-readable code. @public */
export interface Err<E = unknown> {
  ok: false;
  /** Stable error code for programmatic handling (e.g. "io-error"). */
  code: string;
  /** Optional human-readable message. */
  message?: string;
  /** Optional original error for debugging. */
  error?: E;
}

/** Discriminated union of Ok and Err. @public */
export type Result<T, E = unknown> = Ok<T> | Err<E>;

/** Construct a success. @public */
export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

/** Construct a failure. @public */
export function err<E = unknown>(code: string, message?: string, error?: E): Err<E> {
  return { ok: false, code, message, error };
}

/** Type guard for success. @public */
export function isOk<T, E>(r: Result<T, E>): r is Ok<T> {
  return r.ok;
}

/** Type guard for failure. @public */
export function isErr<T, E>(r: Result<T, E>): r is Err<E> {
  return !r.ok;
}
