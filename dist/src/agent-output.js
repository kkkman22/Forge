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
export function buildAgentOutputSchema(opts) {
    const properties = {
        success: { type: "boolean" },
        summary: { type: "string" },
        key_changes_made: { type: "array", items: { type: "string" } },
        key_learnings: { type: "array", items: { type: "string" } },
    };
    if (opts.includeStopField) {
        properties.should_fully_stop = { type: "boolean" };
    }
    // Required array includes all properties added so far (core + stop field).
    const required = Object.keys(properties);
    // Skill fields are added to properties but NOT to required — they are optional.
    if (opts.includeSkillFields) {
        properties.skill_phase_completed = { type: "string" };
        properties.next_skill_phase = { type: "string" };
        properties.gate_result = { type: "string" };
    }
    return {
        type: "object",
        additionalProperties: false,
        properties,
        required,
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
export function toStringArray(value) {
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
 * 7. `skill_phase_completed`, if present, is a string
 * 8. `next_skill_phase`, if present, is a string
 * 9. `gate_result`, if present, is one of "passed", "blocked", "skipped"
 *
 * @param data  The value to validate.
 * @returns A {@link ValidationSuccess} if valid, or a {@link ValidationError} otherwise.
 */
export function validateAgentOutput(data) {
    const errors = [];
    if (data === null || typeof data !== "object") {
        return { valid: false, errors: ["data must be a non-null object"] };
    }
    const obj = data;
    if (typeof obj.success !== "boolean") {
        errors.push("success must be a boolean");
    }
    if (typeof obj.summary !== "string") {
        errors.push("summary must be a string");
    }
    if (!Array.isArray(obj.key_changes_made)) {
        errors.push("key_changes_made must be an array");
    }
    else if (!obj.key_changes_made.every((item) => typeof item === "string")) {
        errors.push("key_changes_made must be an array of strings");
    }
    if (!Array.isArray(obj.key_learnings)) {
        errors.push("key_learnings must be an array");
    }
    else if (!obj.key_learnings.every((item) => typeof item === "string")) {
        errors.push("key_learnings must be an array of strings");
    }
    if ("should_fully_stop" in obj && typeof obj.should_fully_stop !== "boolean") {
        errors.push("should_fully_stop must be a boolean");
    }
    if ("skill_phase_completed" in obj && typeof obj.skill_phase_completed !== "string") {
        errors.push("skill_phase_completed must be a string");
    }
    if ("next_skill_phase" in obj && typeof obj.next_skill_phase !== "string") {
        errors.push("next_skill_phase must be a string");
    }
    if ("gate_result" in obj) {
        const validGateResults = ["passed", "blocked", "skipped"];
        if (typeof obj.gate_result !== "string" || !validGateResults.includes(obj.gate_result)) {
            errors.push('gate_result must be one of "passed", "blocked", "skipped"');
        }
    }
    if (errors.length > 0) {
        return { valid: false, errors };
    }
    return { valid: true, value: data };
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
export function serializeAgentOutput(output) {
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
export function deserializeAgentOutput(json) {
    let parsed;
    try {
        parsed = JSON.parse(json);
    }
    catch {
        return { valid: false, errors: ["invalid JSON"] };
    }
    return validateAgentOutput(parsed);
}
//# sourceMappingURL=agent-output.js.map