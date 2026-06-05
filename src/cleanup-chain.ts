import type { ChildProcess } from "node:child_process";
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export interface CleanupContext {
  runId: string;
  runDir: string;
  child?: ChildProcess;
  pidFile?: string;
  worktreePath?: string;
  worktreeCleanupAction?: "remove" | "keep";
  sleepProcess?: ChildProcess;
  lockFile?: string;
}

export async function runCleanupChain(ctx: CleanupContext): Promise<void> {
  const errors: Array<{ step: string; error: string; timestamp: string }> = [];
  const now = () => new Date().toISOString();

  // Step 1: subprocess
  try {
    if (ctx.child && !ctx.child.killed) {
      ctx.child.kill("SIGTERM");
    }
  } catch (e) {
    errors.push({ step: "subprocess", error: String(e), timestamp: now() });
  }

  // Step 2: PID file
  try {
    if (ctx.pidFile && existsSync(ctx.pidFile)) {
      unlinkSync(ctx.pidFile);
    }
  } catch (e) {
    errors.push({ step: "pid_file", error: String(e), timestamp: now() });
  }

  // Step 3: worktree
  try {
    if (ctx.worktreePath && ctx.worktreeCleanupAction === "remove") {
      execFileSync("git", ["worktree", "remove", ctx.worktreePath], {
        stdio: "pipe",
      });
    }
  } catch (e) {
    errors.push({ step: "worktree", error: String(e), timestamp: now() });
  }

  // Step 4: sleep_prevent
  try {
    if (ctx.sleepProcess && !ctx.sleepProcess.killed) {
      ctx.sleepProcess.kill();
    }
  } catch (e) {
    errors.push({ step: "sleep_prevent", error: String(e), timestamp: now() });
  }

  // Step 5: lock files
  try {
    if (ctx.lockFile && existsSync(ctx.lockFile)) {
      unlinkSync(ctx.lockFile);
    }
  } catch (e) {
    errors.push({ step: "lock", error: String(e), timestamp: now() });
  }

  // Write cleanup-errors.jsonl
  for (const err of errors) {
    try {
      appendFileSync(join(ctx.runDir, "cleanup-errors.jsonl"), `${JSON.stringify(err)}\n`, "utf-8");
    } catch (_err: unknown) {
      // Silently swallow — we cannot log errors about error-logging
    }
  }
}
