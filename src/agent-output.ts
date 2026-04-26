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

import type { AgentOutput, AgentOutputSchema, SchemaProperty } from "./loop-types.js";

// ---------------------------------------------------------------------------
// Validation result types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Schema construction
// ---------------------------------------------------------------------------

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
 * `should_fully_stop` (boolean). All properties listed in `properties`
 * are also listed in `required`, and `additionalProperties` is `false`.
 *
 * @param opts  Options controlling schema shape.
 * @returns A valid {@link AgentOutputSchema}.
 */
export function buildAgentOutputSchema(opts: { includeStopField: boolean }): AgentOutputSchema {
  const properties: Record<string, SchemaProperty> = {
    success: { type: "boolean" },
    summary: { type: "string" },
    key_changes_made: { type: "array", items: { type: "string" } },
    key_learnings: { type: "array", items: { type: "string" } },
  };

  if (opts.includeStopField) {
    properties.should_fully_stop = { type: "boolean" };
  }

  return {
    type: "object",
    additionalProperties: false,
    properties,
    required: Object.keys(properties),
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an unknown value to a `string[]`.
 *
 * - If `value` is not an array, returns `[]`.
 * - Non-string elements are converted to strings via `String()`.
 *
 * @param value  The value to coerce.
 * @returns A string array.
 */
export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item : String(item)));
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

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
 *
 * @param data  The value to validate.
 * @returns A {@link ValidationSuccess} if valid, or a {@link ValidationError} otherwise.
 */
export function validateAgentOutput(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (data === null || typeof data !== "object") {
    return { valid: false, errors: ["data must be a non-null object"] };
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.success !== "boolean") {
    errors.push("success must be a boolean");
  }

  if (typeof obj.summary !== "string") {
    errors.push("summary must be a string");
  }

  if (!Array.isArray(obj.key_changes_made)) {
    errors.push("key_changes_made must be an array");
  } else if (!obj.key_changes_made.every((item: unknown) => typeof item === "string")) {
    errors.push("key_changes_made must be an array of strings");
  }

  if (!Array.isArray(obj.key_learnings)) {
    errors.push("key_learnings must be an array");
  } else if (!obj.key_learnings.every((item: unknown) => typeof item === "string")) {
    errors.push("key_learnings must be an array of strings");
  }

  if ("should_fully_stop" in obj && typeof obj.should_fully_stop !== "boolean") {
    errors.push("should_fully_stop must be a boolean");
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  return { valid: true, value: data as AgentOutput };
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

/**
 * Serialize an {@link AgentOutput} to a JSON string.
 *
 * Uses 2-space indentation for readability.
 *
 * @param output  The agent output to serialize.
 * @returns A formatted JSON string.
 */
export function serializeAgentOutput(output: AgentOutput): string {
  return JSON.stringify(output, null, 2);
}

/**
 * Deserialize a JSON string and validate it as an {@link AgentOutput}.
 *
 * Combines `JSON.parse` with {@link validateAgentOutput} so that callers
 * get either a validated output or a descriptive error in one step.
 *
 * @param json  The JSON string to parse and validate.
 * @returns A {@link ValidationSuccess} if valid, or a {@link ValidationError} otherwise.
 */
export function deserializeAgentOutput(json: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { valid: false, errors: ["invalid JSON"] };
  }
  return validateAgentOutput(parsed);
}
