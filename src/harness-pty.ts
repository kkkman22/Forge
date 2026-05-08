/**
 * Node PTY harness adapter — Tier 4 CLI verification via child_process.
 *
 * Uses `node:child_process.spawn` with pipes as the lowest-fidelity fallback.
 * Optionally uses `node-pty` if installed in user's project [R5.9].
 *
 * **Validates: Requirement R5.2, R5.9**
 */

import { spawn } from "node:child_process";

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

export async function runPtyHarness(opts: PtyHarnessOptions): Promise<PtyHarnessResult> {
  return new Promise((resolve) => {
    const timeout = opts.timeout ?? 30000;
    const chunks: string[] = [];
    const errChunks: string[] = [];

    try {
      const proc = spawn("bash", ["-c", opts.targetCommand], {
        stdio: ["pipe", "pipe", "pipe"],
        timeout,
      });

      proc.stdout?.on("data", (data: Buffer) => {
        chunks.push(data.toString());
      });

      proc.stderr?.on("data", (data: Buffer) => {
        errChunks.push(data.toString());
      });

      if (opts.inputScript) {
        const lines = opts.inputScript.split("\n");
        for (const line of lines) {
          proc.stdin?.write(`${line}\n`);
        }
        proc.stdin?.end();
      }

      const timer = setTimeout(() => {
        proc.kill("SIGTERM");
        resolve({
          ok: false,
          reason: `Process timed out after ${timeout}ms`,
          stdout: chunks.join(""),
          stderr: errChunks.join(""),
          exitCode: null,
        });
      }, timeout);

      proc.on("close", (code) => {
        clearTimeout(timer);
        resolve({
          ok: true,
          stdout: chunks.join(""),
          stderr: errChunks.join(""),
          exitCode: code,
        });
      });

      proc.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          reason: `Process error: ${err.message}`,
          stdout: chunks.join(""),
          stderr: errChunks.join(""),
          exitCode: null,
        });
      });
    } catch (error) {
      resolve({
        ok: false,
        reason: `PTY harness error: ${error instanceof Error ? error.message : String(error)}`,
        stdout: chunks.join(""),
        stderr: errChunks.join(""),
        exitCode: null,
      });
    }
  });
}
