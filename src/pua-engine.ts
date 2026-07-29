/**
 * PUA Quality Engine — core types, constants and runtime logic.
 *
 * This file is now a re-export barrel. The implementations live in the
 * `pua-engine/` submodules (god-file split, following the `context-budget/`
 * precedent). All public exports are re-exported here so existing
 * `import { … } from "../pua-engine.js"` callers keep working unchanged.
 *
 * Design reference: pua-quality-engine § pua-engine.ts
 * **Validates: Requirements 1.1, 2.1, 3.1, 4.9, 4.10**
 */

// Constants — failure detection thresholds
// Functions — failure-pattern detection + stall response
export {
  detectFailurePattern,
  getStallResponse,
  MAX_SUMMARY_HISTORY,
  SPINNING_JACCARD_THRESHOLD,
} from "./pua-engine/failure-detection.js";
// Functions — pressure prompt builder
export { buildPressurePrompt } from "./pua-engine/pressure-prompt.js";
// Functions — pressure-level escalation + methodology routing
export {
  advanceMethodology,
  determinePressureLevel,
  getMethodologyChain,
  selectMethodology,
} from "./pua-engine/pressure-routing.js";
// Constants — behavioral constraints + methodology descriptions
export {
  FAILURE_PATTERN_COUNTERS,
  METHODOLOGY_DESCRIPTIONS,
  PROACTIVE_INITIATIVE_CHECKLIST,
  PROACTIVITY_GUIDANCE,
  SEVEN_POINT_CHECKLIST,
  THREE_RED_LINES,
  UNIVERSAL_METHODOLOGY,
} from "./pua-engine/prompt-content.js";
// Types
export type {
  FailurePattern,
  Methodology,
  PressureLevel,
  PuaContext,
  StallResponse,
  TaskType,
} from "./pua-engine/types.js";
