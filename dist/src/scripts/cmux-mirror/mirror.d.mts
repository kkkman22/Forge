#!/usr/bin/env node
/**
 * Create a debouncer (R1.8). Collects notifications within windowMs,
 * fires callback once with the last path.
 */
export function createDebouncer(windowMs: any, callback: any): {
    notify(path: any): void;
    cancel(): void;
};
/**
 * Create and start Mirror_Daemon (R1.5–R1.10).
 * Returns { started: true, shutdown } or { started: false, reason }.
 * @param {{ forgeDir?: string, socketDir?: string, cmuxAvailable?: boolean, forcePolling?: boolean, pollIntervalMs?: number }} opts
 */
export function createMirrorDaemon({ forgeDir, socketDir, cmuxAvailable: isAvailable, forcePolling, pollIntervalMs, }?: {
    forgeDir?: string;
    socketDir?: string;
    cmuxAvailable?: boolean;
    forcePolling?: boolean;
    pollIntervalMs?: number;
}): Promise<{
    started: boolean;
    reason: string;
    shutdown?: undefined;
} | {
    started: boolean;
    shutdown: () => Promise<void>;
    reason?: undefined;
}>;
