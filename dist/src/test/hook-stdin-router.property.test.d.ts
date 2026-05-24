/**
 * Property-based tests for scripts/lib/hook-stdin-router.mjs.
 *
 * Validates:
 * - Property 3: fail-safe totality (router never throws, always returns valid RouterDecision)
 * - Any JSON with agent_id → callerKind === "subagent"
 * - Any JSON with hook_event_name but no agent_id → callerKind === "main"
 */
export {};
