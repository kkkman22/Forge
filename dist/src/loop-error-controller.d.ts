/**
 * LoopErrorController — implements forge-loop subprocess error handling per
 * Requirement 10:
 *   - 10.1: stuck timeout (600s no stdout → SIGTERM, +30s → SIGKILL)
 *   - 10.2: exit code in {1,2,137,143} → exponential backoff retry ≤3 → abort.json
 *   - 10.3: other exit codes → immediate abort, no retry
 *   - 10.4: each retry emits IPC warning {code: "subprocess-retry", attempt}
 *   - 10.6: l0FailureSignatureCapture writes `l0_failure_signature` into
 *           abort.json so the dispatcher can downgrade L0 → L1
 *
 * AC 10.5 (cleanup-errors.jsonl) lives in the main-loop wrapper — this
 * controller only owns one iteration.
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 10
 *   - src/cli-subprocess-driver.ts (signal-chain helper for kill chain)
 */
import type { ChildProcess } from "node:child_process";
export declare const RETRY_EXIT_CODES: Set<number>;
export declare const DEFAULT_STUCK_TIMEOUT_MS = 600000;
export declare const DEFAULT_SIGKILL_DELAY_MS = 30000;
export declare const DEFAULT_BACKOFF_BASE_MS = 60000;
export declare const DEFAULT_MAX_RETRIES = 3;
export type ExitCodeClass = "success" | "retry" | "abort";
export declare function classifyExitCode(code: number): ExitCodeClass;
export interface CliSpawnRequest {
    cmd: string;
    args: string[];
    env: Record<string, string>;
    cwd?: string;
}
export interface IpcWarningFrame {
    code: string;
    message: string;
    attempt?: number;
    retryable?: boolean;
}
export interface IpcEmitterLike {
    warning: (frame: IpcWarningFrame) => void;
}
export interface LoopErrorControllerDeps {
    runId: string;
    runDir: string;
    /** Spawn the iteration subprocess (caller passes a closure with prepared args). */
    spawn: (req?: CliSpawnRequest) => ChildProcess;
    emitter: IpcEmitterLike;
    stuckTimeoutMs?: number;
    sigkillDelayMs?: number;
    maxRetries?: number;
    backoffBaseMs?: number;
    /** When true, write `l0_failure_signature` into abort.json (AC 10.6). */
    l0FailureSignatureCapture?: boolean;
}
export interface IterationOutcome {
    success: boolean;
    exitCode: number;
    attempts: number;
}
export declare function runIterationWithErrorControl(deps: LoopErrorControllerDeps): Promise<IterationOutcome>;
