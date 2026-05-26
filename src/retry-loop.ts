// ---------------------------------------------------------------------------
// Retry Loop — runMainLoopWithRetry, abort.json, IPC warnings, SIGINT
// ---------------------------------------------------------------------------

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  classifyExitCode,
  computeBackoffDelay,
} from "./error-handler.js";

export interface RetryLoopOpts {
  driver: { run(prompt: string, cwd: string): Promise<{ exitCode: number }> };
  prompt: string;
  cwd: string;
  runDir: string;
  maxRetries?: number; // default 3
  ipcEmitter?: { emitWarning(opts: { code: string; attempt: number }): void };
}

export interface AbortJson {
  final_exit_code: number;
  attempts_made: number;
  failures: Array<{ exit_code: number; timestamp: string }>;
  abort_reason: "max_retries_exhausted" | "fatal_exit_code" | "user_interrupt";
}

function writeAbortJson(runDir: string, abort: AbortJson): void {
  writeFileSync(join(runDir, "abort.json"), JSON.stringify(abort, null, 2), "utf-8");
}

export async function runMainLoopWithRetry(opts: RetryLoopOpts): Promise<void> {
  const maxRetries = opts.maxRetries ?? 3;
  const failures: AbortJson["failures"] = [];
  let attempt = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt++;
    const result = await opts.driver.run(opts.prompt, opts.cwd);

    if (result.exitCode === 0) return;

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

    await new Promise<void>((resolve, reject) => {
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
