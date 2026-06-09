import { readFileSync } from "node:fs";
import path from "node:path";
import { type PolicyProfile, parsePolicyProfileConfig } from "./config.js";
import {
  type EvidenceArtifactKind,
  isArtifactFreshForCommit,
  queryEvidenceArtifacts,
} from "./evidence-artifact.js";
import { extractStringField, parseFrontmatter } from "./frontmatter.js";
import { getPolicyGateRequirements, getRouterSequence } from "./workflow-graph.js";

export type HealthStatus = "pass" | "warn" | "fail" | "unknown";

export interface HealthReason {
  code:
    | "STATUS_UNKNOWN"
    | "NO_NEXT_PHASE"
    | "MISSING_ARTIFACT"
    | "STALE_ARTIFACT"
    | "FAILING_ARTIFACT";
  source: string;
  detail: string;
}

export interface HealthCheck {
  status: HealthStatus;
  message: string;
  source?: string;
}

export interface ForgeHealthSnapshot {
  task: {
    id: string;
    tier?: string;
    phase?: string;
  };
  policyProfile: PolicyProfile;
  gates: Record<string, HealthCheck>;
  artifacts: Partial<Record<EvidenceArtifactKind, string>>;
  nextStep: {
    phase: string | null;
    allowed: boolean;
    edge?: string;
    reasons: HealthReason[];
  };
  generatedAt: string;
}

export interface BuildHealthSnapshotOptions {
  projectRoot: string;
  currentHead: string;
  generatedAt?: string;
}

export function buildHealthSnapshot(options: BuildHealthSnapshotOptions): ForgeHealthSnapshot {
  const forgeRoot = path.join(options.projectRoot, ".forge");
  const status = readStatus(forgeRoot);
  const policyProfile = readPolicyProfile(forgeRoot);
  const reasons: HealthReason[] = [];
  const gates: Record<string, HealthCheck> = {};

  if (!status) {
    gates.status = {
      status: "unknown",
      message: "No .forge/status.md found",
      source: ".forge/status.md",
    };
    reasons.push({
      code: "STATUS_UNKNOWN",
      source: ".forge/status.md",
      detail: "current task status is missing",
    });
    return {
      task: { id: "unknown" },
      policyProfile,
      gates,
      artifacts: {},
      nextStep: { phase: null, allowed: false, reasons },
      generatedAt: options.generatedAt ?? new Date().toISOString(),
    };
  }

  gates.status = {
    status: "pass",
    message: `Status loaded for ${status.currentTask}`,
    source: ".forge/status.md",
  };

  const sequence = getRouterSequence(status.tier);
  const currentIndex = sequence.indexOf(status.phase);
  const nextPhase =
    currentIndex >= 0 && currentIndex + 1 < sequence.length ? sequence[currentIndex + 1] : null;

  if (nextPhase === null) {
    reasons.push({
      code: "NO_NEXT_PHASE",
      source: "workflow-graph",
      detail: `phase ${status.phase} has no next phase in ${status.tier} workflow`,
    });
  }

  const artifacts = latestArtifactIds(options.projectRoot, status.currentTask);
  if (nextPhase === "ship") {
    reasons.push(
      ...artifactGateReasons({
        projectRoot: options.projectRoot,
        topic: status.currentTask,
        currentHead: options.currentHead,
        policyProfile,
      }),
    );
  }

  return {
    task: {
      id: status.currentTask,
      tier: status.tier,
      phase: status.phase,
    },
    policyProfile,
    gates,
    artifacts,
    nextStep: {
      phase: nextPhase,
      allowed: reasons.length === 0 && nextPhase !== null,
      edge: nextPhase ? `${status.phase} -> ${nextPhase}` : undefined,
      reasons,
    },
    generatedAt: options.generatedAt ?? new Date().toISOString(),
  };
}

export function renderStatusSummary(snapshot: ForgeHealthSnapshot): string {
  const next = snapshot.nextStep.phase ?? "(none)";
  const state = snapshot.nextStep.allowed ? "allowed" : "blocked";
  const lines = [
    `Task: ${snapshot.task.id}`,
    `Phase: ${snapshot.task.phase ?? "unknown"}`,
    `Tier: ${snapshot.task.tier ?? "unknown"}`,
    `Profile: ${snapshot.policyProfile}`,
    `Next: ${next} ${state}`,
  ];

  for (const reason of snapshot.nextStep.reasons) {
    lines.push(`- ${reason.code}: ${reason.detail} (${reason.source})`);
  }

  return `${lines.join("\n")}\n`;
}

interface ParsedStatus {
  currentTask: string;
  tier: "light" | "standard" | "full";
  phase: string;
}

function readStatus(forgeRoot: string): ParsedStatus | null {
  let content: string;
  try {
    content = readFileSync(path.join(forgeRoot, "status.md"), "utf-8");
  } catch (_err: unknown) {
    return null;
  }

  const parsed = parseFrontmatter(content);
  const raw = parsed?.raw ?? "";
  const currentTask = extractStringField(raw, "current_task");
  const tier = extractStringField(raw, "tier");
  const phase = extractStringField(raw, "phase");
  if (!currentTask || !phase) return null;
  return {
    currentTask,
    tier: tier === "light" || tier === "full" ? tier : "standard",
    phase,
  };
}

function readPolicyProfile(forgeRoot: string): PolicyProfile {
  try {
    return parsePolicyProfileConfig(readFileSync(path.join(forgeRoot, "config.md"), "utf-8"))
      .policy_profile;
  } catch (_err: unknown) {
    return "team";
  }
}

function latestArtifactIds(
  projectRoot: string,
  topic: string,
): Partial<Record<EvidenceArtifactKind, string>> {
  const result: Partial<Record<EvidenceArtifactKind, string>> = {};
  for (const artifact of queryEvidenceArtifacts(projectRoot, { topic })) {
    result[artifact.kind] ??= artifact.artifact_id;
  }
  return result;
}

function artifactGateReasons(input: {
  projectRoot: string;
  topic: string;
  currentHead: string;
  policyProfile: PolicyProfile;
}): HealthReason[] {
  const gates = getPolicyGateRequirements(input.policyProfile, "ship");
  const requiredKinds: EvidenceArtifactKind[] = [];
  if (gates.review === "basic" || gates.review === "required" || gates.review === "full") {
    requiredKinds.push("review");
  }
  if (gates.test === "required" || gates.test === "full") {
    requiredKinds.push("test");
  }
  if (gates.mutation === "required" || gates.mutation === "full") {
    requiredKinds.push("mutation");
  }

  const reasons: HealthReason[] = [];
  for (const kind of requiredKinds) {
    const latest = queryEvidenceArtifacts(input.projectRoot, {
      topic: input.topic,
      kind,
    })[0];

    if (!latest) {
      reasons.push({
        code: "MISSING_ARTIFACT",
        source: ".forge/artifacts",
        detail: `required ${kind} artifact is missing`,
      });
      continue;
    }

    if (latest.result !== "pass") {
      reasons.push({
        code: "FAILING_ARTIFACT",
        source: ".forge/artifacts",
        detail: `latest ${kind} artifact result is ${latest.result}`,
      });
    }

    const freshness = isArtifactFreshForCommit(latest, input.currentHead);
    if (!freshness.fresh) {
      reasons.push({
        code: "STALE_ARTIFACT",
        source: ".forge/artifacts",
        detail: freshness.reason,
      });
    }
  }

  return reasons;
}
