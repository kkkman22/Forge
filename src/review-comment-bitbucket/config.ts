import type { ResolvedConfig } from "./types.js";

export const COMMENT_CHANNEL_DEFAULTS: ResolvedConfig = {
  enabled: false,
  platform: "bitbucket",
  platform_override: "auto",
  p0_p1_strategy: "both",
  p2_strategy: "inline",
  p3_strategy: "none",
  request_changes_on_p0_p1: true,
  auto_reconcile_resolved: true,
  auto_reopen_regressed: true,
  comment_marker_prefix: "forge-review",
  rate_limit_interval_ms: 100,
};

const VALID_OVERRIDES = new Set(["auto", "bitbucket", "none"]);
const VALID_P0_P1_STRATEGIES = new Set(["both", "pr-task", "inline-only"]);
const VALID_P2_STRATEGIES = new Set(["inline", "none"]);
const MARKER_PREFIX_RE = /^[\w-]+$/;

export function parseCommentChannelConfig(
  raw?: Record<string, unknown>,
): ResolvedConfig {
  const result = { ...COMMENT_CHANNEL_DEFAULTS };

  if (!raw) return result;

  if (raw.platform !== undefined && raw.platform !== "bitbucket") {
    throw new Error(
      `Invalid review.comment_channel: platform must be "bitbucket", got "${raw.platform}"`,
    );
  }

  if (raw.p3_strategy !== undefined && raw.p3_strategy !== "none") {
    throw new Error(
      `Invalid review.comment_channel: p3_strategy must be "none", got "${raw.p3_strategy}"`,
    );
  }

  if (
    raw.platform_override !== undefined &&
    !VALID_OVERRIDES.has(raw.platform_override as string)
  ) {
    throw new Error(
      `Invalid review.comment_channel: platform_override must be one of {auto, bitbucket, none}, got "${raw.platform_override}"`,
    );
  }

  if (raw.comment_marker_prefix !== undefined) {
    if (!MARKER_PREFIX_RE.test(raw.comment_marker_prefix as string)) {
      throw new Error(
        `Invalid review.comment_channel: comment_marker_prefix must match [\\w-]+, got "${raw.comment_marker_prefix}"`,
      );
    }
  }

  if (raw.rate_limit_interval_ms !== undefined) {
    const ms = raw.rate_limit_interval_ms as number;
    if (ms < 0 || ms > 10000) {
      throw new Error(
        `Invalid review.comment_channel: rate_limit_interval_ms must be in [0, 10000], got ${ms}`,
      );
    }
  }

  if (raw.p0_p1_strategy !== undefined) {
    const s = raw.p0_p1_strategy as string;
    if (!VALID_P0_P1_STRATEGIES.has(s)) {
      throw new Error(
        `Invalid review.comment_channel: p0_p1_strategy must be one of {both, pr-task, inline-only}, got "${s}"`,
      );
    }
  }

  if (raw.p2_strategy !== undefined) {
    const s = raw.p2_strategy as string;
    if (!VALID_P2_STRATEGIES.has(s)) {
      throw new Error(
        `Invalid review.comment_channel: p2_strategy must be one of {inline, none}, got "${s}"`,
      );
    }
  }

  // Merge valid values
  for (const [key, val] of Object.entries(raw)) {
    if (val !== undefined && key in result) {
      (result as any)[key] = val;
    }
  }

  return result;
}
