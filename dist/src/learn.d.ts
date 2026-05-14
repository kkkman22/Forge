/**
 * Learn engine — core logic extracted from forge-learn/SKILL.md.
 *
 * Implements:
 *   - generateKnowledgeDocument:    Creates a knowledge document with valid YAML frontmatter
 *   - maintainKnowledgeBase:        Enforces knowledge base invariants (doc limit + confidence floor)
 *   - extractSessionTermCandidates: Surfaces candidate glossary terms from a learn session
 *   - buildNewGlossaryTerm:         Lifts a candidate into a GlossaryTerm draft ready for mergeTerm
 *
 * Property 13: 知识文档格式有效性
 *   - YAML frontmatter must contain: title, tags, date, confidence
 *   - confidence must be in [0.3, 0.9] range
 *   **Validates: Requirements 9.2, 9.3**
 *
 * Property 14: 知识库维护不变量
 *   - After maintenance: doc count ≤ limit (default 20)
 *   - After maintenance: no pattern with confidence < 0.3
 *   **Validates: Requirements 9.4, 9.5**
 *
 * Glossary writeback (Requirement 1.6): the learn skill scans the session's
 * decisions / findings / reviews / progress / prior sessions for TitleCase,
 * PascalCase and contiguous CJK candidate terms that are not yet present in
 * `.forge/glossary.md`, and presents them to the user for confirmation
 * before calling `mergeTerm(..., "append")`.
 *   **Validates: Requirements 1.6**
 */
import type { Episode, EpisodeOutcome, EpisodeTier } from "./episode.js";
import { type EvolutionReport } from "./evolution-marker.js";
import { type Glossary, type GlossaryTerm } from "./glossary.js";
import { type TermCandidate } from "./glossary-extractor.js";
export { renderGlossaryConflictPrompt, runGlossaryCheck } from "./glossary-hook.js";
import { type Pattern } from "./pattern-stats.js";
export interface KnowledgeFrontmatter {
    title: string;
    tags: string[];
    date: string;
    confidence: number;
}
export interface KnowledgeDocument {
    frontmatter: KnowledgeFrontmatter;
    body: {
        problemPattern: string;
        solution: string;
        pitfalls: string;
        decisionRationale: string;
        reusablePatterns: string;
    };
}
export interface InstinctPattern {
    name: string;
    confidenceScore: number;
    tags: string[];
    sources: string[];
    description: string;
}
export interface KnowledgeBaseState {
    documents: KnowledgeDocument[];
    instinctPatterns: InstinctPattern[];
    limit: number;
}
export interface MaintenanceResult {
    documents: KnowledgeDocument[];
    instinctPatterns: InstinctPattern[];
    removedDocuments: KnowledgeDocument[];
    removedPatterns: InstinctPattern[];
}
export declare const MIN_CONFIDENCE = 0.3;
export declare const MAX_CONFIDENCE = 0.9;
export declare const DEFAULT_KNOWLEDGE_LIMIT = 20;
/**
 * Validate that a date string is a real calendar date in YYYY-MM-DD format
 * using a round-trip check through Date.UTC.
 *
 * new Date() silently overflows invalid dates (e.g. Feb 30 → Mar 2),
 * so we parse → construct → compare to catch these cases.
 *
 * Returns true if the date is valid, false otherwise.
 */
export declare function isValidCalendarDate(date: string): boolean;
/**
 * Validate that a knowledge document's frontmatter contains all required fields
 * and that confidence is within the valid range [0.3, 0.9].
 *
 * Per SKILL.md §3 and design Property 13:
 *   - title: required, non-empty string
 *   - tags: required, non-empty array
 *   - date: required, YYYY-MM-DD format
 *   - confidence: required, in [0.3, 0.9]
 */
export declare function validateKnowledgeFrontmatter(frontmatter: KnowledgeFrontmatter): {
    valid: boolean;
    errors: string[];
};
/**
 * Generate a knowledge document with valid frontmatter.
 *
 * Clamps confidence to [0.3, 0.9] range, validates the date via round-trip
 * check, and ensures all required fields are present.
 */
export declare function generateKnowledgeDocument(title: string, tags: string[], date: string, confidence: number, body: KnowledgeDocument["body"]): KnowledgeDocument;
/**
 * Maintain the knowledge base by enforcing two invariants:
 *
 * 1. Document count ≤ limit (default 20)
 *    - When over limit, remove documents with lowest confidence first
 *
 * 2. No instinct patterns with confidence < 0.3
 *    - Remove any pattern below the minimum confidence threshold
 *
 * Per SKILL.md §5 and design Property 14.
 */
export declare function maintainKnowledgeBase(state: KnowledgeBaseState): MaintenanceResult;
/**
 * A single skill execution feedback entry.
 */
export interface SkillFeedbackEntry {
    /** The forge command that was executed, e.g. "build", "review", "plan". */
    command: string;
    /** Whether the execution succeeded. */
    success: boolean;
    /** Execution duration in seconds (0 if unknown). */
    durationSeconds: number;
    /** Failure reason (empty string if success). */
    failureReason: string;
}
/**
 * Aggregated statistics for a single command.
 */
export interface CommandStats {
    command: string;
    totalRuns: number;
    successCount: number;
    failureCount: number;
    successRate: number;
    avgDurationSeconds: number;
    /** Top failure reasons sorted by frequency (most common first). */
    topFailureReasons: {
        reason: string;
        count: number;
    }[];
}
/**
 * Result of analyzing skill feedback entries.
 */
export interface FeedbackAnalysis {
    /** Per-command statistics. */
    commandStats: CommandStats[];
    /** Commands with failure rate above the alert threshold. */
    alertCommands: string[];
    /** Total entries analyzed. */
    totalEntries: number;
}
/** Failure rate threshold above which a command is flagged for attention. */
export declare const FAILURE_RATE_ALERT_THRESHOLD = 0.3;
/**
 * Analyze a collection of skill feedback entries.
 *
 * Groups entries by command, computes success/failure rates, average duration,
 * and identifies commands with failure rates above the alert threshold (30%).
 *
 * Per design Property 24 (Self-evolution Phase 2):
 *   - Commands with >30% failure rate are flagged
 *   - Failure reasons are aggregated and ranked by frequency
 */
export declare function analyzeSkillFeedback(entries: SkillFeedbackEntry[]): FeedbackAnalysis;
/**
 * Check if a specific failure reason appears in both skill feedback and known failures.
 *
 * This is the cross-validation step from Phase 2: if a failure reason from
 * skill-feedback.md also appears in known-failures.md, it's a confirmed
 * recurring pattern that should be prioritized.
 *
 * @param feedbackReasons - Failure reasons from skill feedback analysis
 * @param knownFailureDescriptions - Descriptions from known-failures.md
 * @returns Reasons that appear in both sources (confirmed recurring patterns)
 */
export declare function crossValidateFailures(feedbackReasons: string[], knownFailureDescriptions: string[]): string[];
/**
 * Aggregated text sources consumed by {@link extractSessionTermCandidates}.
 *
 * All fields are optional so callers can feed in only the sources they have
 * access to. Each entry is treated as free-form markdown / prose and is
 * concatenated with single newlines before extraction.
 *
 *   - decisions: ADR / decision document bodies (e.g. `.forge/decisions/*.md`)
 *   - findings:  finding document bodies (e.g. `.forge/findings/*.md`)
 *   - reviews:   review document bodies (e.g. `.forge/reviews/*.md`)
 *   - progress:  progress notes (e.g. `.forge/progress/*.md`)
 *   - sessions:  existing session journals (e.g. `.forge/knowledge/sessions/*.md`)
 */
export interface SessionData {
    decisions?: string[];
    findings?: string[];
    reviews?: string[];
    progress?: string[];
    sessions?: string[];
}
/**
 * Identify candidate glossary terms surfaced by a single learn session.
 *
 * Behaviour:
 *   1. All non-empty source strings are concatenated with `\n` into a single
 *      corpus.
 *   2. {@link extractCandidates} is invoked with the glossary's canonical
 *      terms + aliases as the "already known" list so pre-defined concepts
 *      are never surfaced again.
 *   3. {@link filterCandidates} applies {@link DEFAULT_EXTRACTION_RULES}
 *      (minFrequency=2, minLength=3, exclude camelCase / underscore names,
 *      cap at 10) to produce a deterministic, ranked shortlist.
 *
 * The result is the subset of candidate terms that (a) passed the
 * heuristic filters and (b) are genuinely new to the glossary. Callers
 * should present the list to the user for confirmation before promoting
 * individual entries via `mergeTerm(glossary, term, "append")`.
 *
 * This function is pure: same inputs → same output, no IO.
 *
 * **Validates: Requirements 1.6**
 */
export declare function extractSessionTermCandidates(sessionData: SessionData, glossary: Glossary): TermCandidate[];
/**
 * Convert a {@link TermCandidate} into a {@link GlossaryTerm} draft suitable
 * for appending to the glossary via `mergeTerm(..., "append")`.
 *
 * Field mapping:
 *   - `term`          = `candidate.term` (the first observed surface form)
 *   - `definition`    = first 200 characters of `candidate.context`, trimmed.
 *                        This is an intentionally rough placeholder — the
 *                        learn skill surfaces the draft to the user so they
 *                        can refine the wording before it is merged.
 *   - `last_updated`  = `now` formatted as `YYYY-MM-DD` in UTC
 *   - `source_session`= provided `sessionFile` when present (omitted when
 *                        undefined or blank)
 *
 * The `aliases` field is deliberately left unset: the extractor cannot
 * reliably infer alternative surface forms, so the user supplies those in
 * the confirmation step.
 *
 * This function is pure.
 *
 * **Validates: Requirements 1.6**
 */
export declare function buildNewGlossaryTerm(candidate: TermCandidate, now: Date, sessionFile?: string): GlossaryTerm;
/**
 * Result of {@link proposeStaleTerms}.
 *
 *   - `staleTerms`: the (possibly empty) list of active terms whose
 *     `last_updated` is older than `maxAgeDays` before `now`. Already
 *     archived entries are never surfaced because they live under a
 *     separate `archivedTerms` list.
 *   - `prompt`: a short, human-facing message the caller can show the
 *     user before asking for archival confirmation. Empty when there are
 *     no stale terms, so callers can use `prompt.length > 0` as the
 *     "anything to do?" signal without reading `staleTerms.length`.
 */
export interface ProposeStaleTermsResult {
    staleTerms: GlossaryTerm[];
    prompt: string;
}
/**
 * Identify stale glossary terms and render a prompt the learn skill can
 * show the user before archival.
 *
 * This is a thin wrapper around {@link findStaleterms} that adds the
 * human-facing messaging layer required by the forge-learn execution
 * flow (see SKILL.md §9 "Glossary 陈旧术语归档"). It is intentionally
 * pure so the same inputs always produce the same prompt, independent
 * of locale or clock.
 *
 * Behaviour:
 *   - Only `glossary.terms` (the active set) is inspected. Archived
 *     terms already live under `glossary.archivedTerms` and must not be
 *     re-proposed.
 *   - The prompt is written in Chinese to match the SKILL.md voice and
 *     references the effective threshold (`maxAgeDays ?? 30`) so the
 *     user sees the exact age window the detector used.
 *   - When no terms are stale, `prompt` is the empty string. Callers
 *     should treat this as "nothing to do" and not surface anything to
 *     the user.
 *
 * **Validates: Requirements 1.11**
 */
export declare function proposeStaleTerms(glossary: Glossary, now: Date, maxAgeDays?: number): ProposeStaleTermsResult;
/**
 * A single phase transition recorded in `.forge/status.md` during the
 * session. The learn skill walks this history backwards to recover the
 * most relevant skill to attribute the episode to.
 *
 *   - `phase`: short phase token, e.g. `"build"`, `"review"`, `"ship"`.
 *   - `at`:    ISO 8601 timestamp of the transition (free-form; only
 *              stored so downstream tooling can render an audit trail).
 */
export interface PhaseTransition {
    phase: string;
    at: string;
}
/**
 * Outcome-bearing fragments of the session state, as recorded by the
 * upstream skills (`forge-review`, `forge-test`, `forge-ship`). Each
 * field is optional because the session may have stopped short — for
 * example an aborted task never reaches `ship`.
 */
export interface SessionPhaseHistory {
    phases: PhaseTransition[];
    reviewResult?: "pass" | "fail";
    testResult?: "pass" | "fail";
    shipResult?: "shipped" | "blocked";
}
/**
 * Session-level metadata required to address the generated episode.
 * `date` must be an ISO date (`YYYY-MM-DD`) so `generateEpisodeId`
 * produces a stable `ep-YYYY-MM-DD-NNN` identifier.
 */
export interface SessionMeta {
    topic: string;
    tier: EpisodeTier;
    date: string;
}
/**
 * Full pattern draft + traceability information for a single upgrade
 * suggestion. The driver surfaces `draft` to the user for confirmation;
 * `sourceEpisodes` lets the UI explain which episodes triggered the
 * suggestion; `clusterKey` is the deterministic dedup key returned by
 * {@link findUpgradableEpisodes}.
 */
export interface PatternUpgradeDraft {
    clusterKey: string;
    sourceEpisodes: Episode[];
    draft: Pattern;
}
/**
 * Prompt-shape declaration the learn skill uses to drive the final
 * user interaction. The rating field is intentionally always optional
 * (Requirement 7.15); only `failure` outcomes require a short free-form
 * reason so we capture useful context without taxing successful flows.
 */
export interface LearnPromptConfig {
    outcome: EpisodeOutcome;
    requireUserRating: boolean;
    requireFailureReason: boolean;
}
/**
 * Build a schema_version=2 {@link Episode} from the session's phase
 * history and the user-supplied narrative (`situation`, `lesson`).
 *
 * Outcome inference follows the mapping in the design doc:
 *   - `shipResult === "shipped"` → `"success"`
 *   - `shipResult === "blocked"` OR `testResult === "fail"` → `"partial"`
 *   - `reviewResult === "fail"` without a subsequent recovery → `"failure"`
 *   - any other state → `"success"`
 *
 * Skill attribution scans `phaseHistory.phases` from the end, skipping
 * terminal (`completed`) and current-skill (`learn`) markers, and
 * prefixes the resulting phase with `forge-`. When the history has no
 * attributable phase we fall back to `forge-learn`.
 *
 * The function is pure: same inputs always yield the same episode.
 *
 * **Validates: Requirements 7.9**
 */
export declare function buildEpisodeFromSession(meta: SessionMeta, phaseHistory: SessionPhaseHistory, situation: string, lesson: string, sequenceInDay: number): Episode;
/**
 * Result of {@link archivePatternByName}: the updated active list plus
 * every pattern that is now considered archived. Archival is a move,
 * not a delete — both the original non-matching entries and the freshly
 * archived entry survive somewhere in the return value.
 */
export interface ArchivePatternResult {
    active: Pattern[];
    archived: Pattern[];
}
/**
 * Move the pattern whose name matches `name` (case-insensitive) from
 * the active list into the archived list. When no matching pattern is
 * found the result is a pass-through: `active` equals the input and
 * `archived` is empty.
 *
 * Only the first match is moved — pattern names are expected to be
 * unique within `knowledge/instincts.md`, and if they are not the
 * duplicates are left in the active list so the user can resolve the
 * ambiguity manually.
 *
 * Pure function: the input arrays are never mutated.
 *
 * **Validates: Requirements 7.10, 7.14**
 */
export declare function archivePatternByName(patterns: Pattern[], name: string): ArchivePatternResult;
/**
 * Detect episode clusters that warrant a new instinct pattern and
 * promote each cluster's partial draft into a full {@link Pattern}
 * ready for confirmation + append.
 *
 * Under the hood this calls {@link findUpgradableEpisodes} with the
 * default window (60 days) and minimum occurrence count (3). Each
 * resulting cluster is enriched with a deterministic `pattern_id` of
 * the form `pat-YYYY-MM-DD-NNN`, where `NNN` is the 1-based index of
 * the cluster in the suggestion list.
 *
 * Any missing fields on the upstream `Partial<Pattern>` draft fall back
 * to the Beta(α=2, β=2) prior mean and the default decay threshold so
 * the returned object satisfies the full `Pattern` contract.
 *
 * Pure function.
 *
 * **Validates: Requirements 7.11**
 */
export declare function buildPatternUpgradeDrafts(episodes: Episode[], patterns: Pattern[], now: Date): PatternUpgradeDraft[];
/**
 * Decide what the learn skill should ask the user for based on the
 * inferred episode outcome.
 *
 * Rules:
 *   - `requireUserRating` is always `false`. A 1-10 rating is never
 *     mandatory, regardless of outcome, because most sessions do not
 *     benefit from the number and forcing it produces noise.
 *   - `requireFailureReason` is `true` only when the outcome is
 *     `"failure"`. For a failure we still want a short free-form reason
 *     so the lesson is anchored in reality — but we do not demand a
 *     numeric rating.
 *
 * Pure function.
 *
 * **Validates: Requirements 7.15**
 */
export declare function getLearnPromptConfig(outcome: EpisodeOutcome): LearnPromptConfig;
/**
 * Filesystem contract required by {@link generateEvolutionReport}.
 *
 *   - `listFilesUnder(dir)` — recursively enumerate every file below
 *     `dir`. Paths may be absolute or relative; the aggregator sorts
 *     them for deterministic output so only stable ordering is
 *     required. Directories outside the caller-supplied roots are
 *     never visited.
 *   - `readFile(path)`       — return the UTF-8 content of a file.
 *                              Binary files are tolerated because
 *                              {@link parseEvolutionMarkers} ignores
 *                              lines that fail to match the marker
 *                              regex.
 *   - `exists(path)`         — true when the path resolves to a file
 *                              or directory the driver can list /
 *                              read. Used to silently skip missing
 *                              roots (fresh installs with no reviews
 *                              yet).
 *
 * The adapter is free to implement these however it pleases
 * (`readdirSync` + recursion, `fast-glob`, an in-memory Map); the
 * aggregator never inspects stat modes or mtimes.
 */
export interface EvolutionReportFs {
    listFilesUnder(dir: string): string[];
    readFile(path: string): string;
    exists(path: string): boolean;
}
/**
 * Walk the reviews / progress / findings directories under `forgeRoot`,
 * collect every Evolution marker they contain, and aggregate the
 * markers into an {@link EvolutionReport}.
 *
 * Behaviour:
 *   - Each root is consulted through `fs.exists` first so missing
 *     directories (typical for a fresh project) do not raise errors.
 *   - The `.forge/archive/**` subtree is skipped; archived sessions
 *     represent historical snapshots and re-surfacing their markers
 *     would contradict the "current state only" contract (Requirement
 *     8.15).
 *   - Per-file markers are produced by {@link parseEvolutionMarkers}
 *     and grouped by file path; the path is preserved so later
 *     rendering can cite it.
 *   - {@link aggregateEvolutionMarkers} is called with the shared
 *     `skillsRegistry` so unknown targets land in `orphans`.
 *
 * This is the driver seam the learn skill plugs into after its other
 * wrap-up steps; the file is written to `.forge/knowledge/evolution-
 * report.md` (open zone, always overwritten) by the caller using
 * {@link renderEvolutionReport}.
 *
 * **Validates: Requirements 8.9, 8.11, 8.14, 8.15**
 */
export declare function generateEvolutionReport(fs: EvolutionReportFs, forgeRoot: string, skillsRegistry: string[], now?: Date): EvolutionReport;
/**
 * Render an {@link EvolutionReport} as the markdown content written to
 * `.forge/knowledge/evolution-report.md`.
 *
 * Layout (frozen by integration tests):
 *
 * ```markdown
 * ---
 * generated_at: "<ISO timestamp>"
 * total_markers: <n>
 * ---
 *
 * # Evolution Report
 *
 * ## 🚨 建议走 ADR 的高频进化点
 * ### forge-build (3 条)
 * - 来源：ep-..., ep-...
 * - 建议运行 `/forge decide` 评估是否升级为 ADR
 *
 * ## 一般进化候选
 * ### forge-ship (1 条)
 * - 来源：ep-...
 *
 * ## Orphan 标记
 * - `.forge/reviews/xxx.md:42` target `forge-nonexistent`
 * ```
 *
 * Empty sections are elided to keep the report short on quiet days,
 * except for the top-level header + frontmatter which are always
 * emitted so downstream tooling can rely on the shape.
 */
export declare function renderEvolutionReport(report: EvolutionReport): string;
