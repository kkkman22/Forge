/**
 * Inline grill orchestration helpers — pure functions for automated
 * grill sub-process triggering from spec and decide phases.
 *
 * This module produces prompts, boolean decisions, and formatted injection
 * text. The actual inline sub-process loop is driven by the spec / decide
 * skill layer using the public grill functions from `grill.ts`.
 *
 * IO-free. No dependencies on state files or the router.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GrillInlineMode = "spec" | "decide";

export type GrillInlineReason =
  | "spec_high_ambiguity"
  | "decide_requirement_disagreement"
  | "decide_user_hesitation";

export type GrillInlineResult =
  | { kind: "skipped"; reason: "autonomous_mode" | "user_declined" | "frequency_limit" }
  | { kind: "completed"; tree: unknown; alignmentSummary: string }
  | { kind: "abandoned"; partialTree: unknown };

export interface AlreadyTriggered {
  spec_high_ambiguity: boolean;
  decide_requirement_disagreement: boolean;
  decide_user_hesitation: boolean;
}

// ---------------------------------------------------------------------------
// Trigger decision
// ---------------------------------------------------------------------------

export function shouldTriggerInlineGrill(input: {
  mode: "interactive" | "autonomous";
  reason: GrillInlineReason;
  alreadyTriggered: AlreadyTriggered;
}): { trigger: boolean; rationale: string } {
  if (input.mode === "autonomous") {
    return { trigger: false, rationale: "autonomous_mode" };
  }

  if (input.alreadyTriggered[input.reason]) {
    return { trigger: false, rationale: "frequency_limit" };
  }

  return { trigger: true, rationale: input.reason };
}
