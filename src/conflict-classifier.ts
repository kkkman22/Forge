// Conflict classifier — zone-based path classification for merge conflicts.
//
// Four zones with priority chain (first match wins):
//   1. frozen: .tinkerman/config.md, .tinkerman/specs/{topic}/spec.md, .tinkerman/plans/{topic}.md
//   2. guarded: .tinkerman/progress, .tinkerman/reviews, knowledge files, ADRs
//   3. open: other .forge files
//   4. source: anything outside .tinkerman/
//
// Total function [R13.1]: for any path, returns a valid Zone
// Deterministic [R13.2]: classify(normalize(p)) === classify(p)
//
// Validates: Requirements R7.1, R13.1, R13.2

export type Zone = "frozen" | "guarded" | "open" | "source";

const FROZEN_PATTERNS = [
  /^\.tinkerman\/config\.md$/,
  /^\.tinkerman\/specs\/[^/]+\/spec\.md$/,
  /^\.tinkerman\/specs\/[^/]+\/requirements\.md$/,
  /^\.tinkerman\/specs\/[^/]+\/design\.md$/,
  /^\.tinkerman\/specs\/[^/]+\/tasks\.md$/,
  /^\.tinkerman\/specs\/[^/]+\/bugfix\.md$/,
  /^\.tinkerman\/plans\/[^/]+\.md$/,
];

const GUARDED_PATTERNS = [
  /^\.tinkerman\/progress\//,
  /^\.tinkerman\/reviews\//,
  /^\.tinkerman\/knowledge\/instincts\.md$/,
  /^\.tinkerman\/knowledge\/known-failures\.md$/,
  /^\.tinkerman\/knowledge\/solutions\//,
  /^\.tinkerman\/decisions\/ADR-\d+.*\.md$/,
];

const FORGE_PREFIX = ".tinkerman/";

/**
 * Normalize a path: strip trailing slashes, then strip leading "./".
 */
export function normalizePath(p: string): string {
  let result = p;
  // Strip trailing slashes
  result = result.replace(/\/+$/, "");
  // Strip leading ./
  while (result.startsWith("./")) {
    result = result.slice(2);
  }
  return result;
}

/**
 * Classify a path into one of four zones.
 * Total function — always returns a valid Zone [R13.1].
 */
export function classify(path: string): Zone {
  const p = normalizePath(path);

  if (!p.startsWith(FORGE_PREFIX)) {
    return "source";
  }

  // Check frozen patterns (highest priority)
  for (const pattern of FROZEN_PATTERNS) {
    if (pattern.test(p)) return "frozen";
  }

  // Check guarded patterns
  for (const pattern of GUARDED_PATTERNS) {
    if (pattern.test(p)) return "guarded";
  }

  // Everything else under .tinkerman/ is open
  return "open";
}

// ---------------------------------------------------------------------------
// Failure-sink driver helper
// ---------------------------------------------------------------------------

import type { FailureContext } from "./failure-sink.js";

export interface ConflictValidationFailedInput {
  topic: string;
  tier: "light" | "standard" | "full";
  conflictPath: string;
  checkOutput?: string;
}

export function buildConflictValidationFailedContext(
  input: ConflictValidationFailedInput,
): FailureContext {
  return {
    skill: "forge-fix-conflicts",
    topic: input.topic,
    tier: input.tier,
    trigger: "conflict_validation_failed",
    situation: input.checkOutput
      ? `冲突验证失败：${input.conflictPath} — ${input.checkOutput}`
      : `冲突验证失败：${input.conflictPath}`,
    rootCause: input.checkOutput,
  };
}
