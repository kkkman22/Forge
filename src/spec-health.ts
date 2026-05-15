/**
 * Spec Health — unified spec health assessment.
 *
 * Aggregates three dimensions (leak / scenario / glossary) into a single
 * ambiguity_score ([0, 1]) and a SpecHealthReport with verdict + recommendations.
 */

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
  bannedRegistry: import("./pack/types.js").BannedPatternRegistry;
  glossaryRegistry: import("./pack/types.js").GlossaryRegistry;
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

export function computeAmbiguityScore(
  dims: Record<SpecHealthDimension, DimensionScore>,
): number {
  const leakFactor = Math.max(0, 1 - dims.leak.errorCount / LEAK_MAX_ERRORS);
  const scenarioFactor = Math.max(0, 1 - dims.scenario.errorCount / SCENARIO_MAX_ERRORS);
  const glossaryFactor = Math.max(0, 1 - dims.glossary.errorCount / GLOSSARY_MAX_ERRORS);
  return WEIGHT_LEAK * leakFactor + WEIGHT_SCENARIO * scenarioFactor + WEIGHT_GLOSSARY * glossaryFactor;
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
