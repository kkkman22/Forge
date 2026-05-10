/**
 * State machine YAML loader.
 *
 * Parses a YAML string into a strongly-typed StateMachineDefinition.
 * Validates required fields and throws named errors on missing data.
 *
 * @public
 */
import type { StateMachineDefinition } from "./types.js";
/**
 * Load and parse a state machine YAML definition.
 *
 * @param yamlContent - Raw YAML string
 * @param filePath - Optional file path for error messages
 * @returns Parsed StateMachineDefinition
 * @throws Error on missing required fields or empty states
 *
 * @example
 * ```ts
 * const def = loadStateMachineDefinition(yamlStr, "reservation.yaml");
 * // def.name === "reservation"
 * ```
 * @public
 */
export declare function loadStateMachineDefinition(yamlContent: string, filePath?: string): StateMachineDefinition;
