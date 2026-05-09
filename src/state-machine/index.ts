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
