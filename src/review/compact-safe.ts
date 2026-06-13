/**
 * Compact-Safe Review mode (ce-inspired-review-enhancement R10).
 *
 * When the context window is approaching its limit during a long review
 * session, the review degrades gracefully to a compact-safe mode instead of
 * failing or producing incomplete output. This module encapsulates the
 * decision (should we enter compact-safe?) and its effects (which reviewers
 * to skip, simplified dedup, concise format).
 *
 * Design (per R10):
 *   - R10.1: detect context size via the `context_budget` config field or a
 *     caller-supplied heuristic token estimate.
 *   - R10.2: above the threshold (default 100K) → compact-safe mode:
 *       * skip Validation_Pass
 *       * keep only spec-check + security-check (skip quality + adversarial)
 *       * merge uses simplified dedup (file+line only, no normalize)
 *       * report uses concise format (id/severity/title/file:line)
 *   - R10.3: the report is prefixed with a compact-safe banner listing skips.
 *   - R10.4: the confidence gate strictness is unchanged.
 */

import type { MergedFinding, ReviewFinding, Severity } from "./types.js";

/** The reviewers that compact-safe mode keeps running. */
export const COMPACT_SAFE_ENABLED_LAYERS = ["spec-check", "security-check"] as const;

/** The reviewers that compact-safe mode skips (saves agent calls). */
export const COMPACT_SAFE_SKIPPED_LAYERS = ["quality-check", "adversarial-check"] as const;

/** Default context-token threshold above which compact-safe engages (R10.2). */
export const DEFAULT_COMPACT_SAFE_THRESHOLD = 100_000;

/** Decision result: whether to enter compact-safe and the inputs that drove it. */
export interface CompactSafeDecision {
  /** True when currentTokens >= threshold -> compact-safe mode active. */
  compactSafe: boolean;
  /** The threshold used (from config or default). */
  threshold: number;
  /** The current estimated context tokens (caller-supplied). */
  currentTokens: number;
  /** Why the decision was made (for logging). */
  reason: string;
}

/**
 * Decide whether to enter compact-safe mode (R10.1/R10.2).
 *
 * @param currentTokens caller-supplied estimate of current context tokens
 *   (e.g. from Claude Code's context-usage signal, or a heuristic summing
 *   loaded-file sizes). 0/undefined -> never compact-safe (unknown budget).
 * @param threshold the context_budget threshold (from .forge/config.md); falls
 *   back to DEFAULT_COMPACT_SAFE_THRESHOLD (100K) when omitted.
 */
export function decideCompactSafe(
  currentTokens: number | undefined,
  threshold?: number,
): CompactSafeDecision {
  const effectiveThreshold =
    threshold && threshold > 0 ? threshold : DEFAULT_COMPACT_SAFE_THRESHOLD;
  if (!currentTokens || currentTokens <= 0) {
    return {
      compactSafe: false,
      threshold: effectiveThreshold,
      currentTokens: currentTokens ?? 0,
      reason: "context size unknown (no token estimate supplied) — full review",
    };
  }
  if (currentTokens >= effectiveThreshold) {
    return {
      compactSafe: true,
      threshold: effectiveThreshold,
      currentTokens,
      reason: `context ${currentTokens} >= threshold ${effectiveThreshold} — compact-safe (skip quality/adversarial)`,
    };
  }
  return {
    compactSafe: false,
    threshold: effectiveThreshold,
    currentTokens,
    reason: `context ${currentTokens} < threshold ${effectiveThreshold} — full review`,
  };
}

/**
 * Filter a list of findings to those produced by compact-safe-enabled layers
 * (R10.2: keep only spec-check + security-check). Findings from skipped
 * reviewers are dropped.
 */
export function filterToCompactSafeLayers(findings: ReviewFinding[]): ReviewFinding[] {
  const enabled = new Set<string>(COMPACT_SAFE_ENABLED_LAYERS);
  return findings.filter((f) => enabled.has(f.reviewer));
}

/** Severity rank for keep-the-worst dedup (lower = more severe). */
function severityRank(s: Severity): number {
  switch (s) {
    case "P0":
      return 0;
    case "P1":
      return 1;
    case "P2":
      return 2;
    case "P3":
      return 3;
    default:
      return 4;
  }
}

/**
 * Simplified dedup used in compact-safe mode (R10.2): dedupe by file + line
 * only, no normalize/title-fuzzing. Keeps the first finding at each
 * (filePath, lineNumber) tuple; later duplicates are merged into the kept
 * finding's reviewers list (cross-reviewer confirmation is still recorded).
 */
export function compactSafeDedup(findings: ReviewFinding[]): MergedFinding[] {
  const byKey = new Map<string, MergedFinding>();
  for (const f of findings) {
    const key = `${f.filePath}:${f.lineNumber}`;
    const existing = byKey.get(key);
    if (existing) {
      // Merge: record the additional reviewer (cross-validation signal).
      if (!existing.reviewers.includes(f.reviewer)) {
        existing.reviewers.push(f.reviewer);
      }
      // Keep the higher-severity (P0 > P1 > P2 > P3) finding's severity.
      if (severityRank(f.severity) < severityRank(existing.severity)) {
        existing.severity = f.severity;
        existing.description = f.description;
      }
      existing.crossValidated = true;
    } else {
      byKey.set(key, {
        ...f,
        reviewers: [f.reviewer],
        crossValidated: false,
      });
    }
  }
  return [...byKey.values()];
}

/**
 * Render the compact-safe banner (R10.3). Prefixed to the report when
 * compact-safe mode is active, listing the skipped reviewers.
 */
export function renderCompactSafeBanner(): string {
  return `⚠ Compact-safe mode — partial review. Context budget exceeded; skipped reviewers: ${COMPACT_SAFE_SKIPPED_LAYERS.join(", ")}. Validation Pass also skipped. Confidence gate strictness unchanged.`;
}

/**
 * Concise finding format for compact-safe mode (R10.2): each finding shows
 * only ID, severity, title, file:line. No suggestion / reviewer detail.
 */
export function formatCompactSafeFinding(
  finding: MergedFinding,
  idPrefix: string,
  index: number,
): string {
  const id = `${idPrefix}-${String(index + 1).padStart(3, "0")}`;
  return `- [${id}] [${finding.severity}] ${finding.description} — ${finding.filePath}:${finding.lineNumber}`;
}
