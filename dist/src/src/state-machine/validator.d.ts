/**
 * State machine definition validator.
 *
 * Checks a StateMachineDefinition against rules ST001-ST005:
 *   - ST001: initial state exists in states list
 *   - ST002: all transition from/to reference declared states
 *   - ST003: terminal states have no outgoing transitions
 *   - ST004: all non-terminal states reachable from initial (warning)
 *   - ST005: no duplicate {from, event} combinations
 *
 * @public
 */
import type { StateMachineDefinition, ValidationReport } from "./types.js";
/**
 * Validate a state machine definition.
 *
 * @param def - The definition to validate
 * @returns ValidationReport with errors (blocking) and warnings (non-blocking)
 *
 * @example
 * ```ts
 * const report = validateDefinition(def);
 * if (!report.valid) {
 *   report.errors.forEach(e => console.error(e.code, e.message));
 * }
 * ```
 * @public
 */
export declare function validateDefinition(def: StateMachineDefinition): ValidationReport;
