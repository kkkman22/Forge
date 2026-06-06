/**
 * Grill decision tree sub-modules — barrel export for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./grill.js"` continues to work unchanged.
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
} from "./types.js";

// Tree generation and operations
export {
  applyAnswer,
  findMentionedTerms,
  generateDecisionTree,
  isComplete,
  selectNextQuestion,
} from "./tree.js";

// Glossary integration
export {
  checkGrillGlossaryConflicts,
  extractNewGlossaryCandidates,
  renderGrillConflictPrompt,
} from "./glossary.js";

// Findings rendering and parsing
export {
  buildGrillAbandonedContext,
  parseGrillFindings,
  renderGrillFindings,
  resumeGrillFromFindings,
} from "./findings.js";
