/**
 * Workflow variant auto-detection — resolveSpecVariant, scoreTaskDescription.
 *
 * Pure functions. No IO, no process.argv, no filesystem.
 *
 * Validates: Requirements 2, 8, 13
 */
import type { WorkflowVariant } from "./spec-bundle.js";
export interface VariantInput {
    tier: "Light" | "Standard" | "Full";
    behaviorScore: number;
    architectureScore: number;
    defaultVariant?: WorkflowVariant;
}
export interface VariantResult {
    variant: WorkflowVariant;
    source: "auto" | "auto-tied-fallback";
}
export interface ScoreResult {
    behaviorScore: number;
    architectureScore: number;
}
export declare function scoreTaskDescription(text: string): ScoreResult;
export declare function resolveSpecVariant(input: VariantInput, eventsPath?: string): VariantResult;
