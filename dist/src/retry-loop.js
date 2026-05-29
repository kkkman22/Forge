// ---------------------------------------------------------------------------
// Retry Loop — runMainLoopWithRetry, abort.json, IPC warnings, SIGINT
// ---------------------------------------------------------------------------
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { classifyExitCode, computeBackoffDelay } from "./error-handler.js";
function writeAbortJson(runDir, abort) {
    writeFileSync(join(runDir, "abort.json"), JSON.stringify(abort, null, 2), "utf-8");
}
export async function runMainLoopWithRetry(opts) {
    const maxRetries = opts.maxRetries ?? 3;
    const failures = [];
    let attempt = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        attempt++;
        const result = await opts.driver.run(opts.prompt, opts.cwd);
        if (result.exitCode === 0)
            return;
        failures.push({
            exit_code: result.exitCode,
            timestamp: new Date().toISOString(),
        });
        const classification = classifyExitCode(result.exitCode);
        // Non-retryable: fatal exit, stop immediately
        if (!classification.retryable) {
            writeAbortJson(opts.runDir, {
                final_exit_code: result.exitCode,
                attempts_made: attempt,
                failures,
                abort_reason: "fatal_exit_code",
            });
            return;
        }
        // Check if we've exhausted retries
        if (attempt > maxRetries) {
            writeAbortJson(opts.runDir, {
                final_exit_code: result.exitCode,
                attempts_made: attempt,
                failures,
                abort_reason: "max_retries_exhausted",
            });
            return;
        }
        // Retryable and retries remain — backoff
        const delay = computeBackoffDelay(attempt);
        opts.ipcEmitter?.emitWarning({ code: "subprocess-retry", attempt });
        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                process.removeListener("SIGINT", onSigint);
                resolve();
            }, delay);
            const onSigint = () => {
                clearTimeout(timer);
                writeAbortJson(opts.runDir, {
                    final_exit_code: result.exitCode,
                    attempts_made: attempt,
                    failures,
                    abort_reason: "user_interrupt",
                });
                reject(new Error("User interrupt (SIGINT) during retry backoff"));
            };
            process.once("SIGINT", onSigint);
        });
    }
}
//# sourceMappingURL=retry-loop.js.map