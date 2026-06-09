/**
 * Tests for forge-doctor script.
 *
 * Validates Requirements 1.5, 3.1–3.8:
 * - --help exits 0 and mentions version/plugin/MCP
 * - --json output is valid JSON with version block
 * - Each check item has id, status, message, and optional fixHint
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const DOCTOR = ".claude-plugin/bin/forge-doctor";

describe("forge-doctor", () => {
  it("--help exits 0 and mentions version, plugin, MCP", async () => {
    const { stdout } = await execFileAsync("bash", [DOCTOR, "--help"], { timeout: 5000 });
    expect(stdout).toContain("version");
    expect(stdout).toContain("plugin");
    expect(stdout).toContain("MCP");
  });

  it("--json output is valid JSON with version block", async () => {
    const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], { timeout: 10000 });
    // Extract JSON line (last line that starts with {)
    const lines = stdout.split("\n");
    const jsonLine = lines.find((l) => l.trim().startsWith("{") && l.includes('"version"'));
    expect(jsonLine).toBeDefined();
    const parsed = JSON.parse(jsonLine!);

    // Version block
    expect(parsed.version).toBeDefined();
    expect(parsed.version.minimumVersion).toBe("2.1.163");
    expect(parsed.version.verdict).toBeDefined();
    expect(["pass", "warn", "fail", "unknown"]).toContain(parsed.version.verdict);

    // Checks array
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.checks.length).toBeGreaterThan(0);

    // Each check has required fields
    for (const item of parsed.checks) {
      expect(item.id).toBeDefined();
      expect(item.status).toMatch(/^(pass|warn|fail)$/);
      expect(item.message).toBeDefined();
    }

    // Summary
    expect(parsed.summary).toBeDefined();
    expect(typeof parsed.summary.pass).toBe("number");
    expect(typeof parsed.summary.warn).toBe("number");
    expect(typeof parsed.summary.fail).toBe("number");

    expect(parsed.diagnosticMode).toBeDefined();
    expect(typeof parsed.diagnosticMode.active).toBe("boolean");
  });

  it("check items include all expected categories", async () => {
    const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], { timeout: 10000 });
    const lines = stdout.split("\n");
    const jsonLine = lines.find((l) => l.trim().startsWith("{") && l.includes('"version"'));
    const parsed = JSON.parse(jsonLine!);
    const ids = parsed.checks.map((c: { id: string }) => c.id);

    // Required check categories
    expect(ids).toContain("version");
    expect(ids).toContain("manifest");
    expect(ids).toContain("hooks");
    expect(ids).toContain("mcp");
    expect(ids).toContain("plugin-enabled");
  });

  it("warn items include fixHint", async () => {
    const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], { timeout: 10000 });
    const lines = stdout.split("\n");
    const jsonLine = lines.find((l) => l.trim().startsWith("{") && l.includes('"version"'));
    const parsed = JSON.parse(jsonLine!);
    const warns = parsed.checks.filter((c: { status: string }) => c.status === "warn");
    for (const w of warns) {
      expect(w.fixHint).toBeDefined();
      expect(w.fixHint.length).toBeGreaterThan(0);
    }
  });
});
