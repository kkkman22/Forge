/**
 * Prompt Defense — core types for input threat detection.
 *
 * This module defines the shared type surface used by the prompt-injection
 * scanner. The scanning implementation itself lives in a follow-up task;
 * here we only expose the vocabulary so that the pattern library
 * (`prompt-defense-patterns.ts`), router integration, tests, and error
 * reporting can all share a single definition.
 *
 * Design constraints (Requirements 5.1–5.12):
 *   - Types SHALL be IO-free and dependency-free.
 *   - The `Threat.pattern` field carries a pattern **id** (stable string)
 *     rather than the matched content. This keeps PII out of `ScanResult`,
 *     downstream logs and error messages (Requirement 5.12).
 *   - Severity levels are ordered from most to least critical for ease of
 *     sorting: "critical" > "high" > "medium" > "low".
 *   - `ScanResult.detectionTimeMs` is populated by the scanner using
 *     `performance.now()` deltas; the type only fixes the contract.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3**
 */

import { PATTERNS } from "./prompt-defense-patterns.js";

// Re-export the shared threat taxonomy so existing `import { ThreatType } from
// "./prompt-defense.js"` callers keep working. The canonical definitions live
// in `prompt-defense-types.ts` (a dependency-free leaf) to break the
// prompt-defense ↔ prompt-defense-patterns cycle.
export type { ThreatSeverity, ThreatType } from "./prompt-defense-types.js";

import type { ThreatSeverity, ThreatType } from "./prompt-defense-types.js";

// ---------------------------------------------------------------------------
// Threat taxonomy — see prompt-defense-types.ts for the canonical definitions.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Result shapes
// ---------------------------------------------------------------------------

/**
 * A single detected threat occurrence.
 *
 * `pattern` is the **id** of the matching rule from
 * `prompt-defense-patterns.ts` (e.g. `"io-001"`), never the matched content.
 * This is required to keep PII and injected instructions out of error
 * payloads and structured logs (Requirement 5.12).
 *
 * `location`, when present, points into the original scanned text via
 * UTF-16 code-unit offsets (matching the semantics of `RegExp` `.exec`).
 * It is safe to surface these offsets in logs because they do not leak
 * content.
 */
export interface Threat {
  /** Threat category. */
  type: ThreatType;
  /** Severity bucket. */
  severity: ThreatSeverity;
  /** Detection confidence in the inclusive range `[0, 1]`. */
  confidence: number;
  /** Stable id of the pattern that matched (NOT the matched text). */
  pattern: string;
  /** Optional byte-range location of the match in the input. */
  location?: { start: number; end: number };
}

/**
 * Result of scanning a single input string.
 *
 *  - `safe` is `true` iff no threats were detected.
 *  - `threats` is ordered by severity (critical → low); ordering within a
 *    severity bucket is implementation-defined but stable per call.
 *  - `detectionTimeMs` records wall-clock scan time; the performance
 *    budget (Requirement 5.8) caps this at 5 ms p95 for inputs up to 10 KB.
 */
export interface ScanResult {
  safe: boolean;
  threats: Threat[];
  detectionTimeMs: number;
}
// ---------------------------------------------------------------------------
// Scanner
// ---------------------------------------------------------------------------

/**
 * Numeric order used to sort threats by severity.
 *
 * Lower values sort first, so `critical` is surfaced before `high`,
 * `high` before `medium`, and `medium` before `low`.
 */
const SEVERITY_ORDER: Record<ThreatSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

/**
 * Scan an input string for prompt-injection and PII threats.
 *
 * This is a pure function: it performs no IO, maintains no state, and its
 * output depends only on `text` and the frozen `PATTERNS` library. The
 * only observation of the outside world is via `performance.now()` for
 * timing, which is treated as a deterministic measurement and excluded
 * from purity reasoning.
 *
 * ## Behaviour
 *
 *   - Iterates the pattern library in order, running each `RegExp.exec`
 *     against `text` exactly once. The first match per pattern is
 *     recorded; additional occurrences of the same pattern are ignored to
 *     keep runtime bounded and avoid duplicate noise.
 *   - For every match, appends a `Threat` with the pattern's `id` (never
 *     the matched content) and an optional `location` carrying UTF-16
 *     start/end offsets.
 *   - Sorts the resulting `threats` array by severity
 *     (critical → high → medium → low). Ordering within a severity bucket
 *     follows the original pattern-library order, since `Array.sort` is
 *     stable in modern JavaScript engines.
 *   - Populates `detectionTimeMs` with the elapsed wall-clock time in
 *     milliseconds.
 *
 * ## Invariants
 *
 *   - NEVER throws, even on adversarial input (empty string, very long
 *     strings, unicode, embedded null bytes).
 *   - NEVER includes matched text, PII values, or user-supplied strings
 *     in the returned `ScanResult` — only pattern ids and numeric
 *     offsets (Requirement 5.12).
 *   - The returned `threats` array is freshly allocated on every call, so
 *     callers may mutate it freely without affecting subsequent calls.
 *
 * @param text - Arbitrary input string to scan.
 * @returns Structured scan result. `safe === threats.length === 0`.
 *
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.12**
 */
export function scanInput(text: string): ScanResult {
  const startTime = performance.now();
  const threats: Threat[] = [];

  for (const p of PATTERNS) {
    // Patterns in the library are non-global; `.exec` returns the first
    // match (or `null`) without mutating `lastIndex`, which keeps this
    // function deterministic across calls.
    const match = p.pattern.exec(text);
    if (match !== null) {
      threats.push({
        type: p.type,
        severity: p.severity,
        confidence: p.baseConfidence,
        pattern: p.id,
        location: {
          start: match.index,
          end: match.index + match[0].length,
        },
      });
    }
  }

  threats.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  const detectionTimeMs = performance.now() - startTime;
  return {
    safe: threats.length === 0,
    threats,
    detectionTimeMs,
  };
}
