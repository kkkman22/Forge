/**
 * Chat-layer variant override parsing.
 *
 * Extracts a WorkflowVariant from natural language user input.
 * Returns null when no override is detected.
 *
 * Validates: Requirements 2, 8
 */
import type { WorkflowVariant } from "./spec-bundle.js";
export declare function parseVariantOverride(text: string): WorkflowVariant | null;
