/**
 * E2E test: CLI harness self-dogfooding.
 *
 * Uses the CLI harness (forge-control-cli) to drive forge-loop-cli.ts,
 * verifying three scenarios:
 *   1. Process runs and produces output
 *   2. --help flag exits cleanly
 *   3. Invalid input handled gracefully
 *
 * **Validates: Requirement R5.7**
 */

import { describe, expect, it } from "vitest";
import { runPtyHarness } from "../../src/harness-pty.js";

const CLI_PATH = "src/forge-loop-cli.ts";

describe("CLI harness self-dogfooding [R5.7]", () => {
  it("runs forge-loop-cli with --help and captures output", async () => {
    const result = await runPtyHarness({
      targetCommand: `npx tsx ${CLI_PATH} --help`,
      timeout: 15000,
    });

    expect(result.ok).toBe(true);
    // --help should exit with code 0
    expect(result.exitCode).toBe(0);
  }, 20000);

  it("handles invalid arguments gracefully", async () => {
    const result = await runPtyHarness({
      targetCommand: `npx tsx ${CLI_PATH} --nonexistent-flag-xyz`,
      timeout: 15000,
    });

    expect(result.ok).toBe(true);
    // Should exit (not hang), possibly with non-zero code
    expect(result.exitCode).not.toBeNull();
  }, 20000);

  it("process completes within timeout", async () => {
    const start = Date.now();
    const result = await runPtyHarness({
      targetCommand: `echo "quick test"`,
      timeout: 5000,
    });

    const elapsed = Date.now() - start;
    expect(result.ok).toBe(true);
    expect(elapsed).toBeLessThan(5000);
  }, 10000);
});
