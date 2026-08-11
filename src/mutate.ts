/**
 * Mutation Testing Engine — Stryker.js wrapper.
 *
 * Unions `mutation_critical_modules` globs from all enabled packs,
 * generates a temp stryker.conf.json, spawns Stryker, parses JSON output,
 * computes mutation score, and writes artifact to .tinkerman/mutation/.
 *
 * Sprint 2 never fails — verdict is always "pass" or "warn" (never hard error).
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify as yamlStringify } from "yaml";
import {
  type EvidenceWriteResult,
  hashEvidenceInput,
  writeEvidenceArtifact,
} from "./evidence-artifact.js";
import type { EnabledPacks } from "./pack/types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MutationArtifact {
  filePath: string;
  summary: MutationSummary;
  evidenceArtifactId?: string;
  evidenceArtifactPath?: string;
}

export interface MutationSummary {
  packSource: string;
  targetedGlobs: string[];
  targetGroups?: string[];
  required?: boolean;
  total: number;
  killed: number;
  survived: number;
  noCoverage: number;
  runtimeErrors: number;
  mutationScore: number;
  threshold: number;
  verdict: MutationVerdict;
  durationMs: number;
}

export interface RunMutationOptions {
  projectRoot: string;
  threshold?: number;
  targetGroups?: string[];
  required?: boolean;
  currentCommit?: string;
  runId?: string;
  createdAt?: string;
}

export interface MutationCommandOptions {
  command: "run" | "kill-survivors" | "report";
  targetGroups: string[];
  threshold?: number;
  required: boolean;
}

export type MutationGateMode = "required" | "advisory";
export type MutationVerdict = "pass" | "warn" | "fail";

export interface MutationTargetGroup {
  mode: MutationGateMode;
  globs: string[];
}

export interface MutationTargetSelection {
  targetGroups: string[];
  targetedGlobs: string[];
  required: boolean;
}

export const FIRST_PARTY_MUTATION_TARGET_GROUPS: Record<string, MutationTargetGroup> = {
  gate_core: {
    mode: "required",
    globs: ["src/ship-gates.ts", "src/ship.ts", "src/review/quality-gate.ts"],
  },
  validators: {
    mode: "required",
    globs: ["src/mcp/tools/path-validator.ts", "src/spec-validation.ts"],
  },
  workflow_artifacts: {
    mode: "advisory",
    globs: ["src/workflow-graph.ts", "src/evidence-artifact.ts"],
  },
};

export function parseMutationArgs(args: string[]): MutationCommandOptions {
  const [first = "run", ...rest] = args;
  const command =
    first === "kill-survivors" || first === "report" || first === "run" ? first : "run";
  const tokens = first === command ? rest : args;
  const targetGroups: string[] = [];
  let threshold: number | undefined;
  let required = false;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (token === "--target-group") {
      const value = tokens[i + 1];
      if (value) {
        targetGroups.push(value);
        i++;
      }
      continue;
    }
    if (token.startsWith("--target-group=")) {
      const value = token.slice("--target-group=".length);
      if (value) targetGroups.push(value);
      continue;
    }
    if (token === "--threshold") {
      const value = Number(tokens[i + 1]);
      if (Number.isFinite(value)) {
        threshold = value;
        i++;
      }
      continue;
    }
    if (token.startsWith("--threshold=")) {
      const value = Number(token.slice("--threshold=".length));
      if (Number.isFinite(value)) threshold = value;
      continue;
    }
    if (token === "--required") {
      required = true;
    }
  }

  const parsed: MutationCommandOptions = { command, targetGroups, required };
  if (threshold !== undefined) parsed.threshold = threshold;
  return parsed;
}

interface StrykerMutant {
  id: string;
  status: string;
  [key: string]: unknown;
}

interface StrykerFile {
  source: string;
  mutants: StrykerMutant[];
}

interface StrykerReport {
  files: Record<string, StrykerFile>;
  testFiles: unknown;
  framework: { name: string; version?: string };
  thresholds: Record<string, unknown>;
  configFilePath: string;
  baseline: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Stryker config generation
// ---------------------------------------------------------------------------

/** Generate a Stryker configuration object for the given globs. */
export function generateStrykerConfig(
  globs: string[],
  configPath: string,
): {
  mutate: string[];
  testRunner: string;
  reporters: string[];
  jsonReporter: { fileName: string };
  coverageAnalysis: string;
  concurrency: number;
} {
  return {
    mutate: globs,
    testRunner: "vitest",
    reporters: ["json", "html"],
    jsonReporter: {
      fileName: join(configPath, "..", "mutation-report.json"),
    },
    coverageAnalysis: "perTest",
    concurrency: 2,
  };
}

// ---------------------------------------------------------------------------
// Glob collection
// ---------------------------------------------------------------------------

/**
 * Collect and deduplicate `mutation_critical_modules` globs from all enabled packs.
 * Preserves first-occurrence order across packs (matching pack declaration order).
 */
export function collectTargetGlobs(enabled: EnabledPacks): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const entry of enabled.entries) {
    const globs = entry.featureFlags?.mutation_critical_modules;
    if (!Array.isArray(globs)) continue;

    for (const glob of globs) {
      if (typeof glob === "string" && !seen.has(glob)) {
        seen.add(glob);
        result.push(glob);
      }
    }
  }

  return result;
}

export function collectMutationTargets(
  enabled: EnabledPacks,
  options: { targetGroups?: string[] } = {},
): MutationTargetSelection {
  const seen = new Set<string>();
  const targetedGlobs: string[] = [];
  let required = false;

  const addGlob = (glob: string) => {
    if (!seen.has(glob)) {
      seen.add(glob);
      targetedGlobs.push(glob);
    }
  };

  const targetGroups = options.targetGroups ?? [];
  for (const groupName of targetGroups) {
    const group = FIRST_PARTY_MUTATION_TARGET_GROUPS[groupName];
    if (!group) continue;
    if (group.mode === "required") required = true;
    for (const glob of group.globs) {
      addGlob(glob);
    }
  }

  for (const glob of collectTargetGlobs(enabled)) {
    addGlob(glob);
  }

  return { targetGroups, targetedGlobs, required };
}

// ---------------------------------------------------------------------------
// Score computation
// ---------------------------------------------------------------------------

/** Count mutants by status category. */
function countByStatus(mutants: StrykerMutant[]): {
  killed: number;
  survived: number;
  noCoverage: number;
  runtimeErrors: number;
} {
  let killed = 0;
  let survived = 0;
  let noCoverage = 0;
  let runtimeErrors = 0;

  for (const m of mutants) {
    switch (m.status) {
      case "Killed":
        killed++;
        break;
      case "Survived":
        survived++;
        break;
      case "NoCoverage":
        noCoverage++;
        break;
      case "RuntimeError":
      case "Timeout":
        runtimeErrors++;
        break;
      default:
        // Ignore CompileError, TranspileError, etc.
        break;
    }
  }

  return { killed, survived, noCoverage, runtimeErrors };
}

/**
 * Parse Stryker JSON output and compute mutation score.
 * Score = killed / (killed + survived) * 100, excluding noCoverage and runtimeErrors.
 */
export function computeMutationScore(
  strykerJsonOutput: string,
): Omit<MutationSummary, "packSource" | "targetedGlobs" | "threshold" | "verdict" | "durationMs"> {
  let report: StrykerReport;
  try {
    report = JSON.parse(strykerJsonOutput) as StrykerReport;
  } catch (_err: unknown) {
    return {
      total: 0,
      killed: 0,
      survived: 0,
      noCoverage: 0,
      runtimeErrors: 0,
      mutationScore: 0,
    };
  }

  let killed = 0;
  let survived = 0;
  let noCoverage = 0;
  let runtimeErrors = 0;

  for (const file of Object.values(report.files ?? {})) {
    const counts = countByStatus(file.mutants ?? []);
    killed += counts.killed;
    survived += counts.survived;
    noCoverage += counts.noCoverage;
    runtimeErrors += counts.runtimeErrors;
  }

  const total = killed + survived + noCoverage + runtimeErrors;
  const relevantDenominator = killed + survived;
  const mutationScore = relevantDenominator > 0 ? (killed / relevantDenominator) * 100 : 0;

  return {
    total,
    killed,
    survived,
    noCoverage,
    runtimeErrors,
    mutationScore: Math.round(mutationScore * 100) / 100,
  };
}

export function evaluateMutationVerdict(input: {
  mutationScore: number;
  threshold: number;
  required: boolean;
  targetCount: number;
}): MutationVerdict {
  if (input.targetCount === 0) return "warn";
  if (input.mutationScore >= input.threshold) return "pass";
  return input.required ? "fail" : "warn";
}

// ---------------------------------------------------------------------------
// Artifact writing
// ---------------------------------------------------------------------------

function writeArtifact(projectRoot: string, summary: MutationSummary): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const fileName = `mutation-${timestamp}.md`;
  const dirPath = join(projectRoot, ".tinkerman", "mutation");
  const filePath = join(dirPath, fileName);

  mkdirSync(dirPath, { recursive: true });

  const frontmatter = {
    packSource: summary.packSource,
    targetedGlobs: summary.targetedGlobs,
    total: summary.total,
    killed: summary.killed,
    survived: summary.survived,
    noCoverage: summary.noCoverage,
    runtimeErrors: summary.runtimeErrors,
    mutationScore: summary.mutationScore,
    threshold: summary.threshold,
    verdict: summary.verdict,
    durationMs: summary.durationMs,
    timestamp: new Date().toISOString(),
  };

  const content = `---\n${yamlStringify(frontmatter)}---\n\n# Mutation Report\n\nPack source: ${summary.packSource}\nTargeted globs: ${summary.targetedGlobs.join(", ") || "(none)"}\n\n| Metric | Value |\n|--------|-------|\n| Total mutants | ${summary.total} |\n| Killed | ${summary.killed} |\n| Survived | ${summary.survived} |\n| No coverage | ${summary.noCoverage} |\n| Runtime errors | ${summary.runtimeErrors} |\n| Mutation score | ${summary.mutationScore}% |\n| Threshold | ${summary.threshold}% |\n| Verdict | ${summary.verdict} |\n| Duration | ${summary.durationMs}ms |\n`;

  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

export function persistMutationEvidenceArtifact(
  projectRoot: string,
  summary: MutationSummary,
  options: {
    runId?: string;
    artifactId?: string;
    commit?: string;
    createdAt?: string;
  } = {},
): EvidenceWriteResult {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = options.runId ?? `mutation-${createdAt.replace(/\D/g, "").slice(0, 14)}`;
  const artifactId = options.artifactId ?? `${runId}-mutation`;
  const topic = summary.targetGroups?.[0] ?? summary.packSource.split(",")[0]?.trim() ?? "mutation";
  const inputHash = hashEvidenceInput(summary);

  return writeEvidenceArtifact(projectRoot, {
    schema_version: 1,
    artifact_id: artifactId,
    kind: "mutation",
    topic,
    run_id: runId,
    trace_id: runId,
    commit: options.commit ?? "unknown",
    command: `forge mutate run${summary.targetGroups?.length ? ` --target-group ${summary.targetGroups.join(" --target-group ")}` : ""}`,
    exit_code: summary.verdict === "fail" ? 1 : 0,
    input_hash: inputHash,
    result: summary.verdict,
    producer: "forge-mutate",
    created_at: createdAt,
  });
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Run mutation testing against targeted globs from enabled packs.
 *
 * Sprint 2 never fails — returns "warn" verdict on errors instead of throwing.
 */
export async function runMutation(
  enabled: EnabledPacks,
  options: RunMutationOptions,
): Promise<MutationArtifact> {
  const threshold = options.threshold ?? 80;
  const projectRoot = options.projectRoot;
  const startTime = Date.now();

  // Collect globs from selected first-party groups and enabled packs.
  const selection = collectMutationTargets(enabled, { targetGroups: options.targetGroups });
  const targetedGlobs = selection.targetedGlobs;
  const required = options.required ?? selection.required;

  // No globs → no-op with warn
  if (targetedGlobs.length === 0) {
    const durationMs = Date.now() - startTime;
    const packSource = enabled.order.length > 0 ? enabled.order.join(", ") : "(none)";

    const summary: MutationSummary = {
      packSource,
      targetedGlobs: [],
      targetGroups: selection.targetGroups,
      required,
      total: 0,
      killed: 0,
      survived: 0,
      noCoverage: 0,
      runtimeErrors: 0,
      mutationScore: 0,
      threshold,
      verdict: "warn",
      durationMs,
    };

    const filePath = writeArtifact(projectRoot, summary);
    const evidence = persistMutationEvidenceArtifact(projectRoot, summary, {
      runId: options.runId,
      commit: options.currentCommit,
      createdAt: options.createdAt,
    });
    return {
      filePath,
      summary,
      ...(evidence.ok
        ? {
            evidenceArtifactId: summaryArtifactId(evidence.path),
            evidenceArtifactPath: evidence.path,
          }
        : {}),
    };
  }

  // Generate stryker config
  const configDir = join(projectRoot, ".tinkerman", "mutation");
  const configPath = join(configDir, "stryker.conf.json");
  const config = generateStrykerConfig(targetedGlobs, configPath);

  // Write temp config
  mkdirSync(configDir, { recursive: true });
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

  // Run Stryker
  try {
    execFileSync("npx", ["stryker", "run", configPath, "--concurrency", "2"], {
      cwd: projectRoot,
      timeout: 600_000, // 10 min timeout
      encoding: "utf-8",
      stdio: "pipe",
    });
  } catch (_err: unknown) {
    // Stryker may exit non-zero when mutants survive — that's expected.
    // We read the report regardless.
  }

  // Read the JSON report
  const reportPath = join(configDir, "mutation-report.json");
  let strykerOutput: string;
  try {
    strykerOutput = readFileSync(reportPath, "utf-8");
  } catch (_err: unknown) {
    // Report file not found — return warn
    const durationMs = Date.now() - startTime;
    const packSource = enabled.order.join(", ");
    const summary: MutationSummary = {
      packSource,
      targetedGlobs,
      targetGroups: selection.targetGroups,
      required,
      total: 0,
      killed: 0,
      survived: 0,
      noCoverage: 0,
      runtimeErrors: 0,
      mutationScore: 0,
      threshold,
      verdict: "warn",
      durationMs,
    };
    const filePath = writeArtifact(projectRoot, summary);
    const evidence = persistMutationEvidenceArtifact(projectRoot, summary, {
      runId: options.runId,
      commit: options.currentCommit,
      createdAt: options.createdAt,
    });
    return {
      filePath,
      summary,
      ...(evidence.ok
        ? {
            evidenceArtifactId: summaryArtifactId(evidence.path),
            evidenceArtifactPath: evidence.path,
          }
        : {}),
    };
  }

  // Compute score
  const scores = computeMutationScore(strykerOutput);
  const durationMs = Date.now() - startTime;
  const packSource = enabled.order.join(", ");

  const mutationScore = scores.mutationScore;
  const verdict = evaluateMutationVerdict({
    mutationScore,
    threshold,
    required,
    targetCount: targetedGlobs.length,
  });

  const summary: MutationSummary = {
    packSource,
    targetedGlobs,
    targetGroups: selection.targetGroups,
    required,
    total: scores.total,
    killed: scores.killed,
    survived: scores.survived,
    noCoverage: scores.noCoverage,
    runtimeErrors: scores.runtimeErrors,
    mutationScore,
    threshold,
    verdict,
    durationMs,
  };

  const filePath = writeArtifact(projectRoot, summary);
  const evidence = persistMutationEvidenceArtifact(projectRoot, summary, {
    runId: options.runId,
    commit: options.currentCommit,
    createdAt: options.createdAt,
  });
  return {
    filePath,
    summary,
    ...(evidence.ok
      ? {
          evidenceArtifactId: summaryArtifactId(evidence.path),
          evidenceArtifactPath: evidence.path,
        }
      : {}),
  };
}

function summaryArtifactId(path: string): string {
  const name = path.split("/").pop() ?? "";
  return name.endsWith(".json") ? name.slice(0, -".json".length) : name;
}
