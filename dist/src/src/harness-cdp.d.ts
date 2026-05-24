/**
 * CDP harness adapter — Tier 4 UI verification via Chrome DevTools Protocol.
 *
 * Connects to user's manually-started Chrome via WebSocket.
 * Returns graceful failure when no browser is listening.
 *
 * **Validates: Requirement R6.2**
 */
export interface CdpHarnessOptions {
    appUrl: string;
    debuggingPort?: number;
}
export interface CdpHarnessResult {
    ok: boolean;
    reason?: string;
    snapshot?: string;
}
export declare function runCdpHarness(opts: CdpHarnessOptions): Promise<CdpHarnessResult>;
