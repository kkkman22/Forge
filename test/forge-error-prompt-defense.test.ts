/**
 * Unit tests for `PromptDefenseError`.
 *
 * Covers:
 *   - `code` field equals the canonical `PROMPT_DEFENSE_REJECTED`
 *   - message is preserved as the `Error.message`
 *   - `threats` summary carries only type / pattern id / optional location
 *     — never the matched content or raw input text
 *   - serialising the error does not leak PII-shaped sentinels
 *
 * **Validates: Requirements 5.6, 5.12**
 */

import { describe, expect, it } from "vitest";
import { ForgeError, PromptDefenseError } from "../src/forge-error.js";
import type { Threat } from "../src/prompt-defense.js";

describe("PromptDefenseError", () => {
  it("has the canonical code and extends ForgeError", () => {
    const err = new PromptDefenseError("rejected", []);
    expect(err).toBeInstanceOf(ForgeError);
    expect(err.code).toBe("PROMPT_DEFENSE_REJECTED");
    expect(err.name).toBe("PromptDefenseError");
    expect(err.message).toBe("rejected");
  });

  it("summarises threats to type / pattern / optional location only", () => {
    const threats: Threat[] = [
      {
        type: "instruction_override",
        severity: "critical",
        confidence: 0.95,
        pattern: "io-001",
        location: { start: 3, end: 42 },
      },
      {
        type: "pii_exposure",
        severity: "medium",
        confidence: 0.9,
        pattern: "pii-001",
      },
    ];
    const err = new PromptDefenseError("blocked", threats);
    expect(err.threats).toHaveLength(2);
    expect(err.threats[0]).toEqual({
      type: "instruction_override",
      pattern: "io-001",
      location: { start: 3, end: 42 },
    });
    expect(err.threats[1]).toEqual({ type: "pii_exposure", pattern: "pii-001" });
    // Severity / confidence are deliberately omitted from the summary.
    expect(Object.keys(err.threats[0])).toEqual(["type", "pattern", "location"]);
  });

  it("never surfaces matched content or raw input in the serialised payload", () => {
    const SENTINEL = "leak-canary-a1b2c3";
    const threats: Threat[] = [
      {
        type: "pii_exposure",
        severity: "critical",
        confidence: 0.99,
        pattern: "pii-004",
        location: { start: 10, end: 10 + SENTINEL.length },
      },
    ];
    const err = new PromptDefenseError(`rejected: ${threats.length} threat(s)`, threats);
    const serialised = JSON.stringify({
      code: err.code,
      message: err.message,
      threats: err.threats,
    });
    expect(serialised.includes(SENTINEL)).toBe(false);
    expect(serialised).toContain("pii-004");
  });
});
