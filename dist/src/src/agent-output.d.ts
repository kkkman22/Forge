/**
 * Structured agent output — JSON Schema construction, validation,
 * serialization, and deserialization for subagent results.
 *
 * All functions are pure: they accept data and return results without
 * side effects. The SKILL layer is responsible for actual I/O.
 *
 * Design reference: gnhf-inspired-enhancements § agent-output.ts
 * **Validates: Requirements 4.1–4.7**
 */
import type { AgentOutput, AgentOutputSchema } from "./loop-types.js";
/** Successful validation result containing the parsed {@link AgentOutput}. */
export interface ValidationSuccess {
    /** Discriminant — always `true` for a successful validation. */
    valid: true;
    /** The validated agent output value. */
    value: AgentOutput;
}
/** Failed validation result containing one or more error descriptions. */
export interface ValidationError {
    /** Discriminant — always `false` for a failed validation. */
    valid: false;
    /** Human-readable descriptions of what went wrong. */
    errors: string[];
}
/** Union of possible validation outcomes. */
export type ValidationResult = ValidationSuccess | ValidationError;
/**
 * Build a JSON Schema describing the expected agent output structure.
 *
 * The schema always includes the four core fields:
 * - `success` (boolean)
 * - `summary` (string)
 * - `key_changes_made` (array of strings)
 * - `key_learnings` (array of strings)
 *
 * When `includeStopField` is `true`, the schema also includes
 * `should_fully_stop` (boolean).
 *
 * When `includeSkillFields` is `true`, the schema also includes
 * `skill_phase_completed` (string), `next_skill_phase` (string),
 * and `gate_result` (string). These skill fields are optional and
 * are NOT added to the `required` array.
 *
 * `additionalProperties` is always `false`.
 *
 * @param opts  Options controlling schema shape.
 * @returns A valid {@link AgentOutputSchema}.
 */
export declare function buildAgentOutputSchema(opts: {
    includeStopField: boolean;
    includeSkillFields?: boolean;
}): AgentOutputSchema;
/**
 * Convert an unknown value to a `string[]`.
 *
 * - If `value` is not an array, returns `[]`.
 * - Non-string elements are converted to strings via `String()`.
 *
 * @param value  The value to coerce.
 * @returns A string array.
 */
export declare function toStringArray(value: unknown): string[];
/**
 * Validate that an unknown value conforms to the {@link AgentOutput} structure.
 *
 * Checks performed:
 * 1. `data` is a non-null object
 * 2. `success` is a boolean
 * 3. `summary` is a string
 * 4. `key_changes_made` is an array of strings
 * 5. `key_learnings` is an array of strings
 * 6. `should_fully_stop`, if present, is a boolean
 * 7. `skill_phase_completed`, if present, is a string
 * 8. `next_skill_phase`, if present, is a string
 * 9. `gate_result`, if present, is one of "passed", "blocked", "skipped"
 *
 * @param data  The value to validate.
 * @returns A {@link ValidationSuccess} if valid, or a {@link ValidationError} otherwise.
 */
export declare function validateAgentOutput(data: unknown): ValidationResult;
/**
 * Serialize an {@link AgentOutput} to a JSON string.
 *
 * Uses 2-space indentation for readability.
 *
 * @param output  The agent output to serialize.
 * @returns A formatted JSON string.
 */
export declare function serializeAgentOutput(output: AgentOutput): string;
/**
 * Deserialize a JSON string and validate it as an {@link AgentOutput}.
 *
 * Combines `JSON.parse` with {@link validateAgentOutput} so that callers
 * get either a validated output or a descriptive error in one step.
 *
 * @param json  The JSON string to parse and validate.
 * @returns A {@link ValidationSuccess} if valid, or a {@link ValidationError} otherwise.
 */
export declare function deserializeAgentOutput(json: string): ValidationResult;
