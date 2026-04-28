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
