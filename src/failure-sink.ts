/**
 * Failure auto-sink — pure functions that turn a runtime failure
 * context into two artefacts:
 *
 *   1. A structured {@link Episode} with `outcome: "failure"`, ready
 *      to be appended to `.forge/knowledge/sessions/<date>-<topic>.md`
 *      by a driver.
 *   2. An Evolution marker string targeting the responsible skill,
 *      suitable for appending to a reviews / progress / findings file
 *      so the learn skill can aggregate it later.
 *
 * The module is IO-free. Drivers that persist these artefacts handle
 * writes and downgrade any failure to `console.warn` per Requirement
 * 8.12 ("write failures degrade to warnings").
 *
 * **Validates: Requirements 8.6, 8.7**
 */

import { type Episode, type EpisodeTier, generateEpisodeId } from "./episode.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Triggers that map 1-to-1 onto the three failure sinks described in
 * Requirements 8.6 / 8.7:
 *
 *   - `three_strike`        — three consecutive TDD failures in build.
 *   - `new_review_pattern`  — review found a pattern not yet in the
 *                             knowledge base.
 *   - `ship_gate_blocked`   — ship gate rejected the delivery.
 */
export type FailureTrigger = "three_strike" | "new_review_pattern" | "ship_gate_blocked";

/**
 * Context collected at the failure site. Callers build this record
 * from `status.md`, the router decision, and the specific failure
 * signal; the sink functions consume it without touching any external
 * state.
 */
export interface FailureContext {
  /** Skill that hit the failure, e.g. `forge-build`. */
  skill: string;
  /** Short topic slug used when naming the session file. */
  topic: string;
  /** Tier under which the skill executed. */
  tier: EpisodeTier;
  /** Which sink condition fired. */
  trigger: FailureTrigger;
  /** One-line description of what happened. */
  situation: string;
  /** Optional diagnosed root cause; attached when known. */
  rootCause?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Render an ISO date (YYYY-MM-DD) from a `Date`. We intentionally slice
 * the ISO string rather than format locally so UTC is used everywhere
 * and tests can inject a fixed clock without timezone drift.
 */
function isoDate(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Per-trigger human-readable lesson text, used as the `lesson` field
 * and as a short reminder embedded in the Evolution marker description.
 * Keeping the text here (and not in the driver) ensures the same
 * phrasing appears across episode body and marker, so humans reading
 * `evolution-report.md` can quickly correlate the two.
 */
function lessonFor(trigger: FailureTrigger): string {
  switch (trigger) {
    case "three_strike":
      return "三次连续失败提示任务或方法需要重新审视";
    case "new_review_pattern":
      return "review 发现了尚未沉淀的新问题模式，值得补入知识库";
    case "ship_gate_blocked":
      return "交付门禁拦截需要在流程或检查清单中修补漏洞";
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a structured `Episode` representing a failure captured at a
 * skill boundary.
 *
 * Fields are populated as follows:
 *   - `schema_version`    always `2`.
 *   - `id`                `ep-YYYY-MM-DD-NNN` via {@link generateEpisodeId}.
 *   - `date`              UTC date from `now`.
 *   - `skill` / `tier`    copied from `ctx`.
 *   - `situation`         copied from `ctx.situation`.
 *   - `root_cause`        set only when `ctx.rootCause` is non-empty.
 *   - `lesson`            the trigger-specific lesson text.
 *   - `outcome`           always `"failure"`.
 *   - `body`              a short markdown block recording the
 *                         trigger, topic, tier, and (optional) root
 *                         cause so the episode renders as a
 *                         self-contained post-mortem stub.
 *
 * Pure function: same `(ctx, now, sequenceInDay)` always produces the
 * same Episode.
 */
export function buildFailureEpisode(
  ctx: FailureContext,
  now: Date,
  sequenceInDay: number,
): Episode {
  const date = isoDate(now);
  const id = generateEpisodeId(date, sequenceInDay);

  const bodyLines: string[] = [
    "",
    "## 摘要",
    `- trigger: ${ctx.trigger}`,
    `- topic: ${ctx.topic}`,
    `- tier: ${ctx.tier}`,
    `- situation: ${ctx.situation}`,
  ];
  if (ctx.rootCause !== undefined && ctx.rootCause.length > 0) {
    bodyLines.push(`- root_cause: ${ctx.rootCause}`);
  }
  bodyLines.push("");

  const episode: Episode = {
    schema_version: 2,
    id,
    date,
    skill: ctx.skill,
    tier: ctx.tier,
    situation: ctx.situation,
    lesson: lessonFor(ctx.trigger),
    outcome: "failure",
    body: bodyLines.join("\n"),
  };

  if (ctx.rootCause !== undefined && ctx.rootCause.length > 0) {
    episode.root_cause = ctx.rootCause;
  }

  return episode;
}

/**
 * Render the Evolution marker string that should be appended to a
 * reviews / progress / findings file when a failure is auto-sunk.
 *
 * Format (matches the grammar parsed by `evolution-marker.ts`):
 *
 * ```
 * <!-- Evolution: YYYY-MM-DD | source: <episodeId> | target: <skill>#<trigger> -->
 * <ctx.situation>
 * ```
 *
 * `target` always carries a `#<trigger>` section qualifier so the
 * aggregation step can group markers by trigger and suggest ADRs once
 * the same section accumulates ≥3 pointers.
 *
 * The returned string ends with a trailing newline so callers can
 * concatenate it directly onto an existing file without tracking
 * separators.
 */
export function buildFailureEvolutionMarker(
  ctx: FailureContext,
  episodeId: string,
  now: Date,
): string {
  const date = isoDate(now);
  return [
    `<!-- Evolution: ${date} | source: ${episodeId} | target: ${ctx.skill}#${ctx.trigger} -->`,
    ctx.situation,
    "",
  ].join("\n");
}
