export type WorkflowTier = "light" | "standard" | "full";
export type WorkflowWorkNature = "feature" | "refactor" | "bugfix";
export type PolicyProfile = "solo" | "team" | "enterprise";

export type PhaseCommitBehavior = "never" | "on_success" | "phase_owned";

export interface WorkflowPhase {
  id: string;
  displayName: string;
  allowedTiers?: WorkflowTier[];
  requiredInputs: string[];
  producesArtifacts: string[];
  commitBehavior: PhaseCommitBehavior;
  terminal?: boolean;
}

export interface WorkflowTransition {
  from: string;
  to: string;
  successCondition: string;
  failureCondition: string;
  recoveryRoute: string;
  allowRecoveryLoop?: boolean;
}

export type GateStrength = "optional" | "basic" | "required" | "full" | "approval_artifact";

export interface PolicyGateRequirement {
  review?: GateStrength;
  test?: GateStrength;
  evidenceArtifacts?: GateStrength;
  mutation?: GateStrength;
  forceSkip?: GateStrength;
}

export interface WorkflowProfile {
  id: string;
  tier: WorkflowTier;
  workNature: WorkflowWorkNature;
  routerPhases: string[];
  schedulerPhases: string[];
  policyGates: Partial<Record<PolicyProfile, Partial<Record<string, PolicyGateRequirement>>>>;
}

export interface WorkflowGraph {
  schemaVersion: 1;
  phases: WorkflowPhase[];
  transitions: WorkflowTransition[];
  profiles: WorkflowProfile[];
}

export interface WorkflowRoutingSsotEntry {
  key: WorkflowTier;
  tier: string;
  tier_zh: string;
  condition: string;
  condition_zh: string;
  sequence: string[];
}

export interface WorkflowDiagnostic {
  code:
    | "DUPLICATE_PHASE_ID"
    | "MISSING_TRANSITION_SOURCE"
    | "MISSING_TRANSITION_TARGET"
    | "DISALLOWED_CYCLE"
    | "PROFILE_WITHOUT_TERMINAL"
    | "PROFILE_UNKNOWN_PHASE";
  message: string;
  path: string;
}

const DEFAULT_POLICY_GATES: Record<
  PolicyProfile,
  Partial<Record<string, PolicyGateRequirement>>
> = {
  solo: {
    ship: {
      review: "basic",
      test: "required",
      evidenceArtifacts: "optional",
      mutation: "optional",
      forceSkip: "basic",
    },
  },
  team: {
    ship: {
      review: "required",
      test: "required",
      evidenceArtifacts: "required",
      mutation: "optional",
      forceSkip: "required",
    },
  },
  enterprise: {
    ship: {
      review: "full",
      test: "required",
      evidenceArtifacts: "required",
      mutation: "required",
      forceSkip: "approval_artifact",
    },
  },
};

export const DEFAULT_WORKFLOW_GRAPH: WorkflowGraph = {
  schemaVersion: 1,
  phases: [
    {
      id: "decide",
      displayName: "Decide",
      allowedTiers: ["full"],
      requiredInputs: ["task_description"],
      producesArtifacts: ["decision"],
      commitBehavior: "never",
    },
    {
      id: "spec",
      displayName: "Spec",
      allowedTiers: ["full"],
      requiredInputs: ["decision"],
      producesArtifacts: ["requirements", "design", "tasks"],
      commitBehavior: "phase_owned",
    },
    {
      id: "plan",
      displayName: "Plan",
      allowedTiers: ["standard", "full"],
      requiredInputs: ["spec"],
      producesArtifacts: ["plan"],
      commitBehavior: "phase_owned",
    },
    {
      id: "build",
      displayName: "Build",
      allowedTiers: ["light", "standard", "full"],
      requiredInputs: ["plan_or_task"],
      producesArtifacts: ["code", "tests", "progress"],
      commitBehavior: "phase_owned",
    },
    {
      id: "build-light",
      displayName: "Build Light",
      allowedTiers: ["light"],
      requiredInputs: ["task_description"],
      producesArtifacts: ["code", "tests"],
      commitBehavior: "phase_owned",
    },
    {
      id: "review",
      displayName: "Review",
      allowedTiers: ["light", "standard", "full"],
      requiredInputs: ["diff"],
      producesArtifacts: ["review"],
      commitBehavior: "never",
      terminal: true,
    },
    {
      id: "test",
      displayName: "Test",
      allowedTiers: ["standard", "full"],
      requiredInputs: ["review"],
      producesArtifacts: ["test"],
      commitBehavior: "never",
    },
    {
      id: "ship",
      displayName: "Ship",
      allowedTiers: ["standard", "full"],
      requiredInputs: ["review", "test"],
      producesArtifacts: ["ship_gate"],
      commitBehavior: "on_success",
      terminal: true,
    },
    {
      id: "learn",
      displayName: "Learn",
      allowedTiers: ["full"],
      requiredInputs: ["ship"],
      producesArtifacts: ["knowledge"],
      commitBehavior: "phase_owned",
      terminal: true,
    },
    {
      id: "refactor-scan",
      displayName: "Refactor Scan",
      allowedTiers: ["standard", "full"],
      requiredInputs: ["task_description"],
      producesArtifacts: ["scan"],
      commitBehavior: "never",
    },
    {
      id: "refactor-apply",
      displayName: "Refactor Apply",
      allowedTiers: ["light", "standard", "full"],
      requiredInputs: ["scan_or_task"],
      producesArtifacts: ["code", "tests"],
      commitBehavior: "phase_owned",
    },
    {
      id: "fix-analyze",
      displayName: "Fix Analyze",
      allowedTiers: ["standard", "full"],
      requiredInputs: ["failure"],
      producesArtifacts: ["analysis"],
      commitBehavior: "never",
    },
    {
      id: "fix-apply",
      displayName: "Fix Apply",
      allowedTiers: ["light", "standard", "full"],
      requiredInputs: ["analysis_or_failure"],
      producesArtifacts: ["code", "tests"],
      commitBehavior: "phase_owned",
    },
  ],
  transitions: [
    transition("decide", "spec"),
    transition("spec", "plan"),
    transition("plan", "build"),
    transition("build", "review"),
    transition("build-light", "review"),
    transition("review", "test"),
    transition("test", "ship"),
    transition("ship", "learn"),
    transition("refactor-scan", "refactor-apply"),
    transition("refactor-apply", "review"),
    transition("fix-analyze", "fix-apply"),
    transition("fix-apply", "review"),
    transition("review", "build", true),
  ],
  profiles: [
    profile("light", "light", "feature", ["build", "review"], ["build-light", "review"]),
    profile(
      "standard",
      "standard",
      "feature",
      ["plan", "build", "review", "test", "ship"],
      ["plan", "build", "review", "test", "ship"],
    ),
    profile(
      "full",
      "full",
      "feature",
      ["decide", "spec", "plan", "build", "review", "test", "ship", "learn"],
      ["plan", "build", "review", "test", "ship", "learn"],
    ),
    profile(
      "refactor_light",
      "light",
      "refactor",
      ["build", "review"],
      ["refactor-apply", "review"],
    ),
    profile(
      "refactor_standard",
      "standard",
      "refactor",
      ["plan", "build", "review", "test", "ship"],
      ["refactor-scan", "refactor-apply", "review", "test", "ship"],
    ),
    profile("fix_light", "light", "bugfix", ["build", "review"], ["fix-apply", "review"]),
    profile(
      "fix_standard",
      "standard",
      "bugfix",
      ["plan", "build", "review", "test", "ship"],
      ["fix-analyze", "fix-apply", "review", "test", "ship"],
    ),
  ],
};

function transition(from: string, to: string, allowRecoveryLoop = false): WorkflowTransition {
  return {
    from,
    to,
    successCondition: "phase_success",
    failureCondition: "phase_failed",
    recoveryRoute: "debug",
    allowRecoveryLoop,
  };
}

function profile(
  id: string,
  tier: WorkflowTier,
  workNature: WorkflowWorkNature,
  routerPhases: string[],
  schedulerPhases: string[],
): WorkflowProfile {
  return {
    id,
    tier,
    workNature,
    routerPhases,
    schedulerPhases,
    policyGates: DEFAULT_POLICY_GATES,
  };
}

function schedulerProfileKey(tierOrKey: string): string {
  if (hasProfile(tierOrKey)) return tierOrKey;
  return "standard";
}

function routerProfileKey(tier: WorkflowTier, workNature: WorkflowWorkNature): string {
  if (workNature === "feature") return tier;
  if (workNature === "refactor") return tier === "light" ? "refactor_light" : "refactor_standard";
  return tier === "light" ? "fix_light" : "fix_standard";
}

function hasProfile(id: string): boolean {
  return DEFAULT_WORKFLOW_GRAPH.profiles.some((profile) => profile.id === id);
}

export function getRouterSequence(
  tier: WorkflowTier,
  workNature: WorkflowWorkNature = "feature",
): string[] {
  const key = routerProfileKey(tier, workNature);
  const profile = DEFAULT_WORKFLOW_GRAPH.profiles.find((candidate) => candidate.id === key);
  return [...(profile ?? DEFAULT_WORKFLOW_GRAPH.profiles[1]).routerPhases];
}

export function getSchedulerSequence(tierOrKey: string): string[] {
  const key = schedulerProfileKey(tierOrKey);
  const profile = DEFAULT_WORKFLOW_GRAPH.profiles.find((candidate) => candidate.id === key);
  return [...(profile ?? DEFAULT_WORKFLOW_GRAPH.profiles[1]).schedulerPhases];
}

export function getPolicyGateRequirements(
  policyProfile: PolicyProfile,
  phase: string,
  workflowProfileId = "standard",
): PolicyGateRequirement {
  const workflowProfile =
    DEFAULT_WORKFLOW_GRAPH.profiles.find((candidate) => candidate.id === workflowProfileId) ??
    DEFAULT_WORKFLOW_GRAPH.profiles[1];
  return { ...(workflowProfile.policyGates[policyProfile]?.[phase] ?? {}) };
}

export function validateWorkflowGraph(graph: WorkflowGraph): WorkflowDiagnostic[] {
  const diagnostics: WorkflowDiagnostic[] = [];
  const phaseCounts = new Map<string, number>();

  for (const phase of graph.phases) {
    phaseCounts.set(phase.id, (phaseCounts.get(phase.id) ?? 0) + 1);
  }

  for (const [phaseId, count] of phaseCounts) {
    if (count > 1) {
      diagnostics.push({
        code: "DUPLICATE_PHASE_ID",
        message: `Duplicate phase id: ${phaseId}`,
        path: `phases.${phaseId}`,
      });
    }
  }

  const phaseIds = new Set(graph.phases.map((phase) => phase.id));

  graph.transitions.forEach((edge, index) => {
    if (!phaseIds.has(edge.from)) {
      diagnostics.push({
        code: "MISSING_TRANSITION_SOURCE",
        message: `Transition source does not exist: ${edge.from}`,
        path: `transitions.${index}.from`,
      });
    }
    if (!phaseIds.has(edge.to)) {
      diagnostics.push({
        code: "MISSING_TRANSITION_TARGET",
        message: `Transition target does not exist: ${edge.to}`,
        path: `transitions.${index}.to`,
      });
    }
  });

  diagnostics.push(...findDisallowedCycles(graph, phaseIds));

  const terminalPhaseIds = new Set(
    graph.phases.filter((phase) => phase.terminal).map((phase) => phase.id),
  );
  graph.profiles.forEach((profile, index) => {
    const phaseList = [...profile.routerPhases, ...profile.schedulerPhases];
    for (const phaseId of phaseList) {
      if (!phaseIds.has(phaseId)) {
        diagnostics.push({
          code: "PROFILE_UNKNOWN_PHASE",
          message: `Profile ${profile.id} references unknown phase: ${phaseId}`,
          path: `profiles.${index}.${phaseId}`,
        });
      }
    }
    const lastRouterPhase = profile.routerPhases.at(-1);
    const lastSchedulerPhase = profile.schedulerPhases.at(-1);
    if (
      (lastRouterPhase === undefined || !terminalPhaseIds.has(lastRouterPhase)) &&
      (lastSchedulerPhase === undefined || !terminalPhaseIds.has(lastSchedulerPhase))
    ) {
      diagnostics.push({
        code: "PROFILE_WITHOUT_TERMINAL",
        message: `Profile ${profile.id} does not end in a terminal phase`,
        path: `profiles.${index}`,
      });
    }
  });

  return diagnostics;
}

function findDisallowedCycles(graph: WorkflowGraph, phaseIds: Set<string>): WorkflowDiagnostic[] {
  const adjacency = new Map<string, string[]>();
  for (const edge of graph.transitions) {
    if (edge.allowRecoveryLoop || !phaseIds.has(edge.from) || !phaseIds.has(edge.to)) {
      continue;
    }
    const next = adjacency.get(edge.from) ?? [];
    next.push(edge.to);
    adjacency.set(edge.from, next);
  }

  const diagnostics: WorkflowDiagnostic[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (node: string, path: string[]): void => {
    if (visiting.has(node)) {
      diagnostics.push({
        code: "DISALLOWED_CYCLE",
        message: `Disallowed workflow cycle: ${[...path, node].join(" -> ")}`,
        path: `transitions.${node}`,
      });
      return;
    }
    if (visited.has(node)) return;

    visiting.add(node);
    for (const next of adjacency.get(node) ?? []) {
      visit(next, [...path, node]);
    }
    visiting.delete(node);
    visited.add(node);
  };

  for (const phaseId of phaseIds) {
    visit(phaseId, []);
  }

  return diagnostics;
}

export function renderWorkflowSsot(graph: WorkflowGraph = DEFAULT_WORKFLOW_GRAPH): string {
  const lines = [
    "| Tier/Profile | Router Sequence | Scheduler Sequence |",
    "|---|---|---|",
    ...graph.profiles.map(
      (profile) =>
        `| ${profile.id} | ${profile.routerPhases.join(" -> ")} | ${profile.schedulerPhases.join(
          " -> ",
        )} |`,
    ),
  ];
  return `${lines.join("\n")}\n`;
}

export function getWorkflowRoutingSsot(
  graph: WorkflowGraph = DEFAULT_WORKFLOW_GRAPH,
): WorkflowRoutingSsotEntry[] {
  const labels: Record<WorkflowTier, Omit<WorkflowRoutingSsotEntry, "key" | "sequence">> = {
    light: {
      tier: "Light",
      tier_zh: "轻量路径",
      condition: "Files affected <= 1 and changes <= 20 lines",
      condition_zh: "影响文件 ≤ 1 且改动 ≤ 20 行",
    },
    standard: {
      tier: "Standard",
      tier_zh: "标准路径",
      condition: "Clear requirements or existing Spec",
      condition_zh: "需求明确或已有 Spec",
    },
    full: {
      tier: "Full",
      tier_zh: "全量路径",
      condition: "New service / new database / auth changes / unclear requirements",
      condition_zh: "新服务 / 新数据库 / 认证变更 / 需求模糊",
    },
  };
  const order: WorkflowTier[] = ["light", "standard", "full"];
  return order.map((key) => {
    const profile = graph.profiles.find(
      (candidate) => candidate.id === key && candidate.workNature === "feature",
    );
    return {
      key,
      ...labels[key],
      sequence: [...(profile?.routerPhases ?? getRouterSequence(key))],
    };
  });
}
