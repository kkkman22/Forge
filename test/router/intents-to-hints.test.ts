import { describe, expect, it } from "vitest";
import type { IntentDefinition } from "../../src/router-intents.js";
import { intentsToHints } from "../../src/router-intents.js";

const TEST_INTENTS: IntentDefinition[] = [
  {
    name: "ultrathink",
    description: "deep reasoning",
    triggers: ["深思熟虑"],
    emit_hints: [
      { command: "decide", tag: "reasoning-deep", description: "deep decide" },
      { command: "plan", tag: "reasoning-deep", description: "deep plan" },
    ],
  },
  {
    name: "tdd-strict",
    description: "strict TDD",
    triggers: ["tdd-strict"],
    emit_hints: [{ command: "build", tag: "tdd-strict", description: "strict build" }],
  },
];

describe("intentsToHints", () => {
  it("converts matched intents to RouteHint[] with source=intent", () => {
    const hints = intentsToHints([TEST_INTENTS[0]]);
    expect(hints).toHaveLength(2);
    expect(hints[0]).toEqual({
      command: "decide",
      tag: "reasoning-deep",
      description: "deep decide",
      source: "intent",
    });
  });

  it("preserves order of emit_hints across intents", () => {
    const hints = intentsToHints(TEST_INTENTS);
    expect(hints).toHaveLength(3);
    expect(hints[0].tag).toBe("reasoning-deep");
    expect(hints[1].tag).toBe("reasoning-deep");
    expect(hints[2].tag).toBe("tdd-strict");
  });

  it("returns empty array for no matched intents", () => {
    const hints = intentsToHints([]);
    expect(hints).toHaveLength(0);
  });

  it("sets source=intent on every hint", () => {
    const hints = intentsToHints(TEST_INTENTS);
    for (const h of hints) {
      expect(h.source).toBe("intent");
    }
  });
});
