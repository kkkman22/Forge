/**
 * Decide engine — designer conditional trigger logic extracted from decide/SKILL.md.
 *
 * Implements the Agent Team member selection for `/forge decide`:
 *   - Default members: product, architect, security (always present)
 *   - Designer is dynamically added ONLY when the task involves UI changes
 *
 * UI change signals (from SKILL.md §3.4):
 *   1. Task description mentions frontend/UI keywords
 *   2. Involved files include UI-related extensions
 *   3. Task involves user interaction flow changes
 *
 * NOT triggered for: pure backend API, database changes, CI/CD config,
 * pure logic refactoring.
 */
export interface DecideContext {
    taskDescription: string;
    involvedFiles: string[];
}
export interface TeamMember {
    name: string;
    role: string;
    agent: string;
}
/** Renamed alias for the Subagent migration — semantically equivalent to TeamMember. */
export type SubagentConfig = TeamMember;
/**
 * Check whether the task description contains any UI-related keywords.
 * Case-insensitive matching.
 */
export declare function descriptionHasUIKeywords(description: string): boolean;
/**
 * Check whether the task description mentions user interaction flow changes.
 * Case-insensitive matching.
 */
export declare function descriptionHasInteractionFlows(description: string): boolean;
/**
 * Check whether any of the involved files have UI-related extensions.
 */
export declare function filesHaveUIExtensions(files: string[]): boolean;
/**
 * Determine whether the task involves UI changes based on all three signal
 * categories from SKILL.md §3.4.
 */
export declare function involvesUIChanges(context: DecideContext): boolean;
/**
 * Convert a topic string to kebab-case.
 *
 * Rules:
 *  - Lowercase the entire string
 *  - Replace whitespace and non-alphanumeric/non-hyphen characters with hyphens
 *  - Collapse consecutive hyphens into one
 *  - Trim leading/trailing hyphens
 *  - If result is empty (e.g. pure non-ASCII input like Chinese), fallback to
 *    "untitled-<4-char-hash>" for readability while preserving uniqueness
 */
export declare function toKebabCase(topic: string): string;
/**
 * Generate the decision document output path.
 *
 * @param date  - Date string in YYYY-MM-DD format
 * @param topic - Human-readable topic string (will be converted to kebab-case)
 * @returns Path in the format `.forge/decisions/<YYYY-MM-DD>-<topic>.md`
 */
export declare function generateDecisionPath(date: string, topic: string): string;
/**
 * Return the Agent Team members for the decide phase.
 *
 * - product, architect, security are always included.
 * - designer is included if and only if the task involves UI changes.
 */
export declare function getDecideTeamMembers(context: DecideContext): TeamMember[];
/** Alias for the Subagent migration — returns the same members. */
export declare function getDecideSubagents(context: DecideContext): SubagentConfig[];
import type { SubagentInvocation } from "./loop-types.js";
/**
 * Build Round 1 SubagentInvocations for the decide phase.
 *
 * Maps SubagentConfig[] to SubagentInvocation[] with perspective-specific prompts.
 * Always includes product, architect, security. Includes designer iff involvesUIChanges.
 */
export declare function buildDecideRound1Subagents(context: DecideContext): SubagentInvocation[];
/**
 * Build the Round 2 Critic SubagentInvocation.
 *
 * The Critic receives all Round 1 perspective outputs for cross-review.
 */
export declare function buildDecideCriticInvocation(round1Outputs: string[], _context: DecideContext): SubagentInvocation;
/** Output from the Critic agent for status resolution. */
export interface CriticOutput {
    hasBlockingIssues: boolean;
    issues: string[];
}
/**
 * Resolve the decide document status based on Critic output.
 *
 * Returns "needs_revision" when blocking issues are present, "confirmed" otherwise.
 */
export declare function resolveDecideStatus(output: CriticOutput): "needs_revision" | "confirmed";
