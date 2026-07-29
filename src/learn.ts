/**
 * Learn engine — core logic extracted from forge-learn/SKILL.md.
 *
 * This file is now a re-export barrel. The implementations live in the
 * `learn/` submodules (god-file split, following the `context-budget/`
 * + `pua-engine/` + `ship-gates/` precedent). All public exports are
 * re-exported here so existing `import { … } from "./learn.js"` callers
 * — including the `src/index.ts` barrel — keep working unchanged.
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
 *
 * Sub-modules (extracted for independent testability):
 *   - learn/validation.ts        — date validation, frontmatter validation, knowledge base maintenance
 *   - learn/feedback-analysis.ts — skill feedback analysis and cross-validation
 *   - learn/glossary-writeback.ts — glossary writeback + stale-term archival
 *   - learn/episode-lifecycle.ts — episode synthesis + pattern lifecycle
 *   - learn/evolution-report.ts  — evolution-marker report aggregation
 */

// ---------------------------------------------------------------------------
// Re-export from extracted sub-modules
// ---------------------------------------------------------------------------

export { renderGlossaryConflictPrompt, runGlossaryCheck } from "./glossary-hook.js";
// Episode / pattern lifecycle integration (Requirements 7.9, 7.10, 7.11, 7.15)
export {
  type ArchivePatternResult,
  archivePatternByName,
  buildEpisodeFromSession,
  buildPatternUpgradeDrafts,
  getLearnPromptConfig,
  type LearnPromptConfig,
  type PatternUpgradeDraft,
  type PhaseTransition,
  type SessionMeta,
  type SessionPhaseHistory,
} from "./learn/episode-lifecycle.js";
// Evolution report aggregation (Requirements 8.9, 8.11, 8.14, 8.15)
export {
  type EvolutionReportFs,
  generateEvolutionReport,
  renderEvolutionReport,
} from "./learn/evolution-report.js";
export {
  analyzeSkillFeedback,
  type CommandStats,
  crossValidateFailures,
  FAILURE_RATE_ALERT_THRESHOLD,
  type FeedbackAnalysis,
  type SkillFeedbackEntry,
} from "./learn/feedback-analysis.js";
// Glossary writeback (Requirement 1.6) + stale-term archival (Requirement 1.11)
export {
  buildNewGlossaryTerm,
  extractSessionTermCandidates,
  type ProposeStaleTermsResult,
  proposeStaleTerms,
  toIsoDate,
} from "./learn/glossary-writeback.js";
export {
  DEFAULT_KNOWLEDGE_LIMIT,
  generateKnowledgeDocument,
  type InstinctPattern,
  isValidCalendarDate,
  type KnowledgeBaseState,
  type KnowledgeDocument,
  type KnowledgeFrontmatter,
  MAX_CONFIDENCE,
  type MaintenanceResult,
  MIN_CONFIDENCE,
  maintainKnowledgeBase,
  validateKnowledgeFrontmatter,
} from "./learn/validation.js";
// P3-2: SessionData moved to session-types.ts to break the learn ↔
// glossary-hook barrel cycle. Re-exported here for backward compatibility.
export type { SessionData } from "./session-types.js";
