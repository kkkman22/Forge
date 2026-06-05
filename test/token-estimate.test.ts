/**
 * Tests for locale-aware token estimation utility.
 *
 * Validates: Phase 3 T2 — CJK token estimation optimization.
 * CJK text uses ~1.5 chars/token vs ~4 chars/token for Latin.
 */
import { describe, expect, it } from "vitest";
import { tokenEstimate } from "../src/token-estimate.js";

describe("tokenEstimate", () => {
  it("returns 0 for empty string", () => {
    expect(tokenEstimate("")).toBe(0);
  });

  it("estimates pure English text (~4 chars/token)", () => {
    // "Hello world" = 11 chars → ceil(11/4) = 3
    expect(tokenEstimate("Hello world")).toBe(3);
  });

  it("estimates pure CJK text (~1.5 chars/token)", () => {
    // "你好世界" = 4 CJK chars → ceil(4/1.5) = 3
    expect(tokenEstimate("你好世界")).toBe(3);
  });

  it("estimates mixed English + CJK text", () => {
    // "Hello你好" = 5 non-CJK + 2 CJK → ceil(2/1.5 + 5/4) = ceil(2.58) = 3
    expect(tokenEstimate("Hello你好")).toBe(3);
  });

  it("estimates Korean text", () => {
    // "안녕하세요" = 5 Korean chars → ceil(5/1.5) = 4
    expect(tokenEstimate("안녕하세요")).toBe(4);
  });

  it("handles long mixed content — CJK estimate differs from naive", () => {
    const text = "This is a test. 这是一个测试。テストです。";
    const estimate = tokenEstimate(text);
    const naive = Math.ceil(text.length / 4);
    // CJK-aware estimate must be higher than naive (CJK needs more tokens)
    expect(estimate).toBeGreaterThan(naive);
    // And within reasonable bounds
    expect(estimate).toBeLessThan(text.length);
  });
});
