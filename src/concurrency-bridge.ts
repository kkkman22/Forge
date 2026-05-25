/**
 * ConcurrencyBridge — runtime degradation ladder for L0 workflow concurrency
 * (Workflow_Concurrency_Bridge, R12.5).
 *
 * When Forge_Subcommand_Dispatcher observes a 429 / rate_limit event in the
 * L0 stream-json output, the ladder steps the next-spawn `maxConcurrency`
 * down: 1st → floor(baseline/2), 2nd → 2, 3rd → 1. Subsequent 429s clamp
 * at 1. Each step emits an env override (FORGE_MAX_PARALLEL_AGENTS_RUNTIME)
 * for the next subprocess and appends an audit record to tool-health.md.
 * The override is bounded to the lifetime of one `/forge <subcommand>`
 * invocation (caller resets via `reset()` at subcommand completion).
 *
 * See:
 *   - .kiro/specs/workflows-integration/requirements.md §Requirement 12.5–12.7
 *   - .forge/reviews/workflows-integration.md F7
 */

import { appendToolHealthRecord } from "./tool-health-writer.js";

export interface LadderConfig {
  /** Baseline maxConcurrency before any 429 (typically `max_parallel_agents`). */
  baseline: number;
  /** Subcommand that owns this ladder — recorded into tool-health.md. */
  subcommand: string;
  /** Absolute path to `.forge/knowledge/tool-health.md`. */
  toolHealthPath: string;
  /** Optional probe tag (a/b/c/none) attached to each tool-health record. */
  probe?: "a" | "b" | "c" | "none";
}

/**
 * Stateful degradation ladder. One instance per `/forge <subcommand>`.
 *
 * Pure-state: does no spawning itself. Caller observes stream events,
 * calls {@link degrade} on each 429, then reads {@link runtimeOverride}
 * before respawning the next workflow subprocess.
 */
export class ConcurrencyDegradationLadder {
  private readonly cfg: LadderConfig;
  private steps = 0;
  private value: number;
  private override: number | undefined;

  constructor(cfg: LadderConfig) {
    if (!Number.isInteger(cfg.baseline) || cfg.baseline < 1) {
      throw new RangeError(`baseline must be a positive integer, got ${cfg.baseline}`);
    }
    this.cfg = cfg;
    this.value = cfg.baseline;
  }

  /** The currently-active concurrency value. Equal to baseline before any degrade. */
  current(): number {
    return this.value;
  }

  /**
   * Returns the runtime override that should be injected into the next
   * subprocess via FORGE_MAX_PARALLEL_AGENTS_RUNTIME, or `undefined` if no
   * degradation has occurred yet (caller must omit the env var).
   */
  runtimeOverride(): number | undefined {
    return this.override;
  }

  degradationCount(): number {
    return this.steps;
  }

  /**
   * Advance the ladder one step:
   *   step 1 → floor(baseline / 2)
   *   step 2 → 2
   *   step 3+ → 1
   *
   * Records the transition to tool-health.md and returns the new value.
   */
  degrade(): number {
    const old = this.value;
    let next: number;
    switch (this.steps) {
      case 0:
        next = Math.floor(this.cfg.baseline / 2);
        if (next < 1) next = 1;
        break;
      case 1:
        next = 2;
        break;
      default:
        next = 1;
        break;
    }
    this.steps += 1;
    this.value = next;
    this.override = next;

    appendToolHealthRecord(this.cfg.toolHealthPath, {
      subcommand: this.cfg.subcommand,
      event: "429-degrade",
      details: `old=${old} new=${next} probe=${this.cfg.probe ?? "none"}`,
    });

    return next;
  }

  /** Clear runtime override and step counter. Called at /forge subcommand boundary. */
  reset(): void {
    this.steps = 0;
    this.value = this.cfg.baseline;
    this.override = undefined;
  }
}

// ---------------------------------------------------------------------------
// Stream-event observer
// ---------------------------------------------------------------------------

export interface StreamEvent {
  type?: string;
  status_code?: number;
  subtype?: string;
  [key: string]: unknown;
}

/**
 * Returns true iff `ev` is a structured stream event signalling a 429 /
 * rate_limit condition. Inputs of any other shape (string, null, missing
 * type) return false — callers can pipe raw stream-json frames in
 * directly.
 */
export function observe429(ev: unknown): boolean {
  if (!ev || typeof ev !== "object") return false;
  const e = ev as StreamEvent;
  if (e.type === "tool_result" && e.status_code === 429) return true;
  if (e.type === "result" && e.subtype === "rate_limit") return true;
  return false;
}

// ---------------------------------------------------------------------------
// Env builder for workflow subprocess respawn (R12.6)
// ---------------------------------------------------------------------------

export interface SpawnEnvInput {
  maxParallelAgents: number;
  reviewConcurrency: number;
  /** Optional runtime override from {@link ConcurrencyDegradationLadder.runtimeOverride}. */
  runtimeOverride?: number;
  /** Caller's existing env to extend. Not mutated. */
  baseEnv: Record<string, string>;
}

/**
 * Build the env subset that workflow children consume:
 *   FORGE_MAX_PARALLEL_AGENTS         — config.md::max_parallel_agents
 *   FORGE_REVIEW_CONCURRENCY          — config.md::review.subagent_concurrency
 *   FORGE_MAX_PARALLEL_AGENTS_RUNTIME — current dynamic override (omit if none)
 *
 * `chunkedParallel` reads RUNTIME first and falls back to MAX_PARALLEL_AGENTS,
 * so omitting RUNTIME on a fresh subcommand restores the baseline.
 */
export function buildSpawnEnv(input: SpawnEnvInput): Record<string, string> {
  const out: Record<string, string> = { ...input.baseEnv };
  out.FORGE_MAX_PARALLEL_AGENTS = String(input.maxParallelAgents);
  out.FORGE_REVIEW_CONCURRENCY = String(input.reviewConcurrency);
  if (input.runtimeOverride !== undefined) {
    out.FORGE_MAX_PARALLEL_AGENTS_RUNTIME = String(input.runtimeOverride);
  }
  return out;
}
