/**
 * Mutation Testing Engine — Stryker.js wrapper.
 *
 * Unions `mutation_critical_modules` globs from all enabled packs,
 * generates a temp stryker.conf.json, spawns Stryker, parses JSON output,
 * computes mutation score, and writes artifact to .forge/mutation/.
 *
 * Sprint 2 never fails — verdict is always "pass" or "warn" (never hard error).
 */
import type { EnabledPacks } from "./pack/types.js";
export interface MutationArtifact {
    filePath: string;
    summary: MutationSummary;
}
export interface MutationSummary {
    packSource: string;
    targetedGlobs: string[];
    total: number;
    killed: number;
    survived: number;
    noCoverage: number;
    runtimeErrors: number;
    mutationScore: number;
    threshold: number;
    verdict: "pass" | "warn";
    durationMs: number;
}
export interface RunMutationOptions {
    projectRoot: string;
    threshold?: number;
}
/** Generate a Stryker configuration object for the given globs. */
export declare function generateStrykerConfig(globs: string[], configPath: string): {
    mutate: string[];
    testRunner: string;
    reporters: string[];
    jsonReporter: {
        fileName: string;
    };
    coverageAnalysis: string;
    concurrency: number;
};
/**
 * Collect and deduplicate `mutation_critical_modules` globs from all enabled packs.
 * Preserves first-occurrence order across packs (matching pack declaration order).
 */
export declare function collectTargetGlobs(enabled: EnabledPacks): string[];
/**
 * Parse Stryker JSON output and compute mutation score.
 * Score = killed / (killed + survived) * 100, excluding noCoverage and runtimeErrors.
 */
export declare function computeMutationScore(strykerJsonOutput: string): Omit<MutationSummary, "packSource" | "targetedGlobs" | "threshold" | "verdict" | "durationMs">;
/**
 * Run mutation testing against targeted globs from enabled packs.
 *
 * Sprint 2 never fails — returns "warn" verdict on errors instead of throwing.
 */
export declare function runMutation(enabled: EnabledPacks, options: RunMutationOptions): Promise<MutationArtifact>;
