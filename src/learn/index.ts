/**
 * Learn sub-modules — barrel export for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./learn.js"` continues to work unchanged.
 */

// Feedback analysis (Property 24)
export {
  analyzeSkillFeedback,
  type CommandStats,
  crossValidateFailures,
  FAILURE_RATE_ALERT_THRESHOLD,
  type FeedbackAnalysis,
  type SkillFeedbackEntry,
} from "./feedback-analysis.js";
// Validation (Property 13, Property 14)
export {
  DEFAULT_KNOWLEDGE_LIMIT,
  generateKnowledgeDocument,
  type InstinctPattern,
  isValidCalendarDate,
  type KnowledgeBaseState,
  type KnowledgeDocument,
  // Types are re-exported for downstream consumers
  type KnowledgeFrontmatter,
  MAX_CONFIDENCE,
  type MaintenanceResult,
  MIN_CONFIDENCE,
  maintainKnowledgeBase,
  sanitizeDate,
  validateKnowledgeFrontmatter,
} from "./validation.js";
