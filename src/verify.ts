/**
 * Forge_Verify orchestrator — runs evidence-based verification.
 *
 * Steps:
 *   1. Write Falsifiable_Claim → claim.md
 *   2. Validate claim fields (condition/metric/threshold must be non-empty)
 *   3. Resolve baseline via 4-level fallback
 *   4. Capture baseline and treatment artifacts
 *   5. Compute diff
 *   6. Build Evidence Chain
 *   7. Write verdict.md
 *
 * **Validates: Requirements R1.1–R1.6, R13.3–R13.4, R14.9**
 */

import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type BaselineResolution, resolveBaseline } from "./baseline-resolver.js";
import {
  type EvidenceArtifact,
  hashEvidenceInput,
  writeEvidenceArtifact,
} from "./evidence-artifact.js";
import type { VerdictValue } from "./verdict-parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A falsifiable claim with required condition/metric/threshold fields. */
export interface FalsifiableClaim {
  condition: string;
  metric: string;
  threshold: string;
}

/** Options for the verify orchestrator. */
export interface VerifyOptions {
  /** The topic being verified. */
  topic: string;
  /** Working directory. Defaults to process.cwd(). */
  cwd?: string;
  /** Path to .forge directory. */
  forgeDir?: string;
  /** The falsifiable claim. */
  claim: FalsifiableClaim;
  /** Optional explicit baseline git ref. */
  baselineRef?: string;
  /** Current commit hash for immutable evidence artifacts. */
  currentCommit?: string;
  /** Producer label for evidence artifacts. */
  producer?: string;
  /** Test hook for deterministic timestamps. */
  createdAt?: string;
}

/** Result of a verify run. */
export interface VerifyResult {
  /** The three-state verdict. */
  verdict: VerdictValue;
  /** Reason for INCONCLUSIVE, if applicable. */
  inconclusiveReason: string | null;
  /** Files in baseline/ directory. */
  baselineFiles: readonly string[];
  /** Files in treatment/ directory. */
  treatmentFiles: readonly string[];
  /** The baseline resolution used. */
  baselineResolution: BaselineResolution;
  /** Path to the output directory. */
  outputDir: string;
  /** Immutable evidence artifact id, when one was written. */
  evidenceArtifactId?: string;
  /** Immutable evidence artifact path, when one was written. */
  evidenceArtifactPath?: string;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Run the verify orchestrator.
 *
 * Executes the full verification pipeline: claim validation → baseline
 * resolution → artifact capture → verdict writing.
 */
export async function runVerify(options: VerifyOptions): Promise<VerifyResult> {
  const { topic, claim, baselineRef } = options;
  const cwd = options.cwd ?? process.cwd();
  const forgeDir = options.forgeDir ?? join(cwd, ".tinkerman");
  const outputDir = join(forgeDir, "findings", topic, "verify-this");
  const createdAt = options.createdAt ?? new Date().toISOString();
  const runId = makeVerifyRunId(createdAt);
  const evidenceArtifactId = `${runId}-verify`;

  // Ensure output directories exist
  for (const sub of ["", "baseline", "treatment", "diff"]) {
    mkdirSync(join(outputDir, sub), { recursive: true });
  }

  // Step 1: Write claim.md
  const claimContent = renderClaimMd(topic, claim);
  writeFileSync(join(outputDir, "claim.md"), claimContent);

  // Step 2: Validate claim fields [R1.3]
  const missingFields = validateClaim(claim);
  if (missingFields.length > 0) {
    return writeInconclusiveResult(
      {
        forgeDir,
        outputDir,
        topic,
        runId,
        evidenceArtifactId,
        currentCommit: options.currentCommit ?? "unknown",
        producer: options.producer ?? "forge-verify",
        createdAt,
      },
      {
        baselineFiles: listFiles(join(outputDir, "baseline")),
        treatmentFiles: listFiles(join(outputDir, "treatment")),
        baselineResolution: { ref: null, strategy: "none" },
      },
      `Missing required claim fields: ${missingFields.join(", ")}`,
    );
  }

  // Step 3: Resolve baseline [R1.10]
  const baselineResolution = await resolveBaseline(topic, baselineRef, { cwd, forgeDir });

  if (baselineResolution.strategy === "none") {
    return writeInconclusiveResult(
      {
        forgeDir,
        outputDir,
        topic,
        runId,
        evidenceArtifactId,
        currentCommit: options.currentCommit ?? "unknown",
        producer: options.producer ?? "forge-verify",
        createdAt,
      },
      {
        baselineFiles: listFiles(join(outputDir, "baseline")),
        treatmentFiles: listFiles(join(outputDir, "treatment")),
        baselineResolution,
      },
      "no baseline reference available",
    );
  }

  // Steps 4–7: In a full implementation, these would capture artifacts,
  // compute diffs, and write verdicts. For the skeleton, we return
  // INCONCLUSIVE when no capture commands are provided.
  const baselineFiles = listFiles(join(outputDir, "baseline"));
  const treatmentFiles = listFiles(join(outputDir, "treatment"));

  // No artifacts captured → INCONCLUSIVE [R1.6]
  if (baselineFiles.length === 0 || treatmentFiles.length === 0) {
    return writeInconclusiveResult(
      {
        forgeDir,
        outputDir,
        topic,
        runId,
        evidenceArtifactId,
        currentCommit: options.currentCommit ?? baselineResolution.ref ?? "unknown",
        producer: options.producer ?? "forge-verify",
        createdAt,
      },
      {
        baselineFiles,
        treatmentFiles,
        baselineResolution,
      },
      "no artifacts captured (no capture commands configured)",
    );
  }

  // This path would require actual metric comparison logic
  // For now, we can't determine VERIFIED/NOT_VERIFIED without comparison
  return writeInconclusiveResult(
    {
      forgeDir,
      outputDir,
      topic,
      runId,
      evidenceArtifactId,
      currentCommit: options.currentCommit ?? baselineResolution.ref ?? "unknown",
      producer: options.producer ?? "forge-verify",
      createdAt,
    },
    {
      baselineFiles,
      treatmentFiles,
      baselineResolution,
    },
    "metric comparison not yet implemented",
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function validateClaim(claim: FalsifiableClaim): string[] {
  const missing: string[] = [];
  if (!claim.condition?.trim()) missing.push("condition");
  if (!claim.metric?.trim()) missing.push("metric");
  if (!claim.threshold?.trim()) missing.push("threshold");
  return missing;
}

function renderClaimMd(topic: string, claim: FalsifiableClaim): string {
  return [
    "---",
    `condition: "${claim.condition}"`,
    `metric: "${claim.metric}"`,
    `threshold: "${claim.threshold}"`,
    `topic: "${topic}"`,
    `created_at: "${new Date().toISOString()}"`,
    "---",
    "# Falsifiable Claim",
    "",
    `在指定条件下（${claim.condition}），度量指标（${claim.metric}）必须满足阈值约束（${claim.threshold}）。`,
  ].join("\n");
}

interface VerifyEvidenceContext {
  forgeDir: string;
  outputDir: string;
  topic: string;
  runId: string;
  evidenceArtifactId: string;
  currentCommit: string;
  producer: string;
  createdAt: string;
}

interface VerifyEvidenceFiles {
  baselineFiles: readonly string[];
  treatmentFiles: readonly string[];
  baselineResolution: BaselineResolution;
}

function writeInconclusiveResult(
  context: VerifyEvidenceContext,
  files: VerifyEvidenceFiles,
  reason: string,
): VerifyResult {
  const artifactPath = writeVerifyEvidenceArtifact(context, files, reason);
  writeInconclusiveVerdict(context.outputDir, context.topic, reason, context.evidenceArtifactId);

  const result: VerifyResult = {
    verdict: "INCONCLUSIVE",
    inconclusiveReason: reason,
    baselineFiles: files.baselineFiles,
    treatmentFiles: files.treatmentFiles,
    baselineResolution: files.baselineResolution,
    outputDir: context.outputDir,
    evidenceArtifactId: context.evidenceArtifactId,
  };
  if (artifactPath) result.evidenceArtifactPath = artifactPath;
  return result;
}

function writeVerifyEvidenceArtifact(
  context: VerifyEvidenceContext,
  files: VerifyEvidenceFiles,
  reason: string,
): string | null {
  const artifact: EvidenceArtifact = {
    schema_version: 1,
    artifact_id: context.evidenceArtifactId,
    kind: "verify",
    topic: context.topic,
    run_id: context.runId,
    trace_id: context.runId,
    commit: context.currentCommit,
    command: `forge verify ${context.topic}`,
    exit_code: 1,
    stdout_tail: reason,
    input_hash: hashEvidenceInput({
      topic: context.topic,
      reason,
      baselineResolution: files.baselineResolution,
      baselineFiles: files.baselineFiles,
      treatmentFiles: files.treatmentFiles,
    }),
    result: "inconclusive",
    producer: context.producer,
    created_at: context.createdAt,
  };

  const writeResult = writeEvidenceArtifact(dirname(context.forgeDir), artifact);
  return writeResult.ok ? writeResult.path : null;
}

function writeInconclusiveVerdict(
  outputDir: string,
  topic: string,
  reason: string,
  evidenceArtifactId: string,
): void {
  const verdictContent = [
    "---",
    `verdict: "INCONCLUSIVE"`,
    `topic: "${topic}"`,
    `evidence_artifact_id: "${evidenceArtifactId}"`,
    'claim_path: "claim.md"',
    "baseline_snapshot: null",
    "treatment_snapshot: null",
    `decided_at: "${new Date().toISOString()}"`,
    `missing_artifacts: []`,
    `inconclusive_reason: "${reason.replace(/"/g, '\\"')}"`,
    "---",
    "# Verdict: INCONCLUSIVE",
    "",
    `## Reason`,
    "",
    reason,
    "",
    `Evidence artifact: ${evidenceArtifactId}`,
  ].join("\n");
  writeFileSync(join(outputDir, "verdict.md"), verdictContent);
}

function makeVerifyRunId(createdAt: string): string {
  const prefix = createdAt.replace(/\D/g, "").slice(0, 14) || Date.now().toString(36);
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${suffix}`;
}

function listFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir);
  } catch (_err: unknown) {
    return [];
  }
}
