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
import { join } from "node:path";
import { type BaselineResolution, resolveBaseline } from "./baseline-resolver.js";
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
  const forgeDir = options.forgeDir ?? join(cwd, ".forge");
  const outputDir = join(forgeDir, "findings", topic, "verify-this");

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
    writeInconclusiveVerdict(
      outputDir,
      topic,
      `Missing required claim fields: ${missingFields.join(", ")}`,
    );
    return {
      verdict: "INCONCLUSIVE",
      inconclusiveReason: `Missing required claim fields: ${missingFields.join(", ")}`,
      baselineFiles: listFiles(join(outputDir, "baseline")),
      treatmentFiles: listFiles(join(outputDir, "treatment")),
      baselineResolution: { ref: null, strategy: "none" },
      outputDir,
    };
  }

  // Step 3: Resolve baseline [R1.10]
  const baselineResolution = await resolveBaseline(topic, baselineRef, { cwd, forgeDir });

  if (baselineResolution.strategy === "none") {
    return {
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "no baseline reference available",
      baselineFiles: listFiles(join(outputDir, "baseline")),
      treatmentFiles: listFiles(join(outputDir, "treatment")),
      baselineResolution,
      outputDir,
    };
  }

  // Steps 4–7: In a full implementation, these would capture artifacts,
  // compute diffs, and write verdicts. For the skeleton, we return
  // INCONCLUSIVE when no capture commands are provided.
  const baselineFiles = listFiles(join(outputDir, "baseline"));
  const treatmentFiles = listFiles(join(outputDir, "treatment"));

  // No artifacts captured → INCONCLUSIVE [R1.6]
  if (baselineFiles.length === 0 || treatmentFiles.length === 0) {
    return {
      verdict: "INCONCLUSIVE",
      inconclusiveReason: "no artifacts captured (no capture commands configured)",
      baselineFiles,
      treatmentFiles,
      baselineResolution,
      outputDir,
    };
  }

  // This path would require actual metric comparison logic
  // For now, we can't determine VERIFIED/NOT_VERIFIED without comparison
  return {
    verdict: "INCONCLUSIVE",
    inconclusiveReason: "metric comparison not yet implemented",
    baselineFiles,
    treatmentFiles,
    baselineResolution,
    outputDir,
  };
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

function writeInconclusiveVerdict(outputDir: string, topic: string, reason: string): void {
  const verdictContent = [
    "---",
    `verdict: "INCONCLUSIVE"`,
    `topic: "${topic}"`,
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
  ].join("\n");
  writeFileSync(join(outputDir, "verdict.md"), verdictContent);
}

function listFiles(dir: string): readonly string[] {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir);
  } catch (_err: unknown) {
    return [];
  }
}
