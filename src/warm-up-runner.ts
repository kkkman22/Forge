/**
 * WarmUpRunner — replaces the agent-sdk `startup()` warm-query by spawning
 * `claude --print --output-format stream-json --max-turns 1` with a tiny
 * prompt before the main loop. Triggers session creation, model cold-start,
 * and credentials validation in a one-turn subprocess that does NOT count
 * against the loop's `--max-tokens` budget (Requirement 9.3).
 *
 * Contract:
 *   - 9.1: invoked once before the main loop (caller responsibility)
 *   - 9.2: args contain `--print`, `--output-format=stream-json`,
 *          `--max-turns 1`; tiny prompt frame ≤ 8 chars
 *   - 9.3: writes `<runDir>/warm-up.json`; tokens.input/output baseline 0
 *          (warm-up consumption is NOT deducted from --max-tokens)
 *   - 9.4: non-zero exit / timeout → reject with original stderr; main loop
 *          MUST NOT proceed
 *   - 9.5: caller passes `skip: true` (from `--no-warmup` flag) → skipped
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 9
 *   - src/cli-subprocess-driver.ts (shared CliSpawnRequest type)
 */

import type { ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface CliSpawnRequest {
  cmd: string;
  args: string[];
  env: Record<string, string>;
  cwd?: string;
}

export interface WarmUpDeps {
  /** Run identifier — recorded in `warm-up.json`. */
  runId: string;
  /** Directory where `warm-up.json` is written (typically `.forge/runs/<runId>/`). */
  runDir: string;
  /** Spawn injection point — lets tests stub child_process. */
  spawn: (req: CliSpawnRequest) => ChildProcess;
  /** Skip warm-up entirely (driven by `--no-warmup` CLI flag). */
  skip?: boolean;
  /** Timeout in ms; defaults to 30_000 per Requirement 9.4. */
  timeoutMs?: number;
}

export interface WarmUpResult {
  skipped: boolean;
  exitCode: number;
  durationMs: number;
  /** Always false — warm-up tokens do not count toward main-loop budget. */
  deductFromBudget: false;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const TINY_PROMPT = "_";

export async function runWarmUp(deps: WarmUpDeps): Promise<WarmUpResult> {
  if (deps.skip) {
    return { skipped: true, exitCode: 0, durationMs: 0, deductFromBudget: false };
  }

  mkdirSync(deps.runDir, { recursive: true });
  const startedAt = Date.now();

  const args = [
    "--print",
    "--output-format=stream-json",
    "--input-format=stream-json",
    "--include-partial-messages",
    "--max-turns",
    "1",
  ];

  const child = deps.spawn({
    cmd: "claude",
    args,
    env: process.env as Record<string, string>,
  });

  let stderrBuf = "";
  child.stderr?.on?.("data", (chunk: Buffer | string) => {
    stderrBuf += typeof chunk === "string" ? chunk : chunk.toString("utf-8");
  });

  // Stream-json input frame: minimal user message.
  child.stdin?.write?.(
    `${JSON.stringify({ type: "user", message: { role: "user", content: TINY_PROMPT } })}\n`,
  );
  child.stdin?.end?.();

  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise<WarmUpResult>((resolve, reject) => {
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill?.("SIGTERM");
    }, timeoutMs);

    child.on("exit", (code: number | null) => {
      clearTimeout(timer);
      const exitCode = code ?? -1;
      const durationMs = Date.now() - startedAt;
      writeRecord(deps, {
        run_id: deps.runId,
        exit_code: exitCode,
        duration_ms: durationMs,
        timestamp: new Date().toISOString(),
        tokens: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 },
        stderr: stderrBuf,
        timed_out: timedOut,
      });

      if (timedOut) {
        reject(new Error(`warm-up timeout after ${timeoutMs}ms`));
        return;
      }
      if (exitCode !== 0) {
        reject(new Error(`warm-up failed (exit ${exitCode}): ${stderrBuf.trim()}`));
        return;
      }
      resolve({
        skipped: false,
        exitCode,
        durationMs,
        deductFromBudget: false,
      });
    });
  });
}

function writeRecord(deps: WarmUpDeps, record: Record<string, unknown>): void {
  writeFileSync(join(deps.runDir, "warm-up.json"), `${JSON.stringify(record, null, 2)}\n`);
}
