/**
 * Unit tests for knowledge-quota.ts
 *
 * Validates R4 (knowledge near-limit warning):
 *   AC1: ≥ ceil(limit*0.9) triggers near-limit
 *   AC2: below threshold → silent (nearLimit false)
 *   AC3: warning never blocks (pure decision; blocking is caller's concern)
 *   AC4: threshold recomputed for non-default knowledge_limit
 *
 * **Validates: Requirements R4 AC1-AC4**
 */

import { describe, expect, it } from "vitest";
import { checkKnowledgeNearLimit, type KnowledgeQuotaInput } from "../src/knowledge-quota.js";

function input(currentCount: number, limit: number, thresholdRatio?: number): KnowledgeQuotaInput {
  return { currentCount, limit, thresholdRatio };
}

describe("checkKnowledgeNearLimit — default 0.9 ratio", () => {
  it("AC1: triggers at 90% (limit 20, count 18)", () => {
    const result = checkKnowledgeNearLimit(input(18, 20));
    expect(result.nearLimit).toBe(true);
    expect(result.threshold).toBe(18); // ceil(20*0.9)
    expect(result.message).toBeTruthy();
  });

  it("AC1: triggers at exactly the threshold boundary", () => {
    const result = checkKnowledgeNearLimit(input(18, 20));
    expect(result.nearLimit).toBe(true);
  });

  it("AC2: silent below threshold (limit 20, count 17)", () => {
    const result = checkKnowledgeNearLimit(input(17, 20));
    expect(result.nearLimit).toBe(false);
    expect(result.message).toBeUndefined();
  });

  it("AC2: silent at 0 count", () => {
    const result = checkKnowledgeNearLimit(input(0, 20));
    expect(result.nearLimit).toBe(false);
  });

  it("AC2: silent at half", () => {
    const result = checkKnowledgeNearLimit(input(10, 20));
    expect(result.nearLimit).toBe(false);
  });
});

describe("checkKnowledgeNearLimit — custom limit (AC4)", () => {
  it("AC4: limit 10 → threshold 9", () => {
    const result = checkKnowledgeNearLimit(input(9, 10));
    expect(result.nearLimit).toBe(true);
    expect(result.threshold).toBe(9);
  });

  it("AC4: limit 10, count 8 → silent", () => {
    const result = checkKnowledgeNearLimit(input(8, 10));
    expect(result.nearLimit).toBe(false);
  });

  it("AC4: limit 30 → threshold 27", () => {
    const result = checkKnowledgeNearLimit(input(27, 30));
    expect(result.nearLimit).toBe(true);
    expect(result.threshold).toBe(27);
  });

  it("at-limit count always triggers (count == limit)", () => {
    const result = checkKnowledgeNearLimit(input(20, 20));
    expect(result.nearLimit).toBe(true);
  });

  it("over-limit count triggers", () => {
    const result = checkKnowledgeNearLimit(input(25, 20));
    expect(result.nearLimit).toBe(true);
  });
});

describe("checkKnowledgeNearLimit — custom ratio", () => {
  it("custom ratio 0.8 recomputes threshold", () => {
    const result = checkKnowledgeNearLimit(input(16, 20, 0.8));
    expect(result.nearLimit).toBe(true);
    expect(result.threshold).toBe(16);
  });

  it("ceil rounds up fractional threshold", () => {
    // 21 * 0.9 = 18.9 → ceil = 19
    const result = checkKnowledgeNearLimit(input(19, 21));
    expect(result.threshold).toBe(19);
    expect(result.nearLimit).toBe(true);
  });
});

describe("checkKnowledgeNearLimit — message format", () => {
  it("AC1: message mentions near-limit signal and counts", () => {
    const result = checkKnowledgeNearLimit(input(18, 20));
    expect(result.message).toContain("[knowledge-near-limit]");
    expect(result.message).toContain("18");
    expect(result.message).toContain("20");
  });
});
