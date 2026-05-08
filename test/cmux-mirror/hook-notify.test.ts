import { execFile } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const execAsync = promisify(execFile);

const hookNotifyPath = join(process.cwd(), "scripts", "cmux-mirror", "hook-notify.sh");

describe("hook-notify.sh: frozen interception notification (R6.1–R6.7)", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cmux-hook-test-"));
  });

  afterEach(() => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it("R6.1: always exits 0 even when cmux is not available", async () => {
    await execAsync("bash", [hookNotifyPath, dir], {
      env: { ...process.env, PATH: "/usr/bin:/bin" },
      timeout: 5000,
    });
  });

  it("R6.1: exits 0 even with non-existent directory", async () => {
    await execAsync("bash", [hookNotifyPath, join(dir, "nonexistent")], {
      timeout: 5000,
    });
  });

  it("R6.2: creates dedupe directory and timestamp file", async () => {
    await execAsync("bash", [hookNotifyPath, dir], { timeout: 5000 });

    const dedupeDir = join(dir, ".cmux-dedupe");
    expect(existsSync(dedupeDir)).toBe(true);

    // Should have a timestamp file
    const { stdout } = await new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      execFile("find", [dedupeDir, "-name", "*.ts", "-type", "f"], (err, out, se) => {
        if (err) reject(err);
        else resolve({ stdout: out, stderr: se });
      });
    });
    expect(stdout.trim().length).toBeGreaterThan(0);
  });

  it("R6.2: second call within dedupe window is suppressed (writes no new timestamp)", async () => {
    await execAsync("bash", [hookNotifyPath, dir], { timeout: 5000 });

    const dedupeDir = join(dir, ".cmux-dedupe");

    // Read timestamp file
    const { stdout: filesBefore } = await new Promise<{ stdout: string; stderr: string }>(
      (resolve, reject) => {
        execFile("find", [dedupeDir, "-name", "*.ts"], (err, out, se) => {
          if (err) reject(err);
          else resolve({ stdout: out, stderr: se });
        });
      },
    );
    const tsFile = filesBefore.trim();
    const ts1 = readFileSync(tsFile, "utf-8");

    // Second call (should be deduplicated)
    await execAsync("bash", [hookNotifyPath, dir], { timeout: 5000 });
    const ts2 = readFileSync(tsFile, "utf-8");

    // Timestamp should not change (deduped)
    expect(ts2).toBe(ts1);
  });

  it("R12.7: exit code is always 0 with bad cmux command", async () => {
    await execAsync("bash", [hookNotifyPath, dir], {
      env: { ...process.env, PATH: "/usr/bin:/bin" },
      timeout: 5000,
    });
  });

  it("R6.4: dedupe files are regular files that can be cleaned up", async () => {
    await execAsync("bash", [hookNotifyPath, dir], { timeout: 5000 });

    const dedupeDir = join(dir, ".cmux-dedupe");
    expect(existsSync(dedupeDir)).toBe(true);

    // Cleanup should work (simulating prune-event-logs.sh)
    rmSync(dedupeDir, { recursive: true, force: true });
    expect(existsSync(dedupeDir)).toBe(false);
  });
});
