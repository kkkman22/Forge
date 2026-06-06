/**
 * Grill Decision Tree — re-exports from sub-modules for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./grill.js"` continues to work unchanged.
 *
 * Sub-modules (extracted for independent testability):
 *   - grill/types.ts     — Type definitions and constants
 *   - grill/tree.ts      — Tree generation, question selection, answer application
 *   - grill/glossary.ts  — Glossary candidate extraction and conflict detection
 *   - grill/findings.ts  — Findings rendering, parsing, and resume support
 */

// Types
export type {
  DecisionCategory,
  DecisionNodeStatus,
  DecisionTreeNode,
  DecisionTree,
  GlossaryConflict,
  GrillAbandonedInput,
  GrillConflictCheckResult,
} from "./grill/index.js";

// Functions — named re-exports for contract test discoverability
export {
  applyAnswer,
  buildGrillAbandonedContext,
  checkGrillGlossaryConflicts,
  extractNewGlossaryCandidates,
  findMentionedTerms,
  generateDecisionTree,
  isComplete,
  parseGrillFindings,
  renderGrillConflictPrompt,
  renderGrillFindings,
  resumeGrillFromFindings,
  selectNextQuestion,
} from "./grill/index.js";
