/**
 * Spec Health — unified spec health assessment.
 *
 * Aggregates three dimensions (leak / scenario / glossary) into a single
 * ambiguity_score ([0, 1]) and a SpecHealthReport with verdict + recommendations.
 */
import type { BannedPatternRegistry, GlossaryRegistry } from "./pack/types.js";
export type SpecHealthDimension = "leak" | "scenario" | "glossary";
export interface DimensionScore {
    dimension: SpecHealthDimension;
    passed: boolean;
    errorCount: number;
    details: string[];
}
export type HealthVerdict = "healthy" | "marginal" | "degraded";
export type HealthRecommendation = {
    kind: "trigger_grill";
    reason: string;
} | {
    kind: "rerun_spec_review";
    reason: string;
} | {
    kind: "rerun_glossary_check";
    reason: string;
} | {
    kind: "no_action";
    reason: string;
};
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
export declare function computeAmbiguityScore(dims: Record<SpecHealthDimension, DimensionScore>): number;
export declare function classifyVerdict(score: number, _thresholds: {
    ambiguity_min: number;
}): HealthVerdict;
export declare function checkSpecHealth(input: SpecHealthInput): SpecHealthReport;
export declare function renderSpecHealthAdvisory(report: SpecHealthReport): string;
export interface HealthCache {
    specHash: string;
    score: number;
    verdict: HealthVerdict;
    generatedAt: string;
}
export declare function computeSpecHash(content: string): string;
export declare function parseHealthCache(frontmatter: Record<string, unknown>): HealthCache | null;
export declare function shouldRecompute(currentHash: string, cache: HealthCache | null): boolean;
