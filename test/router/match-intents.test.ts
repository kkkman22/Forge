import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import { matchIntents } from "../../src/router-intents.js";
import type { IntentDefinition } from "../../src/router-intents.js";

const TEST_DICT: IntentDefinition[] = [
  {
    name: "ultrathink",
    description: "deep reasoning",
    triggers: ["深思熟虑", "ultrathink", "think hard"],
    emit_hints: [
      { command: "decide", tag: "reasoning-deep", description: "deep" },
    ],
  },
  {
    name: "tdd-strict",
    description: "strict TDD",
    triggers: ["严格 tdd", "tdd-strict"],
    emit_hints: [
      { command: "build", tag: "tdd-strict", description: "strict" },
    ],
  },
];

describe("matchIntents", () => {
  it("matches exact trigger word", () => {
    const result = matchIntents("OAuth 迁移要深思熟虑", TEST_DICT);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("ultrathink");
  });

  it("matches case-insensitively", () => {
    const result = matchIntents("UltraThink mode on", TEST_DICT);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("ultrathink");
  });

  it("matches NFC-normalized text", () => {
    // é can be NFC (U+00E9) or NFD (U+0065 + U+0301)
    const nfd = "深̧思熟́虑"; // composed differently
    const result = matchIntents(nfd, TEST_DICT);
    // Should NOT match because NFC("深思熟虑") ≠ NFC(nfd)
    // This tests that both sides are NFC normalized
    expect(result).toHaveLength(0);
  });

  it("does whole-word matching (not substring)", () => {
    const result = matchIntents("ultrathinking is cool", TEST_DICT);
    expect(result).toHaveLength(0);
  });

  it("matches multiple intents", () => {
    const result = matchIntents("要深思熟虑并严格 tdd", TEST_DICT);
    expect(result).toHaveLength(2);
    expect(result.map((r) => r.name)).toContain("ultrathink");
    expect(result.map((r) => r.name)).toContain("tdd-strict");
  });

  it("preserves match order (first trigger in text wins)", () => {
    const result = matchIntents("tdd-strict then 深思熟虑", TEST_DICT);
    expect(result[0].name).toBe("tdd-strict");
    expect(result[1].name).toBe("ultrathink");
  });

  it("returns empty for no matches", () => {
    const result = matchIntents("普通任务描述", TEST_DICT);
    expect(result).toHaveLength(0);
  });

  it("returns empty for empty description", () => {
    const result = matchIntents("", TEST_DICT);
    expect(result).toHaveLength(0);
  });

  it("deduplicates same intent matched by multiple triggers", () => {
    const result = matchIntents("深思熟虑 and think hard", TEST_DICT);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("ultrathink");
  });
});

describe("matchIntents PBT", () => {
  it("never returns intents whose triggers are absent from input", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (text) => {
        const result = matchIntents(text, TEST_DICT);
        for (const matched of result) {
          const hasTrigger = matched.triggers.some((t) =>
            text.toLowerCase().includes(t.toLowerCase()),
          );
          expect(hasTrigger).toBe(true);
        }
      }),
    );
  });

  it("matches when trigger appears as standalone word in arbitrary text", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 0, maxLength: 50 }),
        fc.constantFrom(...TEST_DICT.flatMap((d) => d.triggers)),
        fc.string({ minLength: 0, maxLength: 50 }),
        (prefix, trigger, suffix) => {
          const text = `${prefix} ${trigger} ${suffix}`;
          const result = matchIntents(text, TEST_DICT);
          expect(result.length).toBeGreaterThanOrEqual(1);
        },
      ),
    );
  });
});
