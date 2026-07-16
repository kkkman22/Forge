/**
 * tmux harness adapter — Tier 3 CLI verification via tmux.
 *
 * Creates a tmux session, runs the target command, and captures output.
 * Falls back gracefully when tmux is not available.
 *
 * **Validates: Requirement R5.2**
 */

import { execFileSync, spawnSync } from "node:child_process";
import { isComplexCommand } from "./destructive-guard.js";

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

export function runTmuxHarness(opts: TmuxHarnessOptions): TmuxHarnessResult {
  try {
    // Audit P1-1 (2026-07-16): the targetCommand is spliced into `bash -c`
    // below. Reject shell metacharacters / command substitution up front so a
    // command like `echo hi; rm -rf ~` can never reach the shell. This harness
    // is currently dead code (runCliHarness has no production wiring), but
    // guarding now ensures re-wiring can't activate a latent injection surface
    // (SR-2: defense should not be concentrated on one execution face).
    if (isComplexCommand(opts.targetCommand)) {
      return {
        ok: false,
        reason: `refused: targetCommand contains shell metacharacters/operators (injection guard): "${opts.targetCommand}"`,
      };
    }

    // Check if tmux is available
    try {
      execFileSync("which", ["tmux"], { encoding: "utf-8", timeout: 3000 });
    } catch (_err: unknown) {
      return { ok: false, reason: "tmux not found on system" };
    }

    const sessionId = `forge-harness-${Date.now()}`;
    const timeout = opts.timeout ?? 30000;

    // Create new detached session and run command
    const result = spawnSync(
      "tmux",
      [
        "new-session",
        "-d",
        "-s",
        sessionId,
        "-x",
        "200",
        "-y",
        "50",
        "--",
        "bash",
        "-c",
        `${opts.targetCommand}; echo EXIT_CODE:$?`,
      ],
      {
        encoding: "utf-8",
        timeout,
      },
    );

    if (result.error) {
      cleanupSession(sessionId);
      return {
        ok: false,
        reason: `tmux session creation failed: ${result.error.message}`,
      };
    }

    // Wait briefly for command to complete
    const _waitResult = spawnSync("tmux", ["wait-for", `-S ${sessionId}-done`], {
      encoding: "utf-8",
      timeout: Math.min(timeout, 5000),
    });

    // Capture pane output
    const captureResult = spawnSync(
      "tmux",
      ["capture-pane", "-t", sessionId, "-p", "-S", "-1000"],
      { encoding: "utf-8", timeout: 5000 },
    );

    cleanupSession(sessionId);

    const output = captureResult.stdout || "";
    const exitMatch = output.match(/EXIT_CODE:(\d+)/);
    const exitCode = exitMatch ? Number.parseInt(exitMatch[1], 10) : 1;

    return {
      ok: true,
      stdout: output,
      exitCode,
    };
  } catch (error) {
    return {
      ok: false,
      reason: `tmux harness error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function cleanupSession(sessionId: string): void {
  try {
    spawnSync("tmux", ["kill-session", "-t", sessionId], {
      encoding: "utf-8",
      timeout: 3000,
    });
  } catch (_err: unknown) {
    // Best-effort cleanup
  }
}
