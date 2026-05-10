/**
 * Detects whether cmux is available (R1.1).
 * Pure w.r.t. env + fs state: same inputs → same output (R12.1).
 */
export function cmuxAvailable(): boolean;
/**
 * Mark cmux as permanently unavailable for this process (R13.1, R13.9).
 * Called by cli.mjs on EPIPE/ECONNREFUSED.
 */
export function markUnavailable(_reason: any): void;
export function isStickyUnavailable(): boolean;
/** Test-only reset */
export function __resetForTest(): void;
