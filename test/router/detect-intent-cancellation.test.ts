import * as fc from "fast-check";
import { describe, expect, it } from "vitest";
import { detectIntentCancellation } from "../../src/router-intents.js";

const KNOWN_INTENTS = ["ultrathink", "tdd-strict", "security-deep"];

describe("detectIntentCancellation", () => {
  describe("cancel all intents", () => {
    it.each([
      "取消",
      "忽略",
      "不要",
      "跳过",
      "撤销",
      "cancel",
      "skip",
      "no intent",
      "ignore",
    ])('detects global cancel keyword "%s"', (keyword) => {
      const result = detectIntentCancellation(keyword, KNOWN_INTENTS);
      expect(result.cancelAll).toBe(true);
      expect(result.cancelByName).toHaveLength(0);
    });

    it("is case-insensitive for cancel keywords", () => {
      expect(detectIntentCancellation("CANCEL", KNOWN_INTENTS).cancelAll).toBe(true);
      expect(detectIntentCancellation("Skip", KNOWN_INTENTS).cancelAll).toBe(true);
      expect(detectIntentCancellation("IGNORE", KNOWN_INTENTS).cancelAll).toBe(true);
    });
  });

  describe("cancel specific intent by name", () => {
    it("cancels ultrathink when user says '忽略 ultrathink'", () => {
      const result = detectIntentCancellation("忽略 ultrathink", KNOWN_INTENTS);
      expect(result.cancelAll).toBe(false);
      expect(result.cancelByName).toEqual(["ultrathink"]);
    });

    it("cancels multiple named intents", () => {
      const result = detectIntentCancellation("忽略 ultrathink 和 tdd-strict", KNOWN_INTENTS);
      expect(result.cancelAll).toBe(false);
      expect(result.cancelByName).toEqual(["ultrathink", "tdd-strict"]);
    });
  });

  describe("no cancellation", () => {
    it("returns no cancellation for normal text", () => {
      const result = detectIntentCancellation("确认，按这个来", KNOWN_INTENTS);
      expect(result.cancelAll).toBe(false);
      expect(result.cancelByName).toHaveLength(0);
    });

    it("returns no cancellation for empty text", () => {
      const result = detectIntentCancellation("", KNOWN_INTENTS);
      expect(result.cancelAll).toBe(false);
      expect(result.cancelByName).toHaveLength(0);
    });
  });

  describe("edge cases", () => {
    it("cancel keyword + intent name = cancel by name (not cancel all)", () => {
      const result = detectIntentCancellation("取消 ultrathink", KNOWN_INTENTS);
      expect(result.cancelAll).toBe(false);
      expect(result.cancelByName).toEqual(["ultrathink"]);
    });

    it("cancel keyword without known intent name = cancel all", () => {
      const result = detectIntentCancellation("取消 intent 信号", KNOWN_INTENTS);
      expect(result.cancelAll).toBe(true);
      expect(result.cancelByName).toHaveLength(0);
    });
  });
});

describe("detectIntentCancellation PBT", () => {
  it("cancelAll is true only when cancel keyword present and no intent name present", () => {
    const _cancelKeywords = [
      "取消",
      "忽略",
      "不要",
      "跳过",
      "撤销",
      "cancel",
      "skip",
      "no intent",
      "ignore",
    ];
    fc.assert(
      fc.property(fc.boolean(), fc.string({ minLength: 0, maxLength: 20 }), (hasCancel, noise) => {
        const text = hasCancel ? `${noise} cancel ${noise}` : noise;
        const result = detectIntentCancellation(text, KNOWN_INTENTS);
        if (hasCancel && !KNOWN_INTENTS.some((i) => text.toLowerCase().includes(i))) {
          expect(result.cancelAll).toBe(true);
        }
      }),
    );
  });
});
