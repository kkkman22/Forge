import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
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

export interface ProgressHealthCheck extends HealthCheck {
  total: number;
  completed: number;
}

export interface ForgeHealthSnapshot {
  task: {
    id: string;
    tier?: string;
    phase?: string;
  };
  policyProfile: PolicyProfile;
  branch: HealthCheck;
  worktree: HealthCheck;
  spec: HealthCheck;
  plan: HealthCheck;
  progress: ProgressHealthCheck;
  freshness: {
    review: HealthCheck;
    test: HealthCheck;
  };
  shipGate: HealthCheck;
  distSync: HealthCheck;
  docsDrift: HealthCheck;
  runtimeSync: HealthCheck;
  toolHealth: HealthCheck;
  safetyGuards: SafetyGuardsHealth;
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
  const unknownTaskChecks = buildTaskScopedChecks(
    options.projectRoot,
    "unknown",
    options.currentHead,
  );

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
      branch: readBranchHealth(options.projectRoot),
      worktree: readWorktreeHealth(options.projectRoot),
      ...unknownTaskChecks,
      safetyGuards: buildSafetyGuardsHealth(options.projectRoot),
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
  const taskScopedChecks = buildTaskScopedChecks(
    options.projectRoot,
    status.currentTask,
    options.currentHead,
  );
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
    branch: readBranchHealth(options.projectRoot),
    worktree: readWorktreeHealth(options.projectRoot),
    ...taskScopedChecks,
    safetyGuards: buildSafetyGuardsHealth(options.projectRoot),
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
    `Branch: ${snapshot.branch.message}`,
    `Worktree: ${snapshot.worktree.message}`,
    `Next: ${next} ${state}`,
    `DestructiveGuard: ${snapshot.safetyGuards.destructiveGuard.message}`,
    `SpawnPolicy: ${snapshot.safetyGuards.spawnPolicy.message}`,
    `MaxSubagentDepth: ${snapshot.safetyGuards.maxSubagentDepth.message}`,
    `KnowledgeQuota: ${snapshot.safetyGuards.knowledgeQuota.message}`,
  ];

  for (const reason of snapshot.nextStep.reasons) {
    lines.push(`- ${reason.code}: ${reason.detail} (${reason.source})`);
  }

  return `${lines.join("\n")}\n`;
}

function buildTaskScopedChecks(
  projectRoot: string,
  topic: string,
  currentHead: string,
): Pick<
  ForgeHealthSnapshot,
  | "spec"
  | "plan"
  | "progress"
  | "freshness"
  | "shipGate"
  | "distSync"
  | "docsDrift"
  | "runtimeSync"
  | "toolHealth"
> {
  return {
    spec: readSpecHealth(projectRoot, topic),
    plan: readPlanHealth(projectRoot, topic),
    progress: readProgressHealth(projectRoot, topic),
    freshness: {
      review: artifactFreshnessHealth(projectRoot, topic, "review", currentHead),
      test: artifactFreshnessHealth(projectRoot, topic, "test", currentHead),
    },
    shipGate: artifactStateHealth(projectRoot, topic, "ship_gate", currentHead),
    distSync: skippedCheck(
      "dist-sync state skipped by default; run typed forge_dist_sync for full check",
      "typed-capability:forge_dist_sync",
    ),
    docsDrift: skippedCheck(
      "docs drift state skipped by default; run typed forge_docs_drift for full check",
      "typed-capability:forge_docs_drift",
    ),
    runtimeSync: readRuntimeSyncHealth(projectRoot),
    toolHealth: readToolHealth(projectRoot),
  };
}

function readBranchHealth(projectRoot: string): HealthCheck {
  const branch = readGit(projectRoot, ["branch", "--show-current"]);
  if (branch === null || branch.length === 0) {
    return {
      status: "unknown",
      message: "Git branch unavailable",
      source: "git branch --show-current",
    };
  }
  return {
    status: branch === "main" || branch === "master" ? "warn" : "pass",
    message: branch,
    source: "git branch --show-current",
  };
}

function readWorktreeHealth(projectRoot: string): HealthCheck {
  const porcelain = readGit(projectRoot, ["status", "--porcelain"]);
  if (porcelain === null) {
    return {
      status: "unknown",
      message: "Git worktree state unavailable",
      source: "git status --porcelain",
    };
  }
  if (porcelain.trim().length === 0) {
    return {
      status: "pass",
      message: "Worktree clean",
      source: "git status --porcelain",
    };
  }
  const changeCount = porcelain.split(/\r?\n/).filter((line) => line.trim()).length;
  return {
    status: "warn",
    message: `Worktree has ${changeCount} change(s)`,
    source: "git status --porcelain",
  };
}

function readSpecHealth(projectRoot: string, topic: string): HealthCheck {
  const paths = [
    path.join(projectRoot, ".forge", "specs", topic, "requirements.md"),
    path.join(projectRoot, ".forge", "specs", topic, "spec.md"),
  ];
  const found = paths.find((candidate) => existsSync(candidate));
  if (!found) {
    return {
      status: "unknown",
      message: "Spec status unknown",
      source: `.forge/specs/${topic}`,
    };
  }
  const status = readStatusField(found);
  return {
    status: status === "locked" ? "pass" : status ? "warn" : "unknown",
    message: status ? `Spec status is ${status}` : "Spec status missing",
    source: relativeProjectPath(projectRoot, found),
  };
}

function readPlanHealth(projectRoot: string, topic: string): HealthCheck {
  const candidates = [
    path.join(projectRoot, ".forge", "plans", `${topic}.md`),
    path.join(projectRoot, ".forge", "plan", `${topic}.md`),
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  if (!found) {
    return {
      status: "unknown",
      message: "Plan status unknown",
      source: `.forge/plans/${topic}.md`,
    };
  }
  const status = readStatusField(found);
  return {
    status: status === "approved" ? "pass" : status ? "warn" : "unknown",
    message: status ? `Plan status is ${status}` : "Plan status missing",
    source: relativeProjectPath(projectRoot, found),
  };
}

function readProgressHealth(projectRoot: string, topic: string): ProgressHealthCheck {
  const source = `.forge/progress/${topic}.md`;
  const filePath = path.join(projectRoot, source);
  if (!existsSync(filePath)) {
    return {
      status: "unknown",
      message: "Progress file missing",
      source,
      total: 0,
      completed: 0,
    };
  }
  const content = readFileSync(filePath, "utf-8");
  const total = (content.match(/- \[[ xX]\]/g) ?? []).length;
  const completed = (content.match(/- \[[xX]\]/g) ?? []).length;
  return {
    status: total === 0 ? "unknown" : completed === total ? "pass" : "warn",
    message:
      total === 0 ? "Progress has no checklist" : `${completed}/${total} progress items complete`,
    source,
    total,
    completed,
  };
}

function artifactFreshnessHealth(
  projectRoot: string,
  topic: string,
  kind: EvidenceArtifactKind,
  currentHead: string,
): HealthCheck {
  const latest = queryEvidenceArtifacts(projectRoot, { topic, kind })[0];
  if (!latest) {
    return {
      status: "unknown",
      message: `No ${kind} artifact found`,
      source: ".forge/artifacts",
    };
  }
  if (latest.result !== "pass") {
    return {
      status: "fail",
      message: `Latest ${kind} artifact result is ${latest.result}`,
      source: artifactSource(latest.artifact_id),
    };
  }
  const freshness = isArtifactFreshForCommit(latest, currentHead);
  return {
    status: freshness.fresh ? "pass" : "fail",
    message: freshness.reason,
    source: artifactSource(latest.artifact_id),
  };
}

function artifactStateHealth(
  projectRoot: string,
  topic: string,
  kind: EvidenceArtifactKind,
  currentHead: string,
): HealthCheck {
  const latest = queryEvidenceArtifacts(projectRoot, { topic, kind })[0];
  if (!latest) {
    return {
      status: "unknown",
      message: `No ${kind} artifact found`,
      source: ".forge/artifacts",
    };
  }
  if (latest.result !== "pass") {
    return {
      status: "fail",
      message: `Latest ${kind} artifact result is ${latest.result}`,
      source: artifactSource(latest.artifact_id),
    };
  }
  const freshness = isArtifactFreshForCommit(latest, currentHead);
  return {
    status: freshness.fresh ? "pass" : "fail",
    message: freshness.reason,
    source: artifactSource(latest.artifact_id),
  };
}

function readToolHealth(projectRoot: string): HealthCheck {
  // The event log (.log) is the true "is tooling running" signal — it's
  // appended on every prune/CI-scan. The tracked .md holds only the stable
  // summary + skip-trace counters, whose presence proves nothing about liveness.
  const source = path.join(projectRoot, ".forge", "knowledge", "tool-health.log");
  if (!existsSync(source)) {
    return {
      status: "unknown",
      message: "Tool health log not yet generated",
      source: ".forge/knowledge/tool-health.log",
    };
  }
  return {
    status: "pass",
    message: "Tool health log present",
    source: ".forge/knowledge/tool-health.log",
  };
}

function skippedCheck(message: string, source: string): HealthCheck {
  return {
    status: "unknown",
    message,
    source,
  };
}

/**
 * Safety-guard health for the cc-2-1-18x safety-hardening layer (R1-R4).
 *
 * Surfaces four guards so operators can see their state in `forge doctor`:
 *   - destructiveGuard: config `destructive_guard` (warns when explicitly off)
 *   - spawnPolicy: whether the spawn-time policy module is wired
 *   - maxSubagentDepth: configured depth cap
 *   - knowledgeQuota: current solutions count vs the near-limit threshold
 *
 * Reads config.md frontmatter + counts `.forge/knowledge/solutions/*.md`.
 * Env-only channels (FORGE_ROLLBACK_IN_PROGRESS etc.) are runtime signals,
 * not persisted state, so they are not reported here.
 *
 * **Validates: Requirement R1 AC5, R3 AC2, R4 AC1**
 */
export interface SafetyGuardsHealth {
  destructiveGuard: HealthCheck;
  spawnPolicy: HealthCheck;
  maxSubagentDepth: HealthCheck;
  knowledgeQuota: HealthCheck;
}

/** Match `key: value` in YAML frontmatter body text (lenient, like resolveMaxSubagentDepth). */
function readConfigScalar(content: string, key: string): string | null {
  const match = content.match(new RegExp(`^\\s*${key}:\\s*(\\S+)`, "m"));
  return match ? match[1] : null;
}

export function buildSafetyGuardsHealth(projectRoot: string): SafetyGuardsHealth {
  const forgeRoot = path.join(projectRoot, ".forge");
  const configPath = path.join(forgeRoot, "config.md");
  let configContent = "";
  try {
    configContent = readFileSync(configPath, "utf-8");
  } catch {
    configContent = "";
  }

  // R1 destructive_guard — default on; warn when explicitly off (AC5).
  // Also surface whether the guard is actually active (sandbox mode) and
  // whether bypass env tokens are set without matching nonce files (P0-3/P1-1).
  const guardVal = readConfigScalar(configContent, "destructive_guard");
  const sandboxActive = existsSync(path.join(forgeRoot, ".sandbox-active.json"));
  const bypassEnvSet =
    Boolean(process.env.FORGE_ROLLBACK_NONCE) || Boolean(process.env.FORGE_ALLOW_DESTRUCTIVE);

  let destructiveGuard: HealthCheck;
  if (guardVal === "off") {
    destructiveGuard = {
      status: "fail",
      message:
        "destructive_guard is OFF — destructive git/infra commands are not blocked (P1 warning)",
      source: ".forge/config.md:destructive_guard",
    };
  } else if (!sandboxActive) {
    // P1-1: guard only runs under --sandbox (PreToolUse hook gated on .sandbox-active.json).
    destructiveGuard = {
      status: "unknown",
      message: "destructive_guard inactive (sandbox not enabled — run with --sandbox to activate)",
      source: ".forge/.sandbox-active.json",
    };
  } else if (bypassEnvSet) {
    // P0-3: env bypass tokens set — potential forgery if no nonce file backs them.
    destructiveGuard = {
      status: "warn",
      message:
        "bypass env (FORGE_ROLLBACK_NONCE / FORGE_ALLOW_DESTRUCTIVE) set — verify a nonce file backs it",
      source: "process.env",
    };
  } else {
    destructiveGuard = {
      status: "pass",
      message: `destructive_guard=${guardVal ?? "on (default)"} (sandbox active)`,
      source: ".forge/config.md:destructive_guard",
    };
  }

  // R2 spawn-policy — present once the spawn-policy module ships (always on; fail-open).
  const spawnPolicy: HealthCheck = {
    status: "pass",
    message: "spawn-time policy active (identity + lineage + depth)",
    source: "src/spawn-policy.ts",
  };

  // R3 max_subagent_depth — report configured value (default 5).
  const depthRaw = readConfigScalar(configContent, "max_subagent_depth");
  const depthNum = depthRaw !== null ? Number(depthRaw) : NaN;
  const maxSubagentDepth: HealthCheck = {
    status: Number.isInteger(depthNum) && depthNum >= 1 && depthNum <= 10 ? "pass" : "unknown",
    message: `max_subagent_depth=${Number.isInteger(depthNum) ? depthNum : 5} (default)`,
    source: ".forge/config.md:max_subagent_depth",
  };

  // R4 knowledge quota — count solutions vs near-limit threshold.
  const knowledgeLimitRaw = readConfigScalar(configContent, "knowledge_limit");
  const knowledgeLimit =
    knowledgeLimitRaw !== null && Number.isInteger(Number(knowledgeLimitRaw))
      ? Number(knowledgeLimitRaw)
      : 20;
  const solutionsDir = path.join(forgeRoot, "knowledge", "solutions");
  let count = 0;
  try {
    count = readdirSync(solutionsDir).filter((f) => f.endsWith(".md")).length;
  } catch {
    count = 0;
  }
  const threshold = Math.ceil(knowledgeLimit * 0.9);
  const knowledgeQuota: HealthCheck = {
    status: count >= threshold ? "fail" : "pass",
    message: `solutions=${count}/${knowledgeLimit} (near-limit threshold ${threshold})`,
    source: ".forge/knowledge/solutions/",
  };

  return { destructiveGuard, spawnPolicy, maxSubagentDepth, knowledgeQuota };
}

// Worker runtime scripts that must be present for Forge hooks/phase-worker to
// function. Source mode expects them at <projectRoot>/scripts/; marketplace
// mode ships them in dist-plugin/scripts/. Satisfies runtime-worker-context-
// control R7.4 (forge doctor reports missing worker runtime assets).
const WORKER_RUNTIME_ASSETS = [
  "scripts/tinkerman-hook-dispatch.mjs",
  "scripts/tinkerman-phase-worker.mjs",
  "scripts/tinkerman-sync-runtime.mjs",
] as const;

function readRuntimeSyncHealth(projectRoot: string): HealthCheck {
  const missing: string[] = [];
  for (const rel of WORKER_RUNTIME_ASSETS) {
    if (!existsSync(path.join(projectRoot, rel))) {
      missing.push(rel);
    }
  }
  if (missing.length === 0) {
    return {
      status: "pass",
      message: "All worker runtime assets present",
      source: "scripts/forge-*-runtime.mjs",
    };
  }
  return {
    status: "fail",
    message: `Missing worker runtime assets: ${missing.join(", ")}. Run the runtime sync (repairRuntimeConfig) or reinstall the plugin to restore them.`,
    source: "scripts/forge-*-runtime.mjs",
  };
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

function readGit(projectRoot: string, args: string[]): string | null {
  try {
    return execFileSync("git", args, {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
      // process-lifecycle-management R5: every git call gets a 30s timeout +
      // SIGTERM killSignal so a hung git cannot block forge doctor forever.
      timeout: 30_000,
      killSignal: "SIGTERM",
    }).trim();
  } catch (_err: unknown) {
    return null;
  }
}

function readStatusField(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    const raw = parsed?.raw ?? content;
    return extractStringField(raw, "status") ?? null;
  } catch (_err: unknown) {
    return null;
  }
}

function relativeProjectPath(projectRoot: string, filePath: string): string {
  return path.relative(projectRoot, filePath).replaceAll(path.sep, "/");
}

function artifactSource(artifactId: string): string {
  return `.forge/artifacts/${artifactId}`;
}
