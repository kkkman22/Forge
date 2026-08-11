/**
 * Unit tests for SafetyGuardsHealth in doctor.ts (T-09).
 *
 * Covers the cc-2-1-18x safety-hardening guard surface as reported by
 * `forge doctor`:
 *   R1 destructive_guard — warns when explicitly off (AC5)
 *   R2 spawn-policy — always-on module status
 *   R3 max_subagent_depth — reports configured value (AC2)
 *   R4 knowledge-quota — solutions count vs near-limit threshold (AC1)
 *
 * **Validates: Requirements R1 AC5, R3 AC2, R4 AC1**
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildHealthSnapshot, buildSafetyGuardsHealth } from "../src/doctor.js";

const tempRoots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "forge-safety-guard-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".tinkerman"), { recursive: true });
  return root;
}

function writeConfig(root: string, body: string): void {
  writeFileSync(join(root, ".tinkerman", "config.md"), `---\n${body}\n---\n`, "utf-8");
}

/** Create the sandbox-active marker so the destructive guard is considered active. */
function enableSandbox(root: string): void {
  writeFileSync(join(root, ".tinkerman", ".sandbox-active.json"), "{}", "utf-8");
}

function writeSolutions(root: string, count: number): void {
  const dir = join(root, ".tinkerman", "knowledge", "solutions");
  mkdirSync(dir, { recursive: true });
  for (let i = 0; i < count; i++) {
    writeFileSync(join(dir, `sol-${i}.md`), `# sol ${i}\n`, "utf-8");
  }
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("buildSafetyGuardsHealth — R1 destructive_guard", () => {
  it("passes when guard is on (default) and sandbox active", () => {
    const root = tempRoot();
    writeConfig(root, "project: X");
    enableSandbox(root);
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.destructiveGuard.status).toBe("pass");
    expect(guards.destructiveGuard.message).toContain("on");
  });

  it("fails with P1 warning when explicitly off (AC5)", () => {
    const root = tempRoot();
    writeConfig(root, "destructive_guard: off");
    enableSandbox(root);
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.destructiveGuard.status).toBe("fail");
    expect(guards.destructiveGuard.message).toContain("OFF");
  });

  it("reports unknown when sandbox not active (guard inactive, P1-1)", () => {
    const root = tempRoot();
    writeConfig(root, "project: X");
    // no .sandbox-active.json
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.destructiveGuard.status).toBe("unknown");
    expect(guards.destructiveGuard.message).toContain("inactive");
  });

  it("passes when explicitly on and sandbox active", () => {
    const root = tempRoot();
    writeConfig(root, "destructive_guard: on");
    enableSandbox(root);
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.destructiveGuard.status).toBe("pass");
  });
});

describe("buildSafetyGuardsHealth — R2 spawn-policy", () => {
  it("reports active status", () => {
    const root = tempRoot();
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.spawnPolicy.status).toBe("pass");
    expect(guards.spawnPolicy.message).toContain("spawn");
  });
});

describe("buildSafetyGuardsHealth — R3 max_subagent_depth", () => {
  it("reports configured value within range", () => {
    const root = tempRoot();
    writeConfig(root, "max_subagent_depth: 7");
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.maxSubagentDepth.message).toContain("7");
  });

  it("falls back to default 5 when absent", () => {
    const root = tempRoot();
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.maxSubagentDepth.message).toContain("5");
  });

  it("reports unknown when out of range", () => {
    const root = tempRoot();
    writeConfig(root, "max_subagent_depth: 99");
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.maxSubagentDepth.status).toBe("unknown");
  });
});

describe("buildSafetyGuardsHealth — R4 knowledge-quota", () => {
  it("passes below near-limit threshold", () => {
    const root = tempRoot();
    writeConfig(root, "knowledge_limit: 20");
    writeSolutions(root, 10);
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.knowledgeQuota.status).toBe("pass");
    expect(guards.knowledgeQuota.message).toContain("10/20");
  });

  it("fails at near-limit threshold (AC1, 90%)", () => {
    const root = tempRoot();
    writeConfig(root, "knowledge_limit: 20");
    writeSolutions(root, 18);
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.knowledgeQuota.status).toBe("fail");
    expect(guards.knowledgeQuota.message).toContain("18/20");
  });

  it("handles missing solutions dir as count 0", () => {
    const root = tempRoot();
    const guards = buildSafetyGuardsHealth(root);
    expect(guards.knowledgeQuota.status).toBe("pass");
    expect(guards.knowledgeQuota.message).toContain("0/20");
  });
});

describe("buildHealthSnapshot — safetyGuards wired into snapshot", () => {
  it("snapshot includes safetyGuards with all four sub-checks", () => {
    const root = tempRoot();
    writeConfig(root, "project: X");
    const snap = buildHealthSnapshot({ projectRoot: root, currentHead: "abc" });
    expect(snap.safetyGuards).toBeDefined();
    expect(snap.safetyGuards.destructiveGuard).toBeDefined();
    expect(snap.safetyGuards.spawnPolicy).toBeDefined();
    expect(snap.safetyGuards.maxSubagentDepth).toBeDefined();
    expect(snap.safetyGuards.knowledgeQuota).toBeDefined();
  });
});
