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
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
export const RETRY_EXIT_CODES = new Set([1, 2, 137, 143]);
export const DEFAULT_STUCK_TIMEOUT_MS = 600_000;
export const DEFAULT_SIGKILL_DELAY_MS = 30_000;
export const DEFAULT_BACKOFF_BASE_MS = 60_000;
export const DEFAULT_MAX_RETRIES = 3;
export function classifyExitCode(code) {
    if (code === 0)
        return "success";
    if (RETRY_EXIT_CODES.has(code))
        return "retry";
    return "abort";
}
export async function runIterationWithErrorControl(deps) {
    mkdirSync(deps.runDir, { recursive: true });
    const stuckTimeoutMs = deps.stuckTimeoutMs ?? DEFAULT_STUCK_TIMEOUT_MS;
    const sigkillDelayMs = deps.sigkillDelayMs ?? DEFAULT_SIGKILL_DELAY_MS;
    const maxRetries = deps.maxRetries ?? DEFAULT_MAX_RETRIES;
    const backoffBaseMs = deps.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    let attempt = 0;
    while (true) {
        let outcome;
        try {
            outcome = await runOnce(deps, stuckTimeoutMs, sigkillDelayMs);
        }
        catch (err) {
            // child.on("error") fired (e.g. ENOENT). No exit code; map as crash.
            attempt++;
            writeAbort(deps, -1, attempt, "subprocess_crash");
            throw err instanceof Error
                ? err
                : new Error(`loop-error-controller spawn error: ${String(err)}`);
        }
        attempt++;
        const code = outcome.exitCode;
        const cls = classifyExitCode(code);
        if (cls === "success") {
            return { success: true, exitCode: code, attempts: attempt };
        }
        // Stuck timer firing always tags 'stuck_timeout', regardless of subsequent
        // exit code (forced-exit 137/143 from our own SIGKILL still means stuck).
        if (outcome.stuckTimerFired) {
            writeAbort(deps, code, attempt, "stuck_timeout");
            throw new Error(`loop-error-controller abort: stuck timeout (last exit ${code})`);
        }
        if (cls === "abort") {
            writeAbort(deps, code, attempt, "subprocess_crash");
            throw new Error(`loop-error-controller abort: non-retry exit code ${code} after ${attempt} attempt(s)`);
        }
        // cls === "retry"
        if (attempt > maxRetries) {
            writeAbort(deps, code, attempt, "retry_exhausted");
            throw new Error(`loop-error-controller abort: exhausted ${maxRetries} retries (last exit ${code})`);
        }
        // Emit warning frame, then exponential backoff.
        deps.emitter.warning({
            code: "subprocess-retry",
            message: `subprocess exited ${code}, retrying (${attempt}/${maxRetries})`,
            attempt,
            retryable: true,
        });
        const backoff = backoffBaseMs * 2 ** (attempt - 1);
        await sleep(backoff);
    }
}
async function runOnce(deps, stuckTimeoutMs, sigkillDelayMs) {
    const child = deps.spawn();
    let stuckTimer = null;
    let killTimer = null;
    let stuckTimerFired = false;
    const armStuckTimer = () => {
        if (stuckTimer)
            clearTimeout(stuckTimer);
        stuckTimer = setTimeout(() => {
            stuckTimerFired = true;
            child.kill?.("SIGTERM");
            killTimer = setTimeout(() => {
                child.kill?.("SIGKILL");
            }, sigkillDelayMs);
        }, stuckTimeoutMs);
    };
    child.stdout?.on?.("data", () => {
        armStuckTimer();
    });
    armStuckTimer();
    return new Promise((resolve, reject) => {
        let settled = false;
        child.on("exit", (code) => {
            if (settled)
                return;
            settled = true;
            if (stuckTimer)
                clearTimeout(stuckTimer);
            if (killTimer)
                clearTimeout(killTimer);
            resolve({ exitCode: code ?? -1, stuckTimerFired });
        });
        // Mirror Node spawn semantics: on ENOENT/EACCES the child emits 'error'
        // and never 'exit'. Reject so the outer loop can write abort.json and
        // propagate without hanging.
        child.on("error", (err) => {
            if (settled)
                return;
            settled = true;
            if (stuckTimer)
                clearTimeout(stuckTimer);
            if (killTimer)
                clearTimeout(killTimer);
            reject(err);
        });
    });
}
function writeAbort(deps, exitCode, attempts, signature) {
    const record = {
        run_id: deps.runId,
        last_exit_code: exitCode,
        attempts,
        timestamp: new Date().toISOString(),
    };
    if (deps.l0FailureSignatureCapture) {
        record.l0_failure_signature = signature;
    }
    writeFileSync(join(deps.runDir, "abort.json"), `${JSON.stringify(record, null, 2)}\n`);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
//# sourceMappingURL=loop-error-controller.js.map