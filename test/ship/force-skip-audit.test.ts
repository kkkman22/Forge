import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const TEST_DIR = join(tmpdir(), `forge-force-skip-test-${randomUUID()}`);

describe("checkShipGateWithForceSkip audit coupling", () => {
  let checkShipGateWithForceSkip: typeof import("../../src/ship.js").checkShipGateWithForceSkip;

  beforeAll(async () => {
    const mod = await import("../../src/ship.js");
    checkShipGateWithForceSkip = mod.checkShipGateWithForceSkip;
  });

  beforeEach(() => {
    mkdirSync(join(TEST_DIR, ".forge", "findings"), { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("writes audit file when forceSkip is true with context", () => {
    const result = checkShipGateWithForceSkip(
      { passed: true, p0Count: 0, p1Count: 0, methodology: "subagent-parallel" as const },
      { passed: true },
      { completedTasks: 5, totalTasks: 5 },
      { forceSkipReview: true, forceSkipReason: "emergency CI down" },
      { cwd: TEST_DIR, commitHash: "abc123", user: "test-user" },
    );

    expect(result.allowed).toBe(true);
    expect(result.forceSkipped).toBe(true);

    const today = new Date().toISOString().slice(0, 10);
    const auditFile = join(TEST_DIR, ".forge", "findings", `force-skip-review-${today}.md`);
    expect(existsSync(auditFile)).toBe(true);

    const content = readFileSync(auditFile, "utf-8");
    expect(content).toContain("abc123");
    expect(content).toContain("test-user");
    expect(content).toContain("emergency CI down");
  });

  it("still returns allowed=true without context (backward compat)", () => {
    const result = checkShipGateWithForceSkip(
      { passed: true, p0Count: 0, p1Count: 0, methodology: "subagent-parallel" as const },
      { passed: true },
      { completedTasks: 5, totalTasks: 5 },
      { forceSkipReview: true, forceSkipReason: "no context" },
    );

    expect(result.allowed).toBe(true);
    expect(result.forceSkipped).toBe(true);
    expect(result.reasons).toContain("SKIPPED-BY-FORCE: no context");
  });

  it("adds warning when audit write fails", () => {
    const result = checkShipGateWithForceSkip(
      { passed: true, p0Count: 0, p1Count: 0, methodology: "subagent-parallel" as const },
      { passed: true },
      { completedTasks: 5, totalTasks: 5 },
      { forceSkipReview: true, forceSkipReason: "test" },
      { cwd: "/nonexistent/path/that/does/not/exist", commitHash: "abc", user: "test" },
    );

    expect(result.allowed).toBe(true);
    expect(result.forceSkipped).toBe(true);
    expect(result.reasons.some((r: string) => r.includes("audit") || r.includes("Audit"))).toBe(
      true,
    );
  });
});
