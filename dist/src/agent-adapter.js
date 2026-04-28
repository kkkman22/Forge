/**
 * Agent interface utilities and factory helpers.
 *
 * All functions are pure: they accept parameters and return values without
 * performing I/O or spawning processes. The SKILL layer is responsible for
 * instantiating concrete agent adapters.
 *
 * Design reference: gnhf-inspired-enhancements § agent-adapter.ts
 * **Validates: Requirements 9.1–9.6**
 */
// ---------------------------------------------------------------------------
// Supported agents
// ---------------------------------------------------------------------------
/**
 * Exhaustive list of all supported agent identifiers.
 *
 * This constant is the single source of truth for which agent names are
 * valid. Both {@link isValidAgentName} and {@link getUnsupportedAgentError}
 * derive their behaviour from this array.
 */
export const SUPPORTED_AGENTS = [
    "claude",
    "codex",
    "opencode",
    "rovodev",
];
// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
/**
 * Type guard that narrows an arbitrary string to a valid {@link AgentName}.
 *
 * Returns `true` when `name` is one of the values in
 * {@link SUPPORTED_AGENTS}.
 *
 * @param name  The agent name string to validate.
 * @returns Whether `name` is a supported agent identifier.
 */
export function isValidAgentName(name) {
    return SUPPORTED_AGENTS.includes(name);
}
// ---------------------------------------------------------------------------
// Error messages
// ---------------------------------------------------------------------------
/**
 * Build a human-readable error message for an unsupported agent name.
 *
 * The message lists every supported agent type so the caller can present
 * actionable feedback.
 *
 * @param name  The unrecognised agent name.
 * @returns An error message string.
 */
export function getUnsupportedAgentError(name) {
    return `Unsupported agent "${name}". Supported agents: ${SUPPORTED_AGENTS.join(", ")}`;
}
//# sourceMappingURL=agent-adapter.js.map