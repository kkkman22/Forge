/**
 * Spec Health — unified spec health assessment.
 *
 * Aggregates three dimensions (leak / scenario / glossary) into a single
 * ambiguity_score ([0, 1]) and a SpecHealthReport with verdict + recommendations.
 */

import { createHash } from "node:crypto";
import type { BannedPatternRegistry, GlossaryRegistry } from "./pack/types.js";
import { lintScenarios } from "./scenario-linter.js";
import type { SpecBundle } from "./spec-bundle.js";
import { detectSpecLeak } from "./spec-leak-detector.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LEAK_MAX_ERRORS = 5;
const SCENARIO_MAX_ERRORS = 3;
const GLOSSARY_MAX_ERRORS = 5;
const WEIGHT_LEAK = 0.4;
const WEIGHT_SCENARIO = 0.3;
const WEIGHT_GLOSSARY = 0.3;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SpecHealthDimension = "leak" | "scenario" | "glossary";

export interface DimensionScore {
  dimension: SpecHealthDimension;
  passed: boolean;
  errorCount: number;
  details: string[];
}

export type HealthVerdict = "healthy" | "marginal" | "degraded";

export type HealthRecommendation =
  | { kind: "trigger_grill"; reason: string }
  | { kind: "rerun_spec_review"; reason: string }
  | { kind: "rerun_glossary_check"; reason: string }
  | { kind: "no_action"; reason: string };

export interface SpecHealthReport {
  ambiguityScore: number;
  dimensions: Record<SpecHealthDimension, DimensionScore>;
  overallVerdict: HealthVerdict;
  recommendations: HealthRecommendation[];
}

export interface SpecHealthInput {
  specContent: string;
  specFilePath: string;
  bannedRegistry: BannedPatternRegistry;
  glossaryRegistry: GlossaryRegistry;
  thresholds: {
    leak_max: number;
    scenario_max: number;
    glossary_miss_max: number;
    ambiguity_min: number;
  };
}

// ---------------------------------------------------------------------------
// Score computation (pure, independently testable)
// ---------------------------------------------------------------------------

export function computeAmbiguityScore(dims: Record<SpecHealthDimension, DimensionScore>): number {
  const leakFactor = Math.max(0, 1 - dims.leak.errorCount / LEAK_MAX_ERRORS);
  const scenarioFactor = Math.max(0, 1 - dims.scenario.errorCount / SCENARIO_MAX_ERRORS);
  const glossaryFactor = Math.max(0, 1 - dims.glossary.errorCount / GLOSSARY_MAX_ERRORS);
  return (
    WEIGHT_LEAK * leakFactor + WEIGHT_SCENARIO * scenarioFactor + WEIGHT_GLOSSARY * glossaryFactor
  );
}

// ---------------------------------------------------------------------------
// Verdict classification (pure, independently testable)
// ---------------------------------------------------------------------------

export function classifyVerdict(
  score: number,
  _thresholds: { ambiguity_min: number },
): HealthVerdict {
  if (score >= 0.85) return "healthy";
  if (score >= 0.7) return "marginal";
  return "degraded";
}

// ---------------------------------------------------------------------------
// Glossary miss detection (internal helper)
// ---------------------------------------------------------------------------

const TECH_TERM_RE = /\b[A-Z][A-Za-z]+(?:\.[A-Z][A-Za-z]+)+\b/g;

const GHERKIN_KEYWORDS = new Set([
  "Given",
  "When",
  "Then",
  "And",
  "But",
  "Scenario",
  "Feature",
  "Background",
  "Examples",
]);

export function computeGlossaryMissCount(specContent: string, registry: GlossaryRegistry): number {
  const matches = specContent.matchAll(TECH_TERM_RE);
  let missCount = 0;
  for (const m of matches) {
    const term = m[0];
    if (GHERKIN_KEYWORDS.has(term)) continue;
    if (!registry.byTerm.has(term)) {
      missCount++;
    }
  }
  return missCount;
}

// ---------------------------------------------------------------------------
// Recommendation generation
// ---------------------------------------------------------------------------

export function generateRecommendations(
  dims: Record<SpecHealthDimension, DimensionScore>,
  verdict: HealthVerdict,
): HealthRecommendation[] {
  if (verdict === "healthy") {
    return [{ kind: "no_action", reason: "All dimensions healthy" }];
  }

  const recs: HealthRecommendation[] = [];

  if (verdict === "degraded" || verdict === "marginal") {
    recs.push({ kind: "trigger_grill", reason: `Spec ambiguity score ${verdict}` });
  }

  if (dims.leak.errorCount > 0) {
    recs.push({
      kind: "rerun_spec_review",
      reason: `${dims.leak.errorCount} implementation detail leaks detected`,
    });
  }

  if (dims.glossary.errorCount > 0) {
    recs.push({
      kind: "rerun_glossary_check",
      reason: `${dims.glossary.errorCount} undefined glossary terms`,
    });
  }

  return recs;
}

// ---------------------------------------------------------------------------
// Main orchestration: checkSpecHealth
// ---------------------------------------------------------------------------

export function checkSpecHealth(input: SpecHealthInput): SpecHealthReport {
  const leakFindings = detectSpecLeak(
    input.specContent,
    input.specFilePath,
    input.bannedRegistry,
    input.glossaryRegistry,
    "spec",
  );

  const lintFindings = lintScenarios(input.specContent, input.specFilePath);
  const errorLintCount = lintFindings.filter((f) => f.severity === "error").length;

  const glossaryMissCount = computeGlossaryMissCount(input.specContent, input.glossaryRegistry);

  const dimensions: Record<SpecHealthDimension, DimensionScore> = {
    leak: {
      dimension: "leak",
      passed: leakFindings.length === 0,
      errorCount: leakFindings.length,
      details: leakFindings.map((f) => f.original),
    },
    scenario: {
      dimension: "scenario",
      passed: errorLintCount === 0,
      errorCount: errorLintCount,
      details: lintFindings.filter((f) => f.severity === "error").map((f) => f.message),
    },
    glossary: {
      dimension: "glossary",
      passed: glossaryMissCount === 0,
      errorCount: glossaryMissCount,
      details: [],
    },
  };

  const score = computeAmbiguityScore(dimensions);
  const verdict = classifyVerdict(score, input.thresholds);
  const recommendations = generateRecommendations(dimensions, verdict);

  return { ambiguityScore: score, dimensions, overallVerdict: verdict, recommendations };
}

// ---------------------------------------------------------------------------
// Advisory rendering
// ---------------------------------------------------------------------------

export function renderSpecHealthAdvisory(report: SpecHealthReport): string {
  const lines: string[] = [
    `## Spec Health Advisory`,
    `**Verdict**: ${report.overallVerdict}`,
    `**Score**: ${report.ambiguityScore.toFixed(2)}`,
    ``,
    `### Dimensions`,
  ];
  for (const dim of Object.values(report.dimensions)) {
    const icon = dim.passed ? "✅" : "❌";
    lines.push(`- ${dim.dimension}: ${icon} (${dim.errorCount} issues)`);
  }
  if (report.recommendations.length > 0) {
    lines.push("", "### Recommendations");
    for (const r of report.recommendations) {
      lines.push(`- [${r.kind}] ${r.reason}`);
    }
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Cache mechanism (spec_hash + frontmatter)
// ---------------------------------------------------------------------------

export interface HealthCache {
  specHash: string;
  score: number;
  verdict: HealthVerdict;
  generatedAt: string;
}

export function computeSpecHash(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/**
 * Compute a stable hash for a SpecBundle.
 * Three-file layout: concatenates raw content of requirements → design → tasks.
 * Legacy-single layout: hashes the primary content directly.
 * Order is fixed for deterministic output.
 */
export function computeBundleHash(
  bundle: SpecBundle,
  _readFile?: (filePath: string) => string,
): string {
  const parts: string[] = [];

  if (bundle.layout === "three-file") {
    // Primary is RequirementsDocument or BugfixDocument — its raw text is the first part
    const primaryRaw = JSON.stringify(bundle.primary);
    parts.push(primaryRaw);
    if (bundle.design) parts.push(JSON.stringify(bundle.design));
    if (bundle.tasks) parts.push(JSON.stringify(bundle.tasks));
  } else {
    // Legacy-single: hash primary as-is
    parts.push(JSON.stringify(bundle.primary));
  }

  return createHash("sha256").update(parts.join("\n---SPLIT---\n")).digest("hex");
}

export function parseHealthCache(frontmatter: Record<string, unknown>): HealthCache | null {
  const health = frontmatter.health;
  if (typeof health !== "object" || health === null) return null;
  const h = health as Record<string, unknown>;
  const specHash = h.spec_hash;
  const score = h.score;
  const verdict = h.verdict;
  const generatedAt = h.generated_at;
  if (typeof specHash !== "string" || typeof score !== "number" || typeof generatedAt !== "string")
    return null;
  if (verdict !== "healthy" && verdict !== "marginal" && verdict !== "degraded") return null;
  return { specHash, score, verdict, generatedAt };
}

export function shouldRecompute(currentHash: string, cache: HealthCache | null): boolean {
  if (!cache) return true;
  return currentHash !== cache.specHash;
}
