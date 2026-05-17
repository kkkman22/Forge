import { describe, expect, it, vi } from "vitest";

// Import will fail until T2 implements parseReviewConfig
import { parseReviewConfig, type ReviewConfig } from "../../src/config.js";

describe("parseReviewConfig", () => {
  it("should default to 3 when config.md absent", () => {
    const result = parseReviewConfig(undefined);
    expect(result).toEqual<ReviewConfig>({ subagent_concurrency: 3 });
  });

  it("should default to 3 when config.md missing field", () => {
    const result = parseReviewConfig("# no review config here\n");
    expect(result).toEqual<ReviewConfig>({ subagent_concurrency: 3 });
  });

  it.each([1, 5, 10])("should parse review.subagent_concurrency: %i", (n) => {
    const result = parseReviewConfig(`review.subagent_concurrency: ${n}\n`);
    expect(result).toEqual<ReviewConfig>({ subagent_concurrency: n });
  });

  it.each([
    0, 11, -1,
  ])("should fallback to default with warning when config value invalid (%i)", (invalid) => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = parseReviewConfig(`review.subagent_concurrency: ${invalid}\n`);
    expect(result).toEqual<ReviewConfig>({ subagent_concurrency: 3 });
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("subagent_concurrency invalid"));
    spy.mockRestore();
  });

  it("should fallback to default silently when config value is non-numeric", () => {
    const result = parseReviewConfig("review.subagent_concurrency: abc\n");
    expect(result).toEqual<ReviewConfig>({ subagent_concurrency: 3 });
  });

  it("FORGE_REVIEW_CONCURRENCY env overrides config.md", () => {
    const original = process.env.FORGE_REVIEW_CONCURRENCY;
    process.env.FORGE_REVIEW_CONCURRENCY = "7";
    try {
      const result = parseReviewConfig("review.subagent_concurrency: 5\n");
      expect(result).toEqual<ReviewConfig>({ subagent_concurrency: 7 });
    } finally {
      if (original === undefined) {
        delete process.env.FORGE_REVIEW_CONCURRENCY;
      } else {
        process.env.FORGE_REVIEW_CONCURRENCY = original;
      }
    }
  });

  it("invalid env falls through to config.md", () => {
    const original = process.env.FORGE_REVIEW_CONCURRENCY;
    process.env.FORGE_REVIEW_CONCURRENCY = "invalid";
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = parseReviewConfig("review.subagent_concurrency: 5\n");
      expect(result).toEqual<ReviewConfig>({ subagent_concurrency: 5 });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("FORGE_REVIEW_CONCURRENCY invalid"),
      );
    } finally {
      warnSpy.mockRestore();
      if (original === undefined) {
        delete process.env.FORGE_REVIEW_CONCURRENCY;
      } else {
        process.env.FORGE_REVIEW_CONCURRENCY = original;
      }
    }
  });
});
