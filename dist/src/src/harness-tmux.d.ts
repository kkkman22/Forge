/**
 * tmux harness adapter — Tier 3 CLI verification via tmux.
 *
 * Creates a tmux session, runs the target command, and captures output.
 * Falls back gracefully when tmux is not available.
 *
 * **Validates: Requirement R5.2**
 */
export interface TmuxHarnessOptions {
    targetCommand: string;
    inputScript?: string;
    timeout?: number;
}
export interface TmuxHarnessResult {
    ok: boolean;
    reason?: string;
    stdout?: string;
    stderr?: string;
    exitCode?: number;
}
export declare function runTmuxHarness(opts: TmuxHarnessOptions): TmuxHarnessResult;
