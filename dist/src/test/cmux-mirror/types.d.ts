/**
 * Shared types for cmux-mirror test files.
 *
 * These mirror the shapes produced by `scripts/cmux-mirror/mirror.mjs` and
 * sibling JS modules. Because the production code is JavaScript + JSDoc, we
 * cannot import TS types directly; we redeclare the minimum surface needed
 * for test assertions.
 *
 * Why this file exists: replaces ad-hoc `as any` casts in individual test
 * files with structured types. Do NOT use `any` here — if a field shape is
 * unknown, use `unknown` and narrow at the call site.
 */
/** Daemon instance returned when `started === true`. */
export interface MirrorDaemonInstance {
    started: true;
    shutdown: () => Promise<void>;
    stop?: () => Promise<void> | void;
    forgeDir: string;
    socketDir: string;
    /** Catch-all for other runtime fields (events queue, intervals, etc.). */
    [key: string]: unknown;
}
/** Failed start result. */
export interface MirrorDaemonFailure {
    started: false;
    reason: string;
    /** Other diagnostic fields may be present but are not asserted on. */
    [key: string]: unknown;
}
/** Discriminated union — tests assert on `started` before accessing shutdown. */
export type MirrorDaemonStartResult = MirrorDaemonInstance | MirrorDaemonFailure;
/** Result of `syncOnce(...)`. */
export interface SyncOnceResult {
    ok: boolean;
    reason?: string;
    changed?: number;
}
/** Event envelope produced by the polling/FS-watch loop. */
export interface MirrorEvent {
    type: string;
    timestamp?: string;
    payload?: Record<string, unknown>;
}
