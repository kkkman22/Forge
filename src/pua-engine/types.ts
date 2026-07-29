/**
 * PUA Quality Engine — core types.
 *
 * Extracted from `pua-engine.ts` (god-file split, following the
 * `context-budget/` precedent). Pure types — no runtime logic lives here.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Pressure level — escalates with consecutive failures. */
export type PressureLevel = "L0" | "L1" | "L2" | "L3" | "L4";

/**
 * Methodology identifier.
 *
 * Each methodology maps to a well-known engineering framework distilled
 * from major tech companies' best practices.
 */
export type Methodology =
  | "huawei-rca" // 华为 5-Why root-cause analysis
  | "musk-algorithm" // Musk 5-step: question → delete → simplify → accelerate → automate
  | "baidu-search" // Search before everything
  | "amazon-backwards" // Working Backwards PR/FAQ
  | "bytedance-ab" // A/B Test data-driven
  | "alibaba-closure" // Closure methodology: set goal → track process → deliver result
  | "netflix-keeper" // Keeper Test elimination
  | "jobs-a-player"; // Pixel-perfect + DRI

/**
 * Failure pattern identifier.
 *
 * Six common "laziness modes" detected via keyword analysis of iteration
 * summaries. Each pattern has a dedicated counter-instruction and a
 * methodology switch chain.
 */
export type FailurePattern =
  | "spinning" // 原地打转: repeatedly tweaking the same spot
  | "giving-up" // 放弃/推锅: claiming inability or blaming environment
  | "low-quality" // 质量差: superficial completion
  | "guessing" // 没搜就猜: concluding from memory without searching
  | "passive-waiting" // 被动等待: waiting for user instructions
  | "empty-claim"; // 空口完成: claiming done without verification

/** Task type identifier — drives initial methodology selection. */
export type TaskType =
  | "debug"
  | "build"
  | "research"
  | "architecture"
  | "performance"
  | "review"
  | "deploy"
  | "general";

/** Stall response strategy — escalates with consecutive failures. */
export type StallResponse =
  | "remind" // 1-2 failures: remind to switch approach
  | "reassess" // 3-4 failures: re-read output, list 3 different hypotheses
  | "force-pivot"; // 5+ failures: fall back to questioning the requirement itself

/** PUA context passed to ContextAccumulator for prompt injection. */
export interface PuaContext {
  pressureLevel: PressureLevel;
  methodology: Methodology | null;
  failurePattern: FailurePattern | null;
  stallResponse: StallResponse | null;
  pressurePrompt: string;
}
