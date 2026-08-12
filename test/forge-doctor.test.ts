/**
 * Tests for forge-doctor script.
 *
 * Validates Requirements 1.5, 3.1–3.8:
 * - --json output is valid JSON with version block
 * - Each check item has id, status, message, and optional fixHint
 */

import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const DOCTOR = ".claude-plugin/bin/tinkerman-doctor";
const STATUS = ".claude-plugin/bin/tinkerman-status";
const tempRoots: string[] = [];

function tempForgeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-status-bin-test-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".tinkerman"), { recursive: true });
  writeFileSync(
    join(root, ".tinkerman", "status.md"),
    ["---", 'tier: "standard"', 'phase: "test"', 'current_task: "test-task"', "---", ""].join("\n"),
    "utf-8",
  );
  writeFileSync(
    join(root, ".tinkerman", "config.md"),
    ["---", 'policy_profile: "enterprise"', "---", ""].join("\n"),
    "utf-8",
  );
  return root;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("forge-doctor", () => {
  it("--help exits 0 and mentions version", async () => {
    const { stdout } = await execFileAsync("bash", [DOCTOR, "--help"], { timeout: 5000 });
    expect(stdout).toContain("version");
    expect(stdout).toContain("plugin");
  });
});

it("--json output is valid JSON with version block", async () => {
  const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], { timeout: 20000 });
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
}, 30000);

it("check items include all expected categories", async () => {
  const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], { timeout: 20000 });
  const lines = stdout.split("\n");
  const jsonLine = lines.find((l) => l.trim().startsWith("{") && l.includes('"version"'));
  const parsed = JSON.parse(jsonLine!);
  const ids = parsed.checks.map((c: { id: string }) => c.id);

  // Required check categories
  expect(ids).toContain("version");
  expect(ids).toContain("manifest");
  expect(ids).toContain("hooks");
  expect(ids).toContain("plugin-enabled");
});

it("warn items include fixHint", async () => {
  const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], { timeout: 20000 });
  const lines = stdout.split("\n");
  const jsonLine = lines.find((l) => l.trim().startsWith("{") && l.includes('"version"'));
  const parsed = JSON.parse(jsonLine!);
  const warns = parsed.checks.filter((c: { status: string }) => c.status === "warn");
  for (const w of warns) {
    expect(w.fixHint).toBeDefined();
    expect(w.fixHint.length).toBeGreaterThan(0);
  }
});

it("--json includes shared health snapshot when Forge status exists", async () => {
  const root = tempForgeRoot();
  const { stdout } = await execFileAsync("bash", [DOCTOR, "--json"], {
    timeout: 10000,
    env: { ...process.env, FORGE_ROOT: root },
  }).catch((err: { stdout: string }) => ({ stdout: err.stdout }));
  const lines = stdout.split("\n");
  const jsonLine = lines.find((l) => l.trim().startsWith("{") && l.includes('"version"'));
  const parsed = JSON.parse(jsonLine!);

  expect(parsed.health.policyProfile).toBe("enterprise");
  expect(parsed.health.nextStep).toMatchObject({
    phase: "ship",
    edge: "test -> ship",
    allowed: false,
  });
});

describe("forge-status", () => {
  it("--json uses the shared health snapshot model", async () => {
    const root = tempForgeRoot();
    const { stdout } = await execFileAsync("bash", [STATUS, "--json"], {
      timeout: 10000,
      env: { ...process.env, FORGE_ROOT: root },
    });

    const parsed = JSON.parse(stdout);

    expect(parsed.task.phase).toBe("test");
    expect(parsed.policyProfile).toBe("enterprise");
    expect(parsed.nextStep).toMatchObject({
      phase: "ship",
      allowed: false,
      edge: "test -> ship",
    });
    expect(parsed.nextStep.reasons.map((r: { code: string }) => r.code)).toContain(
      "MISSING_ARTIFACT",
    );
  });

  it("text output includes profile and next-step explanation", async () => {
    const root = tempForgeRoot();
    const { stdout } = await execFileAsync("bash", [STATUS], {
      timeout: 10000,
      env: { ...process.env, FORGE_ROOT: root },
    });

    expect(stdout).toContain("Profile: enterprise");
    expect(stdout).toContain("Next: ship blocked");
    expect(stdout).toContain("MISSING_ARTIFACT");
  });
});
