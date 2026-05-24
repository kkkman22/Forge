/**
 * Plan stage — tasks.md single source upgrade.
 *
 * Upgrades a draft TasksSeedDocument to locked status with wave blocks.
 * Provides legacy plan fallback detection.
 *
 * Validates: Requirement 4, 7
 */
import type { TasksSeedDocument } from "./spec-bundle.js";
/**
 * Upgrade a draft tasks seed to locked with auto-generated wave blocks.
 * Preserves existing waves if present; generates from dependency graph otherwise.
 */
export declare function upgradeTasksSeed(doc: TasksSeedDocument): TasksSeedDocument;
/**
 * Detect whether plan stage should fall back to legacy plans/ file.
 */
export declare function detectLegacyPlanFallback(input: {
    hasTasksMd: boolean;
    hasPlansMd: boolean;
    planContent: string;
}): {
    needsFallback: boolean;
    source: "plans" | "tasks" | "none";
    coexistenceWarning: boolean;
};
