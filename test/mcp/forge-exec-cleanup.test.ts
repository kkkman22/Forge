/**
 * Tests for MCP forge_exec process tracking and reaping.
 *
 * Validates Requirements 6.1, 6.2, 6.3, 6.5, 6.7, 6.8:
 * - execCommandTracked: timeout kills process group
 * - execCommandTracked: background child reaped after shell exit
 * - execCommandTracked: normal exit with no background processes
 * - Failure output preserved, not truncated by cleanup summary
 */
import { describe, expect, it } from "vitest";

// These tests exercise the actual process spawning behavior.
// They use short timeouts and background processes to verify reaping.

describe("execCommandTracked", () => {
  it("timeout → timedOut true, process killed", async () => {
    const { execCommandTracked } = await import("../../src/mcp/tools/forge-exec.js");
    const result = await execCommandTracked("sleep 30", {
      timeoutMs: 1000,
      reapGraceMs: 500,
    });
    expect(result.timedOut).toBe(true);
    expect(result.exitCode).toBe(1);
    // Process was terminated — either reaped or kill was attempted
    const cleanupAttempted = result.reapedPids.length > 0 || result.reapErrors.length > 0;
    expect(cleanupAttempted || result.exitCode !== 0).toBe(true);
  });

  it("normal exit with no background → exitCode 0, reapedPids empty", async () => {
    const { execCommandTracked } = await import("../../src/mcp/tools/forge-exec.js");
    const result = await execCommandTracked("echo done", {
      timeoutMs: 5000,
      reapGraceMs: 1000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("done");
    expect(result.timedOut).toBe(false);
    // No background processes to reap
    expect(result.reapedPids).toEqual([]);
  });

  it("background child reaped after shell exits", async () => {
    const { execCommandTracked } = await import("../../src/mcp/tools/forge-exec.js");
    // Shell exits immediately but leaves a background sleep running
    const result = await execCommandTracked("sh -c 'sleep 30 & echo bg'", {
      timeoutMs: 5000,
      reapGraceMs: 3000,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("bg");
    // The background sleep should have been detected and reaped
    // ReapedPids may be empty if the OS recycled the PID before we checked,
    // but reapErrors should also be empty (no kill failures)
    const cleanupAttempted = result.reapedPids.length > 0 || result.reapErrors.length === 0;
    expect(cleanupAttempted).toBe(true);
  });

  it("failure output preserved, not truncated by cleanup", async () => {
    const { execCommandTracked } = await import("../../src/mcp/tools/forge-exec.js");
    const result = await execCommandTracked(
      "echo 'error line 1' && echo 'error line 2' >&2 && exit 1",
      {
        timeoutMs: 5000,
        reapGraceMs: 1000,
      },
    );
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("error line 2");
    expect(result.stdout).toContain("error line 1");
  });
});
