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
import { generateEpisodeId } from "./episode.js";
import { aggregateEvolutionMarkers, parseEvolutionMarkers, } from "./evolution-marker.js";
import { findStaleterms } from "./glossary.js";
import { DEFAULT_EXTRACTION_RULES, extractCandidates, filterCandidates, } from "./glossary-extractor.js";
export { renderGlossaryConflictPrompt, runGlossaryCheck } from "./glossary-hook.js";
import { findUpgradableEpisodes } from "./pattern-stats.js";
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
export const MIN_CONFIDENCE = 0.3;
export const MAX_CONFIDENCE = 0.9;
export const DEFAULT_KNOWLEDGE_LIMIT = 20;
// ---------------------------------------------------------------------------
// Date validation (shared logic)
// ---------------------------------------------------------------------------
/**
 * Validate that a date string is a real calendar date in YYYY-MM-DD format
 * using a round-trip check through Date.UTC.
 *
 * new Date() silently overflows invalid dates (e.g. Feb 30 → Mar 2),
 * so we parse → construct → compare to catch these cases.
 *
 * Returns true if the date is valid, false otherwise.
 */
export function isValidCalendarDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return false;
    }
    const [yearStr, monthStr, dayStr] = date.split("-");
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const day = Number.parseInt(dayStr, 10);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return (!Number.isNaN(parsed.getTime()) &&
        parsed.getUTCFullYear() === year &&
        parsed.getUTCMonth() + 1 === month &&
        parsed.getUTCDate() === day);
}
/**
 * Sanitize a date string: return it unchanged if valid, or fallback to "1970-01-01".
 */
function sanitizeDate(date) {
    return isValidCalendarDate(date) ? date : "1970-01-01";
}
// ---------------------------------------------------------------------------
// Knowledge document validation (Property 13)
// ---------------------------------------------------------------------------
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
export function validateKnowledgeFrontmatter(frontmatter) {
    const errors = [];
    if (!frontmatter.title || frontmatter.title.trim().length === 0) {
        errors.push("title 字段缺失或为空");
    }
    if (!frontmatter.tags || !Array.isArray(frontmatter.tags) || frontmatter.tags.length === 0) {
        errors.push("tags 字段缺失或为空数组");
    }
    if (!frontmatter.date || !/^\d{4}-\d{2}-\d{2}$/.test(frontmatter.date)) {
        errors.push("date 字段缺失或格式不正确（需要 YYYY-MM-DD）");
    }
    else if (!isValidCalendarDate(frontmatter.date)) {
        errors.push(`date 字段值无效：${frontmatter.date} 不是合法日期`);
    }
    if (frontmatter.confidence === undefined ||
        frontmatter.confidence === null ||
        typeof frontmatter.confidence !== "number" ||
        frontmatter.confidence < MIN_CONFIDENCE ||
        frontmatter.confidence > MAX_CONFIDENCE) {
        errors.push(`confidence 字段无效：需要 ${MIN_CONFIDENCE}-${MAX_CONFIDENCE} 范围内的数值`);
    }
    return {
        valid: errors.length === 0,
        errors,
    };
}
/**
 * Generate a knowledge document with valid frontmatter.
 *
 * Clamps confidence to [0.3, 0.9] range, validates the date via round-trip
 * check, and ensures all required fields are present.
 */
export function generateKnowledgeDocument(title, tags, date, confidence, body) {
    // Clamp confidence to valid range
    const clampedConfidence = Math.max(MIN_CONFIDENCE, Math.min(MAX_CONFIDENCE, confidence));
    // Ensure tags is non-empty
    const safeTags = tags.length > 0 ? tags : ["general"];
    // Ensure title is non-empty
    const safeTitle = title.trim().length > 0 ? title.trim() : "Untitled";
    // Validate date via round-trip check (same logic as validateKnowledgeFrontmatter)
    const safeDate = sanitizeDate(date);
    return {
        frontmatter: {
            title: safeTitle,
            tags: safeTags,
            date: safeDate,
            confidence: clampedConfidence,
        },
        body,
    };
}
// ---------------------------------------------------------------------------
// Knowledge base maintenance (Property 14)
// ---------------------------------------------------------------------------
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
export function maintainKnowledgeBase(state) {
    const removedDocuments = [];
    const removedPatterns = [];
    // --- Invariant 1: Document count ≤ limit ---
    // Sort by confidence ascending (lowest first) for removal priority
    const documents = [...state.documents].sort((a, b) => a.frontmatter.confidence - b.frontmatter.confidence);
    while (documents.length > state.limit) {
        // biome-ignore lint/style/noNonNullAssertion: shift() is safe here — loop guard ensures length > 0
        const removed = documents.shift();
        removedDocuments.push(removed);
    }
    // --- Invariant 2: No instinct patterns with confidence < MIN_CONFIDENCE ---
    const keptPatterns = [];
    for (const pattern of state.instinctPatterns) {
        if (pattern.confidenceScore < MIN_CONFIDENCE) {
            removedPatterns.push(pattern);
        }
        else {
            keptPatterns.push(pattern);
        }
    }
    return {
        documents,
        instinctPatterns: keptPatterns,
        removedDocuments,
        removedPatterns,
    };
}
/** Failure rate threshold above which a command is flagged for attention. */
export const FAILURE_RATE_ALERT_THRESHOLD = 0.3;
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
export function analyzeSkillFeedback(entries) {
    if (entries.length === 0) {
        return { commandStats: [], alertCommands: [], totalEntries: 0 };
    }
    // Group by command
    const groups = new Map();
    for (const entry of entries) {
        const key = entry.command;
        if (!groups.has(key)) {
            groups.set(key, []);
        }
        groups.get(key)?.push(entry);
    }
    const commandStats = [];
    for (const [command, commandEntries] of groups) {
        const totalRuns = commandEntries.length;
        const successCount = commandEntries.filter((e) => e.success).length;
        const failureCount = totalRuns - successCount;
        const successRate = totalRuns > 0 ? successCount / totalRuns : 0;
        // Average duration (only count entries with known duration > 0)
        const durationsWithValue = commandEntries.map((e) => e.durationSeconds).filter((d) => d > 0);
        const avgDurationSeconds = durationsWithValue.length > 0
            ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length
            : 0;
        // Aggregate failure reasons
        const reasonCounts = new Map();
        for (const entry of commandEntries) {
            if (!entry.success && entry.failureReason.trim().length > 0) {
                const reason = entry.failureReason.trim();
                reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
            }
        }
        const topFailureReasons = [...reasonCounts.entries()]
            .map(([reason, count]) => ({ reason, count }))
            .sort((a, b) => b.count - a.count);
        commandStats.push({
            command,
            totalRuns,
            successCount,
            failureCount,
            successRate,
            avgDurationSeconds,
            topFailureReasons,
        });
    }
    // Sort by failure rate descending (worst first)
    commandStats.sort((a, b) => a.successRate - b.successRate);
    // Flag commands above alert threshold
    const alertCommands = commandStats
        .filter((s) => s.totalRuns >= 2 && 1 - s.successRate >= FAILURE_RATE_ALERT_THRESHOLD)
        .map((s) => s.command);
    return {
        commandStats,
        alertCommands,
        totalEntries: entries.length,
    };
}
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
export function crossValidateFailures(feedbackReasons, knownFailureDescriptions) {
    if (feedbackReasons.length === 0 || knownFailureDescriptions.length === 0) {
        return [];
    }
    const knownLower = knownFailureDescriptions.map((d) => d.toLowerCase());
    return feedbackReasons.filter((reason) => {
        const reasonLower = reason.toLowerCase();
        return knownLower.some((known) => known.includes(reasonLower) || reasonLower.includes(known));
    });
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
export function extractSessionTermCandidates(sessionData, glossary) {
    const chunks = [];
    const pushAll = (values) => {
        if (values === undefined)
            return;
        for (const value of values) {
            if (value.length > 0)
                chunks.push(value);
        }
    };
    pushAll(sessionData.decisions);
    pushAll(sessionData.findings);
    pushAll(sessionData.reviews);
    pushAll(sessionData.progress);
    pushAll(sessionData.sessions);
    if (chunks.length === 0)
        return [];
    const text = chunks.join("\n");
    const knownNames = collectGlossaryNamesAndAliases(glossary);
    const raw = extractCandidates(text, knownNames);
    return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}
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
export function buildNewGlossaryTerm(candidate, now, sessionFile) {
    const definition = candidate.context.slice(0, 200).trim();
    const entry = {
        term: candidate.term,
        definition,
        last_updated: toIsoDate(now),
    };
    if (sessionFile !== undefined && sessionFile.trim().length > 0) {
        entry.source_session = sessionFile.trim();
    }
    return entry;
}
/**
 * Collect every canonical term and alias from a glossary into a single
 * string array. Blank entries are filtered out so the extractor's
 * "existing terms" set is clean.
 */
function collectGlossaryNamesAndAliases(glossary) {
    const out = [];
    for (const term of glossary.terms) {
        if (term.term.trim().length > 0)
            out.push(term.term);
        if (term.aliases !== undefined) {
            for (const alias of term.aliases) {
                if (alias.trim().length > 0)
                    out.push(alias);
            }
        }
    }
    return out;
}
/**
 * Format a `Date` as an ISO date (YYYY-MM-DD) in UTC. Using UTC keeps
 * output deterministic across developer timezones.
 */
function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}
// ---------------------------------------------------------------------------
// Stale glossary-term archival (Requirement 1.11)
// ---------------------------------------------------------------------------
/** Default maximum age, in days, before an active term is considered stale. */
const DEFAULT_STALE_TERM_MAX_AGE_DAYS = 30;
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
export function proposeStaleTerms(glossary, now, maxAgeDays = DEFAULT_STALE_TERM_MAX_AGE_DAYS) {
    const staleTerms = findStaleterms(glossary, now, maxAgeDays);
    if (staleTerms.length === 0) {
        return { staleTerms, prompt: "" };
    }
    const names = staleTerms.map((t) => t.term).join(", ");
    const prompt = `发现 ${staleTerms.length} 个陈旧术语（>${maxAgeDays} 天未更新），建议归档：${names}`;
    return { staleTerms, prompt };
}
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/**
 * Phase tokens that should never be used as the episode's attributed
 * skill. `completed` is a terminal marker and `learn` is the current
 * skill, so both are skipped when walking the phase history.
 */
const NON_ATTRIBUTABLE_PHASES = new Set(["completed", "learn"]);
/** Fallback skill used when the phase history attributes no usable phase. */
const DEFAULT_EPISODE_SKILL = "forge-learn";
/**
 * Prior strength for the Beta-mean confidence used when bootstrapping a
 * fresh pattern from an upgrade draft. Kept local so we do not re-import
 * the pattern-stats internals.
 */
const PATTERN_DRAFT_BETA_ALPHA = 2;
const PATTERN_DRAFT_BETA_BETA = 2;
const PATTERN_DRAFT_DEFAULT_DECAY = 0.5;
// ---------------------------------------------------------------------------
// buildEpisodeFromSession (Requirement 7.9)
// ---------------------------------------------------------------------------
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
export function buildEpisodeFromSession(meta, phaseHistory, situation, lesson, sequenceInDay) {
    return {
        schema_version: 2,
        id: generateEpisodeId(meta.date, sequenceInDay),
        date: meta.date,
        skill: deriveSkillFromPhaseHistory(phaseHistory.phases),
        tier: meta.tier,
        situation,
        lesson,
        outcome: inferOutcomeFromPhaseHistory(phaseHistory),
        body: "",
    };
}
/**
 * Infer the episode outcome from the session's review/test/ship signals.
 * Exported as an internal helper only; callers should route through
 * {@link buildEpisodeFromSession} so the logic stays in one place.
 */
function inferOutcomeFromPhaseHistory(history) {
    if (history.shipResult === "shipped")
        return "success";
    if (history.shipResult === "blocked")
        return "partial";
    if (history.testResult === "fail")
        return "partial";
    if (history.reviewResult === "fail")
        return "failure";
    return "success";
}
/**
 * Walk the phase history from the end and return the first phase that
 * is neither `completed` nor `learn`, prefixed with `forge-`. When the
 * history is empty or only contains non-attributable phases, return the
 * default skill.
 */
function deriveSkillFromPhaseHistory(phases) {
    for (let i = phases.length - 1; i >= 0; i -= 1) {
        const phase = phases[i].phase.trim();
        if (phase.length === 0)
            continue;
        if (NON_ATTRIBUTABLE_PHASES.has(phase))
            continue;
        return phase.startsWith("forge-") ? phase : `forge-${phase}`;
    }
    return DEFAULT_EPISODE_SKILL;
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
export function archivePatternByName(patterns, name) {
    const needle = name.trim().toLowerCase();
    if (needle.length === 0) {
        return { active: [...patterns], archived: [] };
    }
    const active = [];
    const archived = [];
    let moved = false;
    for (const pattern of patterns) {
        if (!moved && pattern.name.trim().toLowerCase() === needle) {
            archived.push(pattern);
            moved = true;
            continue;
        }
        active.push(pattern);
    }
    return { active, archived };
}
// ---------------------------------------------------------------------------
// buildPatternUpgradeDrafts (Requirement 7.11)
// ---------------------------------------------------------------------------
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
export function buildPatternUpgradeDrafts(episodes, patterns, now) {
    const suggestions = findUpgradableEpisodes(episodes, patterns, now);
    if (suggestions.length === 0)
        return [];
    const dateStr = toIsoDate(now);
    const priorMean = PATTERN_DRAFT_BETA_ALPHA / (PATTERN_DRAFT_BETA_ALPHA + PATTERN_DRAFT_BETA_BETA);
    return suggestions.map((suggestion, index) => {
        const partial = suggestion.patternDraft;
        const pattern = {
            pattern_id: `pat-${dateStr}-${String(index + 1).padStart(3, "0")}`,
            name: partial.name ?? `Recurring pattern ${suggestion.clusterKey}`,
            confidence: partial.confidence ?? priorMean,
            applications: partial.applications ?? 0,
            successes: partial.successes ?? 0,
            failures: partial.failures ?? 0,
            last_triggered: partial.last_triggered ?? dateStr,
            decay_threshold: partial.decay_threshold ?? PATTERN_DRAFT_DEFAULT_DECAY,
            tags: partial.tags ?? [],
            body: partial.body ?? "",
        };
        return {
            clusterKey: suggestion.clusterKey,
            sourceEpisodes: suggestion.episodes,
            draft: pattern,
        };
    });
}
// ---------------------------------------------------------------------------
// getLearnPromptConfig (Requirement 7.15)
// ---------------------------------------------------------------------------
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
export function getLearnPromptConfig(outcome) {
    return {
        outcome,
        requireUserRating: false,
        requireFailureReason: outcome === "failure",
    };
}
/** Roots scanned by {@link generateEvolutionReport}, relative to `forgeRoot`. */
const EVOLUTION_MARKER_ROOTS = ["reviews", "progress", "findings"];
/** Archive segment that must never contribute markers to the report. */
const EVOLUTION_ARCHIVE_SEGMENT = "/archive/";
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
export function generateEvolutionReport(fs, forgeRoot, skillsRegistry, now = new Date()) {
    const markersByFile = new Map();
    for (const segment of EVOLUTION_MARKER_ROOTS) {
        const root = joinPath(forgeRoot, segment);
        if (!fs.exists(root))
            continue;
        const files = fs.listFilesUnder(root);
        for (const file of files) {
            if (file.includes(EVOLUTION_ARCHIVE_SEGMENT))
                continue;
            if (!isMarkdownPath(file))
                continue;
            let content;
            try {
                content = fs.readFile(file);
            }
            catch {
                // Deliberately swallow read errors so a single unreadable
                // file never aborts the aggregation (Requirement 8.12: write
                // failures degrade to warnings; by symmetry, read failures
                // here are non-fatal as well).
                continue;
            }
            const markers = parseEvolutionMarkers(content, file);
            if (markers.length === 0)
                continue;
            markersByFile.set(file, markers);
        }
    }
    return aggregateEvolutionMarkers(markersByFile, skillsRegistry, now);
}
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
export function renderEvolutionReport(report) {
    const lines = [];
    lines.push("---");
    lines.push(`generated_at: "${report.generatedAt}"`);
    lines.push(`total_markers: ${report.totalMarkers}`);
    lines.push("---");
    lines.push("");
    lines.push("# Evolution Report");
    lines.push("");
    const highlighted = report.bySkill.filter((s) => s.suggestAdr);
    const normal = report.bySkill.filter((s) => !s.suggestAdr);
    if (highlighted.length > 0) {
        lines.push("## 🚨 建议走 ADR 的高频进化点");
        lines.push("");
        for (const entry of highlighted) {
            appendBySkillSection(lines, entry, /* highlight */ true);
        }
    }
    if (normal.length > 0) {
        lines.push("## 一般进化候选");
        lines.push("");
        for (const entry of normal) {
            appendBySkillSection(lines, entry, /* highlight */ false);
        }
    }
    if (report.orphans.length > 0) {
        lines.push("## Orphan 标记");
        lines.push("");
        for (const marker of report.orphans) {
            const location = `${marker.filePath}:${marker.lineNumber}`;
            lines.push(`- \`${location}\` target \`${marker.target}\`（source: ${marker.source}）`);
        }
        lines.push("");
    }
    if (highlighted.length === 0 && normal.length === 0 && report.orphans.length === 0) {
        lines.push("_没有检测到 Evolution 标记。_");
        lines.push("");
    }
    // Ensure the file always ends with a single trailing newline.
    return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}
// ---------------------------------------------------------------------------
// Helpers (internal)
// ---------------------------------------------------------------------------
/**
 * Append a single `### <skill>` block to the growing report output. We
 * keep the layout identical between the highlight and normal sections
 * so reviewers only have to learn one shape; the only difference is
 * that the highlighted block spells out the ADR suggestion.
 */
function appendBySkillSection(lines, entry, highlight) {
    lines.push(`### ${entry.targetSkill} (${entry.markerCount} 条)`);
    if (entry.sources.length > 0) {
        lines.push(`- 来源：${entry.sources.join(", ")}`);
    }
    if (highlight) {
        lines.push("- 建议运行 `/forge decide` 走 ADR 三问筛");
    }
    lines.push("");
}
/**
 * Minimal path join that tolerates both POSIX and mixed slash input.
 * We intentionally avoid importing `node:path` so the function can be
 * used in adapters that supply pre-normalised paths.
 */
function joinPath(base, segment) {
    if (base === "")
        return segment;
    const trimmedBase = base.replace(/[/\\]+$/, "");
    const trimmedSegment = segment.replace(/^[/\\]+/, "");
    return `${trimmedBase}/${trimmedSegment}`;
}
/**
 * Treat `.md` / `.markdown` files as potentially marker-bearing. Other
 * extensions are ignored so binary artefacts inside reviews/ (for
 * example screenshots committed alongside a report) do not slow down
 * aggregation.
 */
function isMarkdownPath(path) {
    const lower = path.toLowerCase();
    return lower.endsWith(".md") || lower.endsWith(".markdown");
}
//# sourceMappingURL=learn.js.map