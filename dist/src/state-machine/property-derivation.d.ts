/**
 * State machine property test derivation engine.
 *
 * Generates fast-check property test code fragments from invariant DSL expressions.
 * Recognizes 4 template patterns; unrecognized invariants get TODO placeholders.
 *
 * @public
 */
import type { StateMachineDefinition } from "./types.js";
/**
 * Derive fast-check property test code from a state machine definition.
 *
 * @param def - The state machine definition with invariants
 * @returns TypeScript code string (not auto-executed)
 *
 * @example
 * ```ts
 * const code = deriveStatePropertyTests(reservationDef);
 * // Paste code into project test file
 * ```
 * @public
 */
export declare function deriveStatePropertyTests(def: StateMachineDefinition): string;
