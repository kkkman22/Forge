/**
 * Knowledge Hooks — event-driven scheduling layer for catalog rebuild
 * and integrity lint.
 *
 * Dispatches events from file-write triggers to the existing
 * knowledge-catalog and knowledge-integrity pure function libraries.
 * Zero modifications to those libraries.
 *
 * Pure: hashEvent, isThrottled, isCatalogStale, shouldTriggerEpisodeThreshold.
 * IO:    dispatchKnowledgeEvent reads knowledge files and writes results.
 */
import type { IntegrityFinding } from "./knowledge-integrity.js";
import type { UpgradeSuggestion } from "./pattern-stats.js";
export type KnowledgeEvent = {
    kind: "adr_written";
    path: string;
} | {
    kind: "solution_written";
    topic: string;
    path: string;
} | {
    kind: "instincts_written";
    path: string;
} | {
    kind: "known_failures_written";
    path: string;
} | {
    kind: "glossary_written";
    path: string;
} | {
    kind: "episode_threshold_crossed";
    threshold: number;
    count: number;
} | {
    kind: "catalog_read";
    readerSkill: string;
};
export type KnowledgeHookResult = {
    kind: "rebuilt";
    affectedFiles: string[];
    durationMs: number;
} | {
    kind: "linted";
    findings: IntegrityFinding[];
} | {
    kind: "instincts_proposals";
    proposals: UpgradeSuggestion[];
} | {
    kind: "skipped";
    reason: "throttled" | "no_change_detected" | "cache_fresh";
};
export interface KnowledgeHookInput {
    event: KnowledgeEvent;
    forgeRoot: string;
    recentHashes: Set<string>;
    now: Date;
}
export declare const THRESHOLD_MILESTONES: readonly [5, 10, 25, 50, 100, 250];
export declare function hashEvent(event: KnowledgeEvent): string;
export declare function isThrottled(event: KnowledgeEvent, recentHashes: Set<string>, _throttleMs?: number): boolean;
export declare function isCatalogStale(catalogMtime: number, inputFilesMtimes: number[]): boolean;
export declare function shouldTriggerEpisodeThreshold(previousCount: number, currentCount: number): number | null;
export declare function computeInputFilePaths(knowledgeDir: string): string[];
export declare function dispatchKnowledgeEvent(input: KnowledgeHookInput): Promise<KnowledgeHookResult>;
