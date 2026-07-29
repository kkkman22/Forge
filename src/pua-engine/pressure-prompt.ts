/**
 * PUA Quality Engine — pressure prompt builder.
 *
 * Extracted from `pua-engine.ts` (god-file split, following the
 * `context-budget/` precedent). See `pua-engine.ts` for the re-export barrel
 * that preserves the public API.
 */

import {
  FAILURE_PATTERN_COUNTERS,
  METHODOLOGY_DESCRIPTIONS,
  PROACTIVITY_GUIDANCE,
  SEVEN_POINT_CHECKLIST,
  THREE_RED_LINES,
  UNIVERSAL_METHODOLOGY,
} from "./prompt-content.js";
import type { FailurePattern, Methodology, PressureLevel, StallResponse } from "./types.js";

// ---------------------------------------------------------------------------
// Pressure Prompt Builder
// ---------------------------------------------------------------------------

/**
 * Level-specific instruction injected at L1+.
 * @internal
 */
const L1_SWITCH_INSTRUCTION = `## Switch Approach

You have failed more than once with the same general direction. STOP making minor variations.
Switch to a fundamentally different approach — different tool, different angle, different assumption.`;

/**
 * Level-specific instruction injected at L2+.
 * @internal
 */
const L2_SEARCH_HYPOTHESES_INSTRUCTION = `## Deep Investigation Required

1. Search the complete error message verbatim — not a paraphrase.
2. Read the related source code — at least 50 lines of context around the failure point.
3. List 3 fundamentally different hypotheses for the root cause. Each hypothesis must be testable and lead to a different investigation path.`;

/**
 * Level-specific instruction injected at L4.
 * @internal
 */
const L4_DESPERATION_INSTRUCTION = `## Desperation Mode

All conventional approaches have failed. It is time for extreme measures:
1. Build a minimal PoC that isolates the exact problem — strip everything else away.
2. Test in a completely isolated environment — no assumptions carried over.
3. Consider a completely different tech stack or library for this specific piece.
4. If the current path is fundamentally broken, delete it and rebuild from scratch with a different design.`;

/**
 * Numeric index for each pressure level, used for comparison.
 * @internal
 */
const PRESSURE_LEVEL_INDEX: Record<PressureLevel, number> = {
  L0: 0,
  L1: 1,
  L2: 2,
  L3: 3,
  L4: 4,
};

/**
 * Build a structured pressure prompt based on the current PUA engine state.
 *
 * Pressure prompt content is **monotonically increasing** — higher levels
 * include ALL content from lower levels plus additional instructions:
 *
 * - **L0**: THREE_RED_LINES + PROACTIVITY_GUIDANCE (base layer)
 * - **L1**: + "Switch to a fundamentally different approach" instruction
 * - **L2**: + "Search complete error message + read related source code +
 *            list 3 fundamentally different hypotheses" instruction +
 *            UNIVERSAL_METHODOLOGY (5 steps)
 * - **L3**: + SEVEN_POINT_CHECKLIST + UNIVERSAL_METHODOLOGY (5 steps)
 * - **L4**: + "Desperation mode: minimal PoC + isolated environment +
 *            completely different tech stack" instruction +
 *            UNIVERSAL_METHODOLOGY (5 steps)
 *
 * Context injection:
 * - When `methodology` is not null, injects `METHODOLOGY_DESCRIPTIONS[methodology]`
 * - When `failurePattern` is not null, injects `FAILURE_PATTERN_COUNTERS[failurePattern]`
 *
 * **Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10**
 *
 * @param level - Current pressure level
 * @param methodology - Current methodology (may be null)
 * @param failurePattern - Current failure pattern (may be null)
 * @param _stallResponse - Current stall response strategy (may be null)
 * @returns Structured pressure prompt text
 */
export function buildPressurePrompt(
  level: PressureLevel,
  methodology: Methodology | null,
  failurePattern: FailurePattern | null,
  _stallResponse: StallResponse | null,
): string {
  const idx = PRESSURE_LEVEL_INDEX[level];
  const sections: string[] = [];

  // --- Base layer (L0+): always present ---
  sections.push(THREE_RED_LINES);
  sections.push(PROACTIVITY_GUIDANCE);

  // --- L1+: switch approach instruction ---
  if (idx >= 1) {
    sections.push(L1_SWITCH_INSTRUCTION);
  }

  // --- L2+: search / source / 3 hypotheses + universal methodology ---
  if (idx >= 2) {
    sections.push(L2_SEARCH_HYPOTHESES_INSTRUCTION);
    sections.push(UNIVERSAL_METHODOLOGY);
  }

  // --- L3+: 7-point checklist ---
  if (idx >= 3) {
    sections.push(SEVEN_POINT_CHECKLIST);
  }

  // --- L4: desperation mode ---
  if (idx >= 4) {
    sections.push(L4_DESPERATION_INSTRUCTION);
  }

  // --- Context injection: methodology description ---
  if (methodology !== null) {
    sections.push(METHODOLOGY_DESCRIPTIONS[methodology]);
  }

  // --- Context injection: failure pattern counter ---
  if (failurePattern !== null) {
    sections.push(FAILURE_PATTERN_COUNTERS[failurePattern]);
  }

  return sections.join("\n\n");
}
