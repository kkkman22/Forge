/**
 * T-04: Workflow variant auto-detection tests.
 *
 * resolveSpecVariant: pure function, tier + behaviorScore + architectureScore → variant.
 * scoreTaskDescription: keyword scanning for behavior/architecture signals.
 *
 * Validates: Requirements 2, 8, 13
 */
import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { resolveSpecVariant, scoreTaskDescription } from "../src/spec-variant.js";

// ---------------------------------------------------------------------------
// resolveSpecVariant
// ---------------------------------------------------------------------------

describe("resolveSpecVariant", () => {
  it("Light tier → quick-plan (forced)", () => {
    const result = resolveSpecVariant({ tier: "Light", behaviorScore: 10, architectureScore: 0 });
    expect(result.variant).toBe("quick-plan");
    expect(result.source).toBe("auto");
  });

  it("Full tier → requirements-first (forced)", () => {
    const result = resolveSpecVariant({ tier: "Full", behaviorScore: 0, architectureScore: 10 });
    expect(result.variant).toBe("requirements-first");
    expect(result.source).toBe("auto");
  });

  it("Standard tier with high architecture score → design-first", () => {
    const result = resolveSpecVariant({ tier: "Standard", behaviorScore: 1, architectureScore: 2 });
    expect(result.variant).toBe("design-first");
    expect(result.source).toBe("auto");
  });

  it("Standard tier with high behavior score → requirements-first", () => {
    const result = resolveSpecVariant({
      tier: "Standard",
      behaviorScore: 10,
      architectureScore: 1,
    });
    expect(result.variant).toBe("requirements-first");
    expect(result.source).toBe("auto");
  });

  it("Standard tier with tied scores → requirements-first (default)", () => {
    const result = resolveSpecVariant({ tier: "Standard", behaviorScore: 5, architectureScore: 5 });
    expect(result.variant).toBe("requirements-first");
    expect(result.source).toBe("auto");
  });

  it("Standard tier with tied scores + defaultVariant=design-first → design-first with auto-tied-fallback", () => {
    const result = resolveSpecVariant({
      tier: "Standard",
      behaviorScore: 5,
      architectureScore: 5,
      defaultVariant: "design-first",
    });
    expect(result.variant).toBe("design-first");
    expect(result.source).toBe("auto-tied-fallback");
  });

  it("Light tier ignores defaultVariant", () => {
    const result = resolveSpecVariant({
      tier: "Light",
      behaviorScore: 1,
      architectureScore: 1,
      defaultVariant: "design-first",
    });
    expect(result.variant).toBe("quick-plan");
    expect(result.source).toBe("auto");
  });

  it("Full tier ignores defaultVariant", () => {
    const result = resolveSpecVariant({
      tier: "Full",
      behaviorScore: 1,
      architectureScore: 1,
      defaultVariant: "design-first",
    });
    expect(result.variant).toBe("requirements-first");
    expect(result.source).toBe("auto");
  });

  it("invalid defaultVariant → falls back to requirements-first", () => {
    const result = resolveSpecVariant({
      tier: "Standard",
      behaviorScore: 5,
      architectureScore: 5,
      defaultVariant: "foo" as any,
    });
    expect(result.variant).toBe("requirements-first");
    expect(result.source).toBe("auto");
  });

  // PBT: deterministic
  it("is deterministic — same input always returns same output", () => {
    fc.assert(
      fc.property(
        fc.record({
          tier: fc.constantFrom("Light", "Standard", "Full"),
          behaviorScore: fc.nat({ max: 100 }),
          architectureScore: fc.nat({ max: 100 }),
        }),
        (input) => {
          const a = resolveSpecVariant(input);
          const b = resolveSpecVariant(input);
          expect(a).toEqual(b);
        },
      ),
    );
  });

  // PBT: variant invariants
  it("Light always gives quick-plan regardless of scores", () => {
    fc.assert(
      fc.property(
        fc.record({
          behaviorScore: fc.nat({ max: 1000 }),
          architectureScore: fc.nat({ max: 1000 }),
        }),
        ({ behaviorScore, architectureScore }) => {
          const result = resolveSpecVariant({ tier: "Light", behaviorScore, architectureScore });
          expect(result.variant).toBe("quick-plan");
        },
      ),
    );
  });

  it("Full always gives requirements-first regardless of scores", () => {
    fc.assert(
      fc.property(
        fc.record({
          behaviorScore: fc.nat({ max: 1000 }),
          architectureScore: fc.nat({ max: 1000 }),
        }),
        ({ behaviorScore, architectureScore }) => {
          const result = resolveSpecVariant({ tier: "Full", behaviorScore, architectureScore });
          expect(result.variant).toBe("requirements-first");
        },
      ),
    );
  });
});

// ---------------------------------------------------------------------------
// scoreTaskDescription
// ---------------------------------------------------------------------------

describe("scoreTaskDescription", () => {
  it("behavior keywords → higher behaviorScore", () => {
    const result = scoreTaskDescription("用户应当能看到返回结果显示登录界面");
    expect(result.behaviorScore).toBeGreaterThan(result.architectureScore);
  });

  it("architecture keywords → higher architectureScore", () => {
    const result = scoreTaskDescription("基于 Lambda 用 Postgres 延迟 <100ms");
    expect(result.architectureScore).toBeGreaterThan(result.behaviorScore);
  });

  it("mixed signals → both scores > 0", () => {
    const result = scoreTaskDescription("用户应当通过 Postgres 查询数据");
    expect(result.behaviorScore).toBeGreaterThan(0);
    expect(result.architectureScore).toBeGreaterThan(0);
  });

  it("empty string → both scores = 0", () => {
    const result = scoreTaskDescription("");
    expect(result.behaviorScore).toBe(0);
    expect(result.architectureScore).toBe(0);
  });

  it("Chinese behavior keywords work", () => {
    const result = scoreTaskDescription("用户 显示 返回 应当");
    expect(result.behaviorScore).toBeGreaterThan(0);
  });

  it("English architecture keywords work", () => {
    const result = scoreTaskDescription("Lambda Postgres API REST gRPC latency throughput");
    expect(result.architectureScore).toBeGreaterThan(0);
  });
});
