/**
 * P2 R2 real-consumer: governance surfaced via forge-status health snapshot.
 *
 * The capability-driven governance (deriveGovernance) was previously derived
 * but consumed by NO ONE — compact-safe still read the hardcoded 100K config
 * threshold, max_parallel_agents read config-store, worker isolation had no
 * caller. This test locks the integration point: buildHealthSnapshot() now
 * includes a `governance` field carrying the derived values, so forge-status
 * --json exposes capability-driven thresholds to agents/tools.
 *
 * Validates: requirement R2 (governance actually consumed, not dead code).
 */
import { describe, expect, it } from "vitest";
import { buildHealthSnapshot } from "../../src/doctor";
import { CLAUDE_CAPABILITIES, deriveGovernance } from "../../src/host";

describe("buildHealthSnapshot surfaces capability-driven governance", () => {
  it("snapshot.governance is present (not undefined)", () => {
    const snap = buildHealthSnapshot({ projectRoot: process.cwd(), currentHead: "HEAD" });
    expect(snap.governance).toBeDefined();
  });

  it("snapshot.governance matches deriveGovernance(CLAUDE_CAPABILITIES) under Claude host", () => {
    const snap = buildHealthSnapshot({ projectRoot: process.cwd(), currentHead: "HEAD" });
    const expected = deriveGovernance(CLAUDE_CAPABILITIES, {});
    expect(snap.governance?.contextBudget).toBe(expected.contextBudget);
    expect(snap.governance?.sliceThreshold).toBe(expected.sliceThreshold);
    expect(snap.governance?.maxParallelAgents).toBe(expected.maxParallelAgents);
    expect(snap.governance?.workerIsolation).toBe(expected.workerIsolation);
    expect(snap.governance?.decideDispatchMode).toBe(expected.decideDispatchMode);
  });

  it("snapshot.governance.contextBudget is the derived 160K (not hardcoded 100K)", () => {
    const snap = buildHealthSnapshot({ projectRoot: process.cwd(), currentHead: "HEAD" });
    // 0.8 × 200000 = 160000 — capability-derived, NOT the old hardcoded 100K.
    expect(snap.governance?.contextBudget).toBe(160000);
  });
});
