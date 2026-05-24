/**
 * Auto Refine detection and execution.
 *
 * detectSpecTriggers: checks mtime and file existence for migration/refine needs.
 * refineDownstream: resets downstream file status based on upstream changes.
 *
 * Validates: Requirements 5, 8
 */
import type { SpecBundle } from "./spec-bundle.js";
export interface SpecTriggers {
    migrationNeeded: boolean;
    refineTarget?: "design" | "tasks";
}
export interface DetectOptions {
    plansPath?: string;
    hasPlansFile?: boolean;
}
export interface RefineOptions {
    hasSnapshot?: boolean;
}
export declare function detectSpecTriggers(featureDir: string, options?: DetectOptions): SpecTriggers;
export declare function refineDownstream(bundle: SpecBundle, target: "design" | "tasks", options?: RefineOptions & {
    eventsPath?: string;
}): SpecBundle;
