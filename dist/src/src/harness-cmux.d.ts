/**
 * cmux harness adapter — Tier 2 CLI verification via cmux.
 *
 * Sends commands through cmux socket/CLI. Returns graceful failure
 * when cmux is not available.
 *
 * **Validates: Requirement R5.2, R5.4**
 */
export interface CmuxHarnessOptions {
    targetCommand: string;
    inputScript?: string;
}
export interface CmuxHarnessResult {
    ok: boolean;
    reason?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
}
export declare function runCmuxHarness(_opts: CmuxHarnessOptions): Promise<CmuxHarnessResult>;
