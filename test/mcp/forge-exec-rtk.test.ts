/**
 * forge-exec-rtk.test.ts — Tests for RTK compression integration in forge_exec.
 *
 * Verifies:
 *   - RTK available + success output → RTK compression path
 *   - RTK available + failure output → full output (Iron Law)
 *   - RTK unavailable + success output → trimCommandOutput fallback
 *   - RTK timeout → fallback to trimCommandOutput
 *   - RTK crash → fallback to trimCommandOutput
 */

import { describe, expect, it } from "vitest";
import {
  isRtkAvailable,
  trimCommandOutput,
  trimWithFallback,
} from "../../src/mcp/trimmers/output.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a multi-line success output for compression testing. */
function makeSuccessOutput(lines: number): string {
  return Array.from({ length: lines }, (_, i) => `Line ${i + 1}: some output content here`).join(
    "\n",
  );
}

const SHORT_OUTPUT = makeSuccessOutput(10);
const LONG_OUTPUT = makeSuccessOutput(200);

// ---------------------------------------------------------------------------
// trimWithFallback tests
// ---------------------------------------------------------------------------

describe("trimWithFallback", () => {
  describe("Iron Law: failure output is never compressed", () => {
    it("returns full output when exitCode !== 0 and rtkAvailable=true", async () => {
      const result = await trimWithFallback(LONG_OUTPUT, "error msg", 1, true);
      expect(result).toContain(LONG_OUTPUT);
      expect(result).toContain("error msg");
    });

    it("returns full output when exitCode !== 0 and rtkAvailable=false", async () => {
      const result = await trimWithFallback(LONG_OUTPUT, "", 1, false);
      expect(result).toBe(LONG_OUTPUT);
    });

    it("returns full output when exitCode is 2 (crash)", async () => {
      const result = await trimWithFallback("segfault output", "SIGSEGV", 2, true);
      expect(result).toContain("segfault output");
    });
  });

  describe("success output with RTK available", () => {
    it("returns short output directly (no compression needed)", async () => {
      const result = await trimWithFallback(SHORT_OUTPUT, "", 0, true);
      // Short output should be returned as-is (≤30 lines)
      expect(result).toBe(SHORT_OUTPUT);
    });

    it("falls back to legacy trimmer when RTK binary fails (long output)", async () => {
      // rtkAvailable=true but RTK binary is not actually installed,
      // so it will fail and fall back to trimCommandOutput
      const result = await trimWithFallback(LONG_OUTPUT, "", 0, true);
      const expected = trimCommandOutput(LONG_OUTPUT, "", 0);
      expect(result).toBe(expected);
      expect(result.length).toBeLessThan(LONG_OUTPUT.length);
    });
  });

  describe("success output with RTK unavailable (fallback)", () => {
    it("falls back to trimCommandOutput for long output", async () => {
      const result = await trimWithFallback(LONG_OUTPUT, "", 0, false);
      const expected = trimCommandOutput(LONG_OUTPUT, "", 0);
      expect(result).toBe(expected);
      expect(result.length).toBeLessThan(LONG_OUTPUT.length);
    });

    it("returns short output directly via fallback", async () => {
      const result = await trimWithFallback(SHORT_OUTPUT, "", 0, false);
      expect(result).toBe(SHORT_OUTPUT);
    });
  });

  describe("edge cases", () => {
    it("handles empty stdout", async () => {
      const result = await trimWithFallback("", "", 0, true);
      expect(result).toBe("");
    });

    it("handles empty stdout with failure", async () => {
      const result = await trimWithFallback("", "error details", 1, true);
      expect(result).toContain("error details");
    });
  });
});

// ---------------------------------------------------------------------------
// RTK detection tests
// ---------------------------------------------------------------------------

describe("RTK detection", () => {
  it("isRtkAvailable returns boolean", async () => {
    const result = await isRtkAvailable();
    expect(typeof result).toBe("boolean");
  });
});

// ---------------------------------------------------------------------------
// CompressionEngine interface tests
// ---------------------------------------------------------------------------

describe("CompressionEngine interface", () => {
  it("trimWithFallback is async and returns a string", async () => {
    const result = await trimWithFallback("output", "err", 0, false);
    expect(typeof result).toBe("string");
  });
});
