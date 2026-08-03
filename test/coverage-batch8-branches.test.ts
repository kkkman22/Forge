import { describe, expect, it } from "vitest";
import { type ForgeHealthSnapshot, renderStatusSummary } from "../src/doctor.js";

function baseSnapshot(overrides: Record<string, unknown> = {}): ForgeHealthSnapshot {
  const base: Record<string, unknown> = {
    task: { id: "topic-a", tier: "standard", phase: "build" },
    policyProfile: "team",
    branch: { status: "pass", message: "on feature branch" },
    worktree: { status: "pass", message: "main worktree" },
    spec: { status: "pass", message: "spec locked" },
    plan: { status: "pass", message: "plan approved" },
    progress: { status: "pass", message: "2/5 done", total: 5, completed: 2 },
    freshness: {
      review: { status: "pass", message: "fresh" },
      test: { status: "pass", message: "fresh" },
    },
    shipGate: { status: "pass", message: "all gates passed" },
    distSync: { status: "unknown", message: "skipped" },
    docsDrift: { status: "unknown", message: "skipped" },
    runtimeSync: { status: "pass", message: "all assets present" },
    toolHealth: { status: "pass", message: "healthy" },
    safetyGuards: {
      destructiveGuard: { status: "pass", message: "on" },
      spawnPolicy: { status: "pass", message: "active" },
      maxSubagentDepth: { status: "pass", message: "5" },
      knowledgeQuota: { status: "pass", message: "0/20" },
    },
    gates: {},
    artifacts: {},
    governance: {
      contextBudget: 160000,
      sliceThreshold: 144000,
      workerIsolation: "required",
      maxParallelAgents: 6,
      decideDispatchMode: "auto",
      reasoningEffort: undefined,
    },
    nextStep: { phase: "review", allowed: true, reasons: [] },
    generatedAt: "2026-06-14T00:00:00.000Z",
  };
  return { ...base, ...overrides } as unknown as ForgeHealthSnapshot;
}

describe("renderStatusSummary (branch coverage)", () => {
  it("renders a passing snapshot with next step allowed", () => {
    const out = renderStatusSummary(baseSnapshot());
    expect(out).toContain("Task: topic-a");
    expect(out).toContain("Phase: build");
    expect(out).toContain("Tier: standard");
    expect(out).toContain("Profile: team");
    expect(out).toContain("Next: review allowed");
  });
  it("renders blocked next step with reasons", () => {
    const out = renderStatusSummary(
      baseSnapshot({
        nextStep: {
          phase: null,
          allowed: false,
          reasons: [
            { code: "MISSING_ARTIFACT", source: ".forge/reviews/x.md", detail: "review missing" },
            { code: "STATUS_UNKNOWN", source: ".forge/status.md", detail: "no status" },
          ],
        },
      }),
    );
    expect(out).toContain("(none)");
    expect(out).toContain("blocked");
    expect(out).toContain("MISSING_ARTIFACT");
    expect(out).toContain("STATUS_UNKNOWN");
  });
  it("renders unknown tier/phase when task lacks them", () => {
    const out = renderStatusSummary(baseSnapshot({ task: { id: "x" } }));
    expect(out).toContain("Phase: unknown");
    expect(out).toContain("Tier: unknown");
  });
  it("renders enterprise profile", () => {
    expect(renderStatusSummary(baseSnapshot({ policyProfile: "enterprise" }))).toContain(
      "Profile: enterprise",
    );
  });
  it("renders solo profile", () => {
    expect(renderStatusSummary(baseSnapshot({ policyProfile: "solo" }))).toContain("Profile: solo");
  });
  it("renders fail branch status", () => {
    expect(
      renderStatusSummary(baseSnapshot({ branch: { status: "fail", message: "on main" } })),
    ).toContain("on main");
  });
  it("renders warn worktree status", () => {
    expect(
      renderStatusSummary(baseSnapshot({ worktree: { status: "warn", message: "multiple wt" } })),
    ).toContain("multiple wt");
  });
});
