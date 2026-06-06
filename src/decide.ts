/**
 * Decide engine — re-exports from sub-modules for backward compatibility.
 *
 * All public exports from sub-modules are re-exported here so existing
 * `import { ... } from "./decide.js"` continues to work unchanged.
 *
 * Sub-modules (extracted for independent testability):
 *   - decide/types.ts            — Type definitions
 *   - decide/ui-detection.ts     — UI change detection
 *   - decide/orchestration.ts    — Subagent team building and Round 1/2
 *   - decide/adr.ts              — ADR lifecycle (render, finalize)
 *   - decide/glossary-override.ts — Glossary conflicts + ADR user overrides
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
} from "./decide/index.js";

// Functions — named re-exports for contract test discoverability
export {
  appendInlineNote,
  applyAdrOverride,
  buildDecideCriticInvocation,
  buildDecideRound1Subagents,
  checkDecideGlossaryConflicts,
  descriptionHasInteractionFlows,
  descriptionHasUIKeywords,
  filesHaveUIExtensions,
  finalizeAdr,
  generateDecisionPath,
  getDecideSubagents,
  getDecideTeamMembers,
  involvesUIChanges,
  parseAdrOverride,
  renderAdrFileContent,
  renderDecideGlossaryConflictPrompt,
  renderInlineDecisionNote,
  resolveDecideStatus,
  resolveUpstreamFile,
  runCriteriaScreen,
  toKebabCase,
} from "./decide/index.js";
