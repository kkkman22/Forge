/**
 * Spawn Policy — pure functions for subagent spawn-time authorization.
 *
 * Decides whether a subagent may be spawned based on its identity, the
 * disallowed-tools lineage from leader to current parent, and the nesting
 * depth. Side-effect free; the dispatcher layer performs the actual spawn.
 *
 * Boundary (spec cc-2-1-18x-safety-hardening R2/R3):
 *   This module judges "may we spawn THIS subagent" — not "which tools will it
 *   call". Runtime tool selection is enforced by each agent's own
 *   `disallowedTools` frontmatter + runtime PreToolUse hooks.
 *
 * judgment order —
 *   1. depth > maxDepth           → max-depth-exceeded
 *   2. lineage ancestor disallows  → blocked (Agent-spawn-forbidden)
 *      "Agent" (any level forbids spawning children)
 *   3. otherwise                   → ok
 *
 * **Validates: Requirements R2 AC1-AC5, R3 AC1-AC4**
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** One level of the spawn lineage (leader → ... → current parent). */
export interface LineageEntry {
  /** Agent identity (agents/*.md filename without extension). */
  agent: string;
  /** That level's `disallowedTools` set (tool names from frontmatter). */
  disallowed: ReadonlySet<string>;
}

/** Result of evaluating a spawn request. */
export interface SpawnPolicyDecision {
  allowed: boolean;
  /** "blocked" | "max-depth-exceeded" | "ok" */
  verdict: "blocked" | "max-depth-exceeded" | "ok";
  /** Matched rule id on block, e.g. "Agent-spawn-forbidden". */
  rule?: string;
  /** On lineage block, the offending ancestor agent name. */
  blockedAt?: string;
  reason: string;
}

/** Judgment context. */
export interface SpawnContext {
  /** Identity of the subagent about to be spawned. */
  subagentIdentity: string;
  /** Leader → ... → current parent lineage. */
  lineage: LineageEntry[];
  /** Current chain depth; leader = 0, direct child = 1. */
  depth: number;
  /** Configured max depth (config.md `max_subagent_depth`, default 5). */
  maxDepth: number;
}

/**
 * Known subagent spawn tool names (P1-7). A lineage level whose
 * `disallowedTools` contains any of these forbids spawning children.
 * Maintain as CC evolves (Agent / Task / dispatch_agent …).
 */
export const SPAWN_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Agent",
  "Task",
  "dispatch_agent",
  "spawn_agent",
]);

// ---------------------------------------------------------------------------
// Core judgment
// ---------------------------------------------------------------------------

/**
 * Evaluate whether a subagent may be spawned under the given lineage + depth.
 *
 * Pure: no I/O. Callers wrap invocations in try/catch to implement fail-open
 * (spec NFR-2): a thrown error → log tool-health → allow the spawn.
 *
 * @param ctx  spawn context (identity, lineage, depth, maxDepth)
 */
export function checkSpawnPolicy(ctx: SpawnContext): SpawnPolicyDecision {
  // 1. Depth limit (checked first; cheaper and authoritative).
  if (ctx.depth >= ctx.maxDepth) {
    return {
      allowed: false,
      verdict: "max-depth-exceeded",
      rule: "max-subagent-depth",
      reason: `subagent 嵌套深度超限: depth=${ctx.depth} >= maxDepth=${ctx.maxDepth}。请减少嵌套或调高 max_subagent_depth。`,
    };
  }

  // 2. Lineage: any ancestor disallowing a spawn tool blocks spawning children.
  for (const entry of ctx.lineage) {
    for (const tool of SPAWN_TOOL_NAMES) {
      if (entry.disallowed.has(tool)) {
        return {
          allowed: false,
          verdict: "blocked",
          rule: "spawn-tool-forbidden",
          blockedAt: entry.agent,
          reason: `spawn 被阻断: 祖先 ${entry.agent} 的 disallowedTools 含 ${tool},该层级禁止再 spawn 子 agent。`,
        };
      }
    }
  }

  // 3. OK.
  return { allowed: true, verdict: "ok", reason: "" };
}
