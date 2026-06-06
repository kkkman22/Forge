/**
 * Decide engine sub-modules — barrel export for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./decide.js"` continues to work unchanged.
 */

// Types
export type {
  AdrOverride,
  AdrSupersessionUpdate,
  CriteriaScreenItem,
  CriticOutput,
  DecideContext,
  DecideGlossaryConflict,
  FinalizeAdrInput,
  FinalizeAdrOutput,
  InlineNoteAppender,
  StatusFileContext,
  SubagentConfig,
  TeamMember,
} from "./types.js";

// UI detection
export {
  descriptionHasInteractionFlows,
  descriptionHasUIKeywords,
  filesHaveUIExtensions,
  involvesUIChanges,
} from "./ui-detection.js";

// Orchestration
export {
  buildDecideCriticInvocation,
  buildDecideRound1Subagents,
  getDecideSubagents,
  getDecideTeamMembers,
  resolveDecideStatus,
  runCriteriaScreen,
} from "./orchestration.js";

// ADR lifecycle
export {
  finalizeAdr,
  generateDecisionPath,
  renderAdrFileContent,
  toKebabCase,
} from "./adr.js";

// Glossary + overrides
export {
  appendInlineNote,
  applyAdrOverride,
  checkDecideGlossaryConflicts,
  parseAdrOverride,
  renderDecideGlossaryConflictPrompt,
  renderInlineDecisionNote,
  resolveUpstreamFile,
} from "./glossary-override.js";
