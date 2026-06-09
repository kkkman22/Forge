import { describe, expect, it } from "vitest";
import {
  DEFAULT_WORKFLOW_GRAPH,
  getPolicyGateRequirements,
  getRouterSequence,
  getSchedulerSequence,
  renderWorkflowSsot,
  validateWorkflowGraph,
  type WorkflowGraph,
} from "../src/workflow-graph.js";

describe("workflow graph DSL", () => {
  it("derives router command sequences from the graph", () => {
    expect(getRouterSequence("light")).toEqual(["build", "review"]);
    expect(getRouterSequence("standard")).toEqual(["plan", "build", "review", "test", "ship"]);
    expect(getRouterSequence("full")).toEqual([
      "decide",
      "spec",
      "plan",
      "build",
      "review",
      "test",
      "ship",
      "learn",
    ]);
  });

  it("derives scheduler command sequences from graph profiles", () => {
    expect(getSchedulerSequence("light")).toEqual(["build-light", "review"]);
    expect(getSchedulerSequence("standard")).toEqual(["plan", "build", "review", "test", "ship"]);
    expect(getSchedulerSequence("full")).toEqual([
      "plan",
      "build",
      "review",
      "test",
      "ship",
      "learn",
    ]);
    expect(getSchedulerSequence("refactor_standard")).toEqual([
      "refactor-scan",
      "refactor-apply",
      "review",
      "test",
      "ship",
    ]);
    expect(getSchedulerSequence("fix_standard")).toEqual([
      "fix-analyze",
      "fix-apply",
      "review",
      "test",
      "ship",
    ]);
  });

  it("falls back unknown legacy scheduler keys to the standard sequence", () => {
    expect(getSchedulerSequence("old-standardish")).toEqual([
      "plan",
      "build",
      "review",
      "test",
      "ship",
    ]);
  });

  it("validates duplicate phase ids, missing references, cycles, and terminal reachability", () => {
    const graph: WorkflowGraph = {
      schemaVersion: 1,
      phases: [
        {
          id: "plan",
          displayName: "Plan",
          requiredInputs: [],
          producesArtifacts: [],
          commitBehavior: "phase_owned",
        },
        {
          id: "plan",
          displayName: "Plan Duplicate",
          requiredInputs: [],
          producesArtifacts: [],
          commitBehavior: "phase_owned",
        },
        {
          id: "build",
          displayName: "Build",
          requiredInputs: [],
          producesArtifacts: [],
          commitBehavior: "phase_owned",
        },
      ],
      transitions: [
        {
          from: "plan",
          to: "build",
          successCondition: "ok",
          failureCondition: "fail",
          recoveryRoute: "debug",
        },
        {
          from: "plan",
          to: "missing",
          successCondition: "ok",
          failureCondition: "fail",
          recoveryRoute: "debug",
        },
        {
          from: "build",
          to: "plan",
          successCondition: "ok",
          failureCondition: "fail",
          recoveryRoute: "debug",
        },
      ],
      profiles: [
        {
          id: "broken",
          tier: "standard",
          workNature: "feature",
          routerPhases: ["plan", "build"],
          schedulerPhases: ["plan", "build"],
          policyGates: {},
        },
      ],
    };

    const diagnostics = validateWorkflowGraph(graph);
    expect(diagnostics.map((d) => d.code)).toEqual(
      expect.arrayContaining([
        "DUPLICATE_PHASE_ID",
        "MISSING_TRANSITION_TARGET",
        "DISALLOWED_CYCLE",
        "PROFILE_WITHOUT_TERMINAL",
      ]),
    );
  });

  it("encodes profile-specific gate requirements without changing default team behavior", () => {
    expect(getPolicyGateRequirements("solo", "ship")).toEqual(
      expect.objectContaining({ review: "basic", test: "required", mutation: "optional" }),
    );
    expect(getPolicyGateRequirements("team", "ship")).toEqual(
      expect.objectContaining({ review: "required", test: "required", mutation: "optional" }),
    );
    expect(getPolicyGateRequirements("enterprise", "ship")).toEqual(
      expect.objectContaining({
        review: "full",
        test: "required",
        evidenceArtifacts: "required",
        forceSkip: "approval_artifact",
      }),
    );
  });

  it("renders a deterministic workflow SSOT for docs", () => {
    const rendered = renderWorkflowSsot(DEFAULT_WORKFLOW_GRAPH);
    expect(rendered).toContain("| Tier/Profile | Router Sequence | Scheduler Sequence |");
    expect(rendered).toContain("| standard | plan -> build -> review -> test -> ship |");
    expect(rendered).toContain("| fix_standard |");
  });
});
