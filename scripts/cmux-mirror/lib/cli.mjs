import { execFile } from "node:child_process";
import { markUnavailable } from "./availability.mjs";

const DEFAULT_TIMEOUT_MS = 5000;

/**
 * Run a cmux CLI command (R1.4, R11.2).
 * Returns null on EPIPE/ECONNREFUSED/ENOENT (triggers markUnavailable).
 */
export function runCli(args, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  return new Promise((resolve) => {
    execFile(
      "cmux",
      args,
      { timeout: timeoutMs },
      (err, stdout, stderr) => {
        if (err) {
          const msg = (err.message ?? "").toLowerCase();
          if (
            err.code === "ENOENT" ||
            msg.includes("epipe") ||
            msg.includes("econnrefused") ||
            msg.includes("broken pipe") ||
            msg.includes("refused") ||
            (typeof stderr === "string" &&
              (stderr.includes("refused") || stderr.includes("broken pipe")))
          ) {
            markUnavailable(err.code ?? msg.slice(0, 40));
            resolve(null);
            return;
          }
          resolve({ exitCode: err.code ?? 1, stdout: stdout ?? "", stderr: stderr ?? "" });
          return;
        }
        resolve({ exitCode: 0, stdout, stderr });
      },
    );
  });
}
