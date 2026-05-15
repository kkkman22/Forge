import { describe, it, expect } from "vitest";
import { computeSpecHash, parseHealthCache, shouldRecompute } from "../src/spec-health.js";

describe("computeSpecHash", () => {
  it("returns consistent sha256 hex for same content", () => {
    const content = "Given a spec\nWhen run\nThen pass";
    expect(computeSpecHash(content)).toBe(computeSpecHash(content));
    expect(computeSpecHash(content)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns different hash for different content", () => {
    expect(computeSpecHash("abc")).not.toBe(computeSpecHash("def"));
  });
});

describe("parseHealthCache", () => {
  it("returns null when no health field in frontmatter", () => {
    const fm = { status: "locked", topic: "test" };
    expect(parseHealthCache(fm)).toBeNull();
  });

  it("returns cached data when health field exists", () => {
    const fm = {
      status: "locked",
      topic: "test",
      health: { score: 0.9, verdict: "healthy", spec_hash: "abc123", generated_at: "2026-01-01" },
    };
    const cache = parseHealthCache(fm);
    expect(cache).not.toBeNull();
    expect(cache!.specHash).toBe("abc123");
    expect(cache!.score).toBe(0.9);
  });
});

describe("shouldRecompute", () => {
  it("returns true when spec hash differs", () => {
    expect(shouldRecompute("hash_a", { specHash: "hash_b", score: 1.0, verdict: "healthy", generatedAt: "" })).toBe(true);
  });

  it("returns false when spec hash matches", () => {
    expect(shouldRecompute("hash_a", { specHash: "hash_a", score: 1.0, verdict: "healthy", generatedAt: "" })).toBe(false);
  });

  it("returns true when cache is null", () => {
    expect(shouldRecompute("hash_a", null)).toBe(true);
  });
});
