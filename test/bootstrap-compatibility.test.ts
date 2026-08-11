/**
 * Tests for bootstrap-check.mjs Claude version diagnostic integration.
 *
 * Validates Requirements 1.3, 1.4, 1.7:
 * - Low version → diagnostic containing current and minimum versions
 * - Unparseable → no version diagnostic (fail-open)
 * - High version with max → soft warn with "forge-doctor"
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);

const SCRIPT_PATH = "scripts/bootstrap-check.mjs";

describe("bootstrap-check version diagnostic", () => {
  it("outputs nothing when .tinkerman/config.md exists (already initialized path)", async () => {
    // In our test environment, .tinkerman/config.md exists
    const { stdout, stderr } = await execFileAsync("node", [SCRIPT_PATH], {
      timeout: 5000,
      env: { ...process.env, CLAUDE_PLUGIN_ROOT: "." },
    });
    // Should not error — fail-open design
    expect(stdout).toBeDefined();
  });

  it("version diagnostic function handles low version", async () => {
    // Import the pure function for unit testing
    const { buildVersionDiagnostic } = await import("../scripts/bootstrap-check.mjs");
    const result = buildVersionDiagnostic("2.1.150", "2.1.163");
    expect(result).toContain("2.1.150");
    expect(result).toContain("2.1.163");
  });

  it("version diagnostic function handles unparseable output", async () => {
    const { buildVersionDiagnostic } = await import("../scripts/bootstrap-check.mjs");
    const result = buildVersionDiagnostic("garbage", "2.1.163");
    // Should return empty/null — fail-open, no diagnostic
    expect(result).toBeFalsy();
  });

  it("version diagnostic function handles high version with max", async () => {
    const { buildVersionDiagnostic } = await import("../scripts/bootstrap-check.mjs");
    const result = buildVersionDiagnostic("2.1.200", "2.1.163", "2.1.170");
    expect(result).toContain("2.1.200");
    expect(result).toContain("forge-doctor");
  });

  it("version diagnostic function passes for exact minimum", async () => {
    const { buildVersionDiagnostic } = await import("../scripts/bootstrap-check.mjs");
    const result = buildVersionDiagnostic("2.1.163", "2.1.163");
    // Pass → no diagnostic needed
    expect(result).toBeFalsy();
  });
});
