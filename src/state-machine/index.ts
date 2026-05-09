/**
 * State machine module barrel export.
 * @public
 */

export type {
  StateSpec,
  TransitionSpec,
  InvariantSpec,
  StateMachineDefinition,
  ValidationReport,
  ValidationEntry,
} from "./types.js";

export { loadStateMachineDefinition } from "./loader.js";
export { validateDefinition } from "./validator.js";
export { deriveStatePropertyTests } from "./property-derivation.js";
