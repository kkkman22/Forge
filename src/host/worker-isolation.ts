/**
 * P2 zcode-p2-native-architecture — capability-driven worker isolation decision.
 *
 * Whether a phase runs behind an isolated worker was previously a hardcoded
 * tier rule. P2 derives it from governance: when the model supports Long
 * Horizon (retains cross-task engineering judgement), worker isolation becomes
 * optional — the caller MAY inline even on Full tier, because the model keeps
 * coherence without the fork boundary. Claude (200K, no Long Horizon) keeps
 * isolation required.
 *
 * Light tier never isolates (it is a single-file ≤20-line change by definition).
 *
 * **Validates: design.md R7 — worker isolation consumer integration.**
 */
import type { GovernancePolicy } from "./capabilities.js";

/** Forge routing tier, mirrors the constitution three-tier routing. */
export type ForgeTier = "light" | "standard" | "full";

/**
 * Decide whether a phase should be isolated behind a worker, capability-driven.
 *
 * @param governance - derived governance policy (carries workerIsolation).
 * @param tier - routing tier (light never isolates).
 * @returns true when the caller should isolate the phase behind a worker.
 */
export function shouldIsolateWorker(governance: GovernancePolicy, tier: ForgeTier): boolean {
  // Light tier is by definition a small change — no worker boundary.
  if (tier === "light") return false;

  // capability-driven: required → always isolate on standard/full;
  // optional → caller may inline (return false, do not force isolation).
  return governance.workerIsolation === "required";
}

/** Worker execution strategy, derived capability-driven from governance + tier. */
export type WorkerStrategy = "isolate" | "inline";

/**
 * Pick the worker execution strategy for a phase.
 *
 * Consumes {@link shouldIsolateWorker} so the capability-driven decision has a
 * real caller (phase-worker-runtime dispatch). Returns "isolate" when the
 * phase should run behind a worker boundary, "inline" when it should run in
 * the main agent (Long Horizon retains cross-task judgement → skip the fork).
 *
 * @param governance - derived governance policy.
 * @param tier - routing tier.
 */
export function selectWorkerStrategy(
  governance: GovernancePolicy,
  tier: ForgeTier,
): WorkerStrategy {
  return shouldIsolateWorker(governance, tier) ? "isolate" : "inline";
}
