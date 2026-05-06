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
 *
 * In addition to team selection, this module hosts pure helpers for
 * finalizing an ADR at the end of `/forge decide` (see `finalizeAdr` and
 * `renderAdrFileContent`). These functions orchestrate ADR id allocation,
 * file content rendering and index regeneration without performing any IO —
 * the caller injects a `readExistingFile` callback and is responsible for
 * writing the returned artifacts to disk.
 *
 * **Validates: Requirements 1.1, 1.5, 1.6, 1.7**
 */
import { type AdrEntry, type AdrStatus } from "./adr-registry.js";
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
/**
 * Inputs for `finalizeAdr` — everything needed to compute the new ADR file,
 * the regenerated index, and any old ADR files whose frontmatter must be
 * updated as a consequence of supersession.
 *
 * - `title`:       human-readable ADR title
 * - `topic`:       used to build the filename slug (via `toKebabCase`)
 * - `status`:      lifecycle status for the new ADR
 * - `date`:        ISO date string ("YYYY-MM-DD" or full ISO 8601)
 * - `deciders`:    list of decider identifiers (handles, emails, names)
 * - `relatedAdrs`: optional — ids of other ADRs referenced by this decision
 * - `supersedes`:  optional — id of the ADR this one replaces
 * - `existingAdrs`: already-loaded ADRs, used for id allocation and
 *                   supersession
 * - `bodyMarkdown`: the Context / Decision / Consequences markdown body
 *                   (everything after the frontmatter closing `---`)
 */
export interface FinalizeAdrInput {
    title: string;
    topic: string;
    status: AdrStatus;
    date: string;
    deciders: string[];
    relatedAdrs?: string[];
    supersedes?: string;
    existingAdrs: AdrEntry[];
    bodyMarkdown: string;
}
/** A single ADR file update produced as a side-effect of supersession. */
export interface AdrSupersessionUpdate {
    filePath: string;
    updatedContent: string;
}
/**
 * Output of `finalizeAdr`. The caller performs the actual IO by writing
 * each artifact to disk; the function itself is pure.
 *
 * - `newEntry`:           the newly allocated ADR entry (with filePath set)
 * - `adrFilePath`:        path of the new ADR file to write
 * - `adrFileContent`:     full markdown content for the new ADR file
 * - `indexFilePath`:      always `.forge/knowledge/adr-index.md`
 * - `indexContent`:       regenerated index content (all entries, each id
 *                         exactly once)
 * - `supersessionUpdates`: for each ADR that was superseded by the new one,
 *                         a `{ filePath, updatedContent }` pair the caller
 *                         must write back to disk
 */
export interface FinalizeAdrOutput {
    newEntry: AdrEntry;
    adrFilePath: string;
    adrFileContent: string;
    indexFilePath: string;
    indexContent: string;
    supersessionUpdates: AdrSupersessionUpdate[];
}
/**
 * Render the full ADR markdown document for an `AdrEntry` and its body.
 *
 * The frontmatter is emitted in a fixed, stable order:
 *   1. `id`
 *   2. `title`
 *   3. `status`
 *   4. `date`
 *   5. `deciders`
 *   6. `related_adrs` (only when present and non-empty)
 *   7. `supersedes`   (only when present)
 *   8. `superseded_by` (only when present)
 *
 * String scalars are emitted as double-quoted YAML; list fields use the
 * indented-list form (`- "value"`). Optional fields that are undefined or
 * empty are omitted entirely so the output stays minimal.
 *
 * The body markdown is appended verbatim after the closing `---` with one
 * blank line in between, producing the standard
 * `frontmatter + blank line + body` shape that `parseAdrFrontmatter`
 * recovers losslessly.
 *
 * This function is pure and has no IO.
 */
export declare function renderAdrFileContent(entry: AdrEntry, bodyMarkdown: string): string;
/**
 * Finalize an ADR at the end of `/forge decide`.
 *
 * Pipeline:
 *   1. Allocate the next canonical id via `nextAdrId`.
 *   2. Build the new `AdrEntry` (with `filePath` of the form
 *      `.forge/decisions/<id>-<kebab-topic>.md`).
 *   3. Compute supersession updates via `applySupersession`.
 *   4. For each superseded entry, re-read the original file via
 *      `readExistingFile`, extract its body, and re-render the file with
 *      the updated frontmatter.
 *   5. Merge the new entry + supersession updates with the existing ADRs
 *      so that every id appears exactly once, then render the index.
 *
 * The function is pure: all IO is injected through the `readExistingFile`
 * callback. The caller writes the returned artifacts to disk.
 *
 * Optional input fields are normalized:
 *   - `relatedAdrs` defaults to an empty array and is omitted from the new
 *     entry when empty so the rendered frontmatter stays minimal.
 *   - `supersedes` is copied onto `newEntry` only when non-empty.
 */
export declare function finalizeAdr(input: FinalizeAdrInput, readExistingFile: (path: string) => string | undefined): FinalizeAdrOutput;
