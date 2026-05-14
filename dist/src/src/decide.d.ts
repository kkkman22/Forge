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
 * **Validates: Requirements 1.1, 1.5, 1.6, 1.7, 2.9**
 */
import { type AdrCriteriaResult, type DecisionCandidate, type DecisionSignals } from "./adr-criteria.js";
import { type AdrEntry, type AdrStatus } from "./adr-registry.js";
import { type Glossary, type GlossaryTerm } from "./glossary.js";
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
 * One (decision, signals) pair together with the three-question gate
 * result produced by {@link evaluateAdrCriteria}. The decide skill's
 * Round 2 Critic consumes the list of these items to render a summary
 * block and to decide, per candidate, whether to persist a full ADR
 * file, an inline note, or nothing at all.
 *
 * Input fields are echoed back verbatim so downstream consumers can
 * correlate the `result` with the original decision and the signals
 * that drove the verdict (useful for audit and for the `--force-adr` /
 * `--no-adr` overrides).
 */
export interface CriteriaScreenItem {
    decision: DecisionCandidate;
    signals: DecisionSignals;
    result: AdrCriteriaResult;
}
/**
 * Run the ADR three-question screen over a batch of decision candidates.
 *
 * Evaluates each (decision, signals) pair with `evaluateAdrCriteria`
 * from `./adr-criteria.js`. The two input arrays are parallel: the
 * signals at index `i` are applied to the decision at index `i`. Items
 * are returned in input order so callers can splice the verdicts back
 * into their own data structures positionally.
 *
 * This function is pure — it performs no IO and does not mutate its
 * inputs. The decide skill invokes it inside the Round 2 Critic stage,
 * right before the Critic returns, so the "ADR Criteria Check" block
 * can be rendered alongside the perspective-level cross-review output.
 *
 * Throws a `RangeError` when the two arrays have different lengths.
 * Parallel-array mismatches are almost always a programmer error (e.g.
 * a missed `push` in the signal-collection loop) and silently
 * truncating or defaulting one side would produce verdicts that look
 * authoritative but were computed from the wrong signal set. Failing
 * loudly keeps the mapping explicit and forces the caller to reconcile
 * the two lists.
 *
 * **Validates: Requirements 2.1, 2.3, 2.4, 2.10**
 */
export declare function runCriteriaScreen(decisions: DecisionCandidate[], signalsList: DecisionSignals[]): CriteriaScreenItem[];
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
 * - `reversibility`, `surprising`, `tradeOffAlternatives`: optional ADR
 *                  three-question gate outputs (Requirements 2.3, 2.7).
 *                  When set, they are persisted to the rendered ADR
 *                  frontmatter so downstream governance tooling can
 *                  audit why a decision was promoted to an ADR.
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
    reversibility?: "hard" | "soft";
    surprising?: boolean;
    tradeOffAlternatives?: string[];
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
 *   6. `reversibility`          (only when set — Requirement 2.3, 2.7)
 *   7. `surprising`             (only when set — Requirement 2.3, 2.7)
 *   8. `trade_off_alternatives` (only when set and non-empty — Req. 2.3, 2.7)
 *   9. `related_adrs` (only when present and non-empty)
 *  10. `supersedes`   (only when present)
 *  11. `superseded_by` (only when present)
 *
 * String scalars are emitted as double-quoted YAML; list fields use the
 * indented-list form (`- "value"`). Optional fields that are undefined or
 * empty are omitted entirely so the output stays minimal.
 *
 * The ADR three-question gate fields (`reversibility`, `surprising`,
 * `trade_off_alternatives`) are additive: they are emitted only when
 * set on the entry, so ADRs authored before the gate landed remain
 * byte-identical after a round-trip. The field names and value shapes
 * are chosen to be non-conflicting with the
 * `engineering-governance-hardening` spec's ADR frontmatter, so both
 * specs can coexist in a single registry.
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
/**
 * Render a one-line HTML-comment "inline decision note" that the decide
 * skill appends to an upstream file (spec / plan / progress) when the
 * ADR three-question gate verdict is `INLINE_NOTE`.
 *
 * The output shape is fixed by Requirement 2.9:
 *
 *   <!-- decision: ${title} | reason: ${reasoning} -->
 *
 * Because the note is an HTML comment, the content must never contain
 * the literal `-->` sequence — that would terminate the comment early
 * and leak subsequent text into the rendered document. We defend
 * against this by replacing every `-->` occurrence in the decision
 * title and the criteria reasoning with `--&gt;`, an unambiguous
 * inline-safe form that keeps the original intent readable when a
 * human opens the raw file. The substitution is applied before the
 * values are interpolated, so the returned string is guaranteed to
 * contain exactly one opening `<!--` and one closing `-->` at the
 * ends.
 *
 * This function is pure and has no IO.
 */
export declare function renderInlineDecisionNote(decision: DecisionCandidate, result: AdrCriteriaResult): string;
/**
 * Minimal filesystem contract required by {@link appendInlineNote}.
 *
 *   - `exists(path)`           — whether the upstream file already
 *                                exists; when `false` the caller still
 *                                gets a fresh file with just the note
 *   - `readFile(path)`         — read the upstream file's current text;
 *                                only invoked when `exists(path)` is
 *                                `true`
 *   - `writeFile(path, content)` — write the new content back; the
 *                                adapter is responsible for creating
 *                                any missing parent directories
 *
 * The interface is intentionally narrow (no `mkdirp`, no streaming) so
 * test suites can supply an in-memory `Map` adapter without ceremony.
 */
export interface InlineNoteAppender {
    readFile(path: string): string;
    writeFile(path: string, content: string): void;
    exists(path: string): boolean;
}
/**
 * Append an inline decision note to an upstream file.
 *
 * Behaviour:
 *   - When `upstreamFile` does not exist, a new file is created whose
 *     content is `${note}\n`.
 *   - When the file exists and already ends with a blank line (i.e. a
 *     trailing `\n\n`), the note is appended directly with a single
 *     trailing newline.
 *   - When the file exists and ends with a single `\n`, one extra blank
 *     line is inserted before the note so it is visually separated
 *     from the preceding content.
 *   - When the file exists and does not end in a newline at all, two
 *     newlines are inserted before the note to leave one blank line
 *     above it.
 *
 * The function always writes back through `fs.writeFile`. It performs
 * exactly one read and one write, never mutates `note`, and is safe to
 * call repeatedly (each call appends one more note).
 */
export declare function appendInlineNote(fs: InlineNoteAppender, upstreamFile: string, note: string): void;
/**
 * Status-file-derived context used by {@link resolveUpstreamFile} to
 * determine which upstream document owns the in-flight decision.
 *
 *   - `currentTask`  — human-readable task identifier from
 *                      `.forge/status.md` (informational; not used for
 *                      the resolution itself, but kept on the type so
 *                      the caller can pass the whole parsed status
 *                      block without splitting fields)
 *   - `specPath`     — absolute or repo-relative path to the task's
 *                      `.kiro/specs/<feature>/spec.md`
 *   - `planPath`     — path to the topic's
 *                      `.forge/plans/<topic>.md`
 *   - `progressPath` — path to the topic's
 *                      `.forge/progress/<topic>.md`
 *
 * All fields are optional. Missing or empty-string values are treated
 * as "not present" for the priority selection.
 */
export interface StatusFileContext {
    currentTask?: string;
    specPath?: string;
    planPath?: string;
    progressPath?: string;
}
/**
 * Select the upstream file to which an inline decision note should be
 * appended.
 *
 * Priority (per Requirement 2.9):
 *
 *   1. `progressPath` — the progress log is the most ephemeral and
 *                       captures the decision closest to where it
 *                       arose
 *   2. `planPath`     — the plan document is the next-most specific
 *   3. `specPath`     — the spec is the long-term home when no plan
 *                       or progress exists yet
 *   4. `null`         — nothing to anchor the note to; the caller
 *                       must decide whether to skip the inline write
 *                       or surface a warning
 *
 * Empty strings are treated as "missing" so callers that parse the
 * status frontmatter into default-empty fields get sensible behaviour
 * without having to pre-filter.
 *
 * This function is pure and has no IO.
 */
export declare function resolveUpstreamFile(status: StatusFileContext): string | null;
/**
 * A single glossary conflict surfaced by the decide phase's alignment check.
 *
 * Fields:
 *   - `term`:      the candidate term name that triggered the conflict
 *   - `existing`:  the glossary entry that clashes with the candidate
 *   - `candidate`: the candidate term the user introduced during decide
 *   - `reason`:    the conflict category as reported by `detectConflict`
 *                  (`same_term_different_definition` or
 *                  `same_alias_different_term`)
 *
 * The type is intentionally close to `ConflictResult` from `src/glossary.ts`
 * but packages the candidate alongside the existing term so callers can
 * render human-facing diffs without re-plumbing the candidate through.
 */
export interface DecideGlossaryConflict {
    term: string;
    existing: GlossaryTerm;
    candidate: GlossaryTerm;
    reason: "same_term_different_definition" | "same_alias_different_term";
}
/**
 * Check every candidate term introduced in the decide phase against the
 * current glossary and return the full list of conflicts found.
 *
 * For each candidate we call `detectConflict(glossary, candidate)`. When a
 * conflict is reported, we record the pair (candidate, existing) together
 * with the conflict reason so callers can present clarification prompts.
 *
 * The function is pure: it never mutates its inputs and performs no IO.
 * Ordering follows the input order of `candidateTerms`.
 */
export declare function checkDecideGlossaryConflicts(candidateTerms: GlossaryTerm[], glossary: Glossary): DecideGlossaryConflict[];
/**
 * Render a user-facing clarification prompt for the given conflicts.
 *
 * Returns an empty string when `conflicts` is empty, so callers can compose
 * the output unconditionally without first checking the length.
 *
 * Format:
 *
 *   ⚠️ Glossary conflict detected ({N}):
 *     - "<term>": existing = "<existing def>", proposed = "<candidate def>"
 *     ...
 *   请澄清：保留现有 / 替换现有 / 新增别名
 */
export declare function renderDecideGlossaryConflictPrompt(conflicts: DecideGlossaryConflict[]): string;
/**
 * Result of parsing a user prompt for ADR-verdict override flags.
 *
 * Fields:
 *   - `forceAdr`: the user explicitly requested the decision be
 *                 persisted as a full ADR (`--force-adr` keyword)
 *   - `noAdr`:    the user explicitly requested the decision be
 *                 discarded (`--no-adr` keyword)
 *
 * At most one of the two flags is set by {@link parseAdrOverride};
 * when both keywords appear in the prompt, the conservative
 * `--no-adr` wins and `noAdr` is returned as the sole active flag.
 * This mirrors the principle that rejecting a borderline ADR is
 * cheaper to revert than accidentally cluttering
 * `.forge/decisions/` with noise.
 */
export interface AdrOverride {
    forceAdr: boolean;
    noAdr: boolean;
}
/**
 * Inspect a user prompt for the two supported ADR-verdict override
 * keywords:
 *
 *   - `--force-adr` → promotes the verdict to `WRITE_ADR`
 *   - `--no-adr`    → demotes the verdict to `DISCARD`
 *
 * Matching is a plain substring check (no whitespace or word-boundary
 * requirement) so the keywords are recognised whether the user types
 * them inline (`fix this bug --force-adr`) or on their own line. When
 * neither keyword is present, both flags are returned as `false` and
 * {@link applyAdrOverride} becomes a no-op.
 *
 * When both keywords appear in the same prompt, `--no-adr` wins —
 * the conservative choice when the user's intent is ambiguous — and
 * the returned override carries `noAdr=true, forceAdr=false`. The
 * function is pure and performs no IO.
 *
 * **Validates: Requirements 2.6**
 */
export declare function parseAdrOverride(userPrompt: string): AdrOverride;
/**
 * Apply a user override to an {@link AdrCriteriaResult} produced by
 * the three-question gate.
 *
 *   - `noAdr=true`    → verdict becomes `DISCARD`, `shouldBecomeAdr`
 *                       becomes `false`, reasoning is replaced with
 *                       `"User override: --no-adr"`
 *   - `forceAdr=true` → verdict becomes `WRITE_ADR`, `shouldBecomeAdr`
 *                       becomes `true`, reasoning is replaced with
 *                       `"User override: --force-adr"`
 *   - neither flag    → the original `result` is returned unchanged
 *                       (same reference), so callers can cheaply
 *                       detect a no-op with `===`
 *
 * When both flags are set on the override (which {@link
 * parseAdrOverride} does not produce, but a hand-constructed override
 * might), the conservative `--no-adr` path wins — aligned with the
 * priority rule in {@link parseAdrOverride}. The other criteria
 * fields (`reversibility`, `surprising`, `tradeOff`, `alternatives`)
 * are preserved verbatim so the user can still audit why the
 * automatic verdict was what it was before the override.
 *
 * The function is pure: it never mutates its inputs and performs no
 * IO.
 *
 * **Validates: Requirements 2.6**
 */
export declare function applyAdrOverride(result: AdrCriteriaResult, override: AdrOverride): AdrCriteriaResult;
