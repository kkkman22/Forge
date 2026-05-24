/**
 * Node PTY harness adapter — Tier 4 CLI verification via child_process.
 *
 * Uses `node:child_process.spawn` with pipes as the lowest-fidelity fallback.
 * Optionally uses `node-pty` if installed in user's project [R5.9].
 *
 * **Validates: Requirement R5.2, R5.9**
 */
export interface PtyHarnessOptions {
    targetCommand: string;
    inputScript?: string;
    timeout?: number;
}
export interface PtyHarnessResult {
    ok: boolean;
    reason?: string;
    stdout: string;
    stderr: string;
    exitCode: number | null;
}
export declare function runPtyHarness(opts: PtyHarnessOptions): Promise<PtyHarnessResult>;
