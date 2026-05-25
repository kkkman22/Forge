/**
 * Run a cmux CLI command (R1.4, R11.2).
 * Returns null on EPIPE/ECONNREFUSED/ENOENT (triggers markUnavailable).
 */
export function runCli(args: any, { timeoutMs, windowId }?: {
    timeoutMs?: number | undefined;
}): Promise<any>;
