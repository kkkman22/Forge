/**
 * State machine module barrel export.
 * @public
 */

export { loadStateMachineDefinition } from "./loader.js";
export { deriveStatePropertyTests } from "./property-derivation.js";
export type {
  InvariantSpec,
  StateMachineDefinition,
  StateSpec,
  TransitionSpec,
  ValidationEntry,
  ValidationReport,
} from "./types.js";
export { validateDefinition } from "./validator.js";
// Pack-aware plural loader (pms-pack-v1 R4.5.5) — spec domain-knowledge-threading REQ-2
export { loadStateMachineDefinitions } from "./registry.js";
export type {
  LoadedStateMachine,
  LoadStateMachineDefinitionsResult,
} from "./registry.js";
