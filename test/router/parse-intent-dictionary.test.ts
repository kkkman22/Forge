import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseIntentDictionary } from "../../src/router-intents.js";

describe("parseIntentDictionary", () => {
  it("parses the real templates/router-intents.md with 3 intents", () => {
    const content = readFileSync(
      join(import.meta.dirname, "../../templates/router-intents.md"),
      "utf-8",
    );
    const dict = parseIntentDictionary(content);
    expect(dict).toHaveLength(3);

    const names = dict.map((d) => d.name);
    expect(names).toContain("ultrathink");
    expect(names).toContain("tdd-strict");
    expect(names).toContain("security-deep");
  });

  it("requires non-empty triggers[] for each intent (R3-5)", () => {
    const yaml = `
empty-triggers:
  description: "no triggers"
  triggers: []
  emit_hints:
    - { command: build, tag: test, description: "test" }
`;
    expect(() => parseIntentDictionary(yaml)).toThrow(/triggers.*empty/i);
  });

  it("requires non-empty emit_hints[] for each intent (R3-6)", () => {
    const yaml = `
empty-hints:
  description: "no hints"
  triggers:
    - something
  emit_hints: []
`;
    expect(() => parseIntentDictionary(yaml)).toThrow(/emit_hints.*empty/i);
  });

  it("rejects duplicate triggers across intents (R3-4)", () => {
    const yaml = `
intent-a:
  description: "a"
  triggers:
    - 深思熟虑
    - unique-a
  emit_hints:
    - { command: build, tag: tag-a, description: "a" }
intent-b:
  description: "b"
  triggers:
    - 深思熟虑
    - unique-b
  emit_hints:
    - { command: build, tag: tag-b, description: "b" }
`;
    expect(() => parseIntentDictionary(yaml)).toThrow(/duplicate.*trigger/i);
  });

  it("rejects invalid YAML with missing fields", () => {
    expect(() => parseIntentDictionary("not: yaml")).toThrow();
  });

  it("handles empty input gracefully", () => {
    expect(() => parseIntentDictionary("")).toThrow();
  });

  it("normalizes triggers to NFC lowercase", () => {
    const yaml = `
test-intent:
  description: "test"
  triggers:
    - Café
  emit_hints:
    - { command: build, tag: test, description: "test" }
`;
    const dict = parseIntentDictionary(yaml);
    expect(dict[0].triggers).toContain("café");
  });

  it("preserves all fields in emit_hints", () => {
    const yaml = `
test-intent:
  description: "test"
  triggers:
    - trigger1
  emit_hints:
    - { command: build, tag: my-tag, description: "my desc" }
`;
    const dict = parseIntentDictionary(yaml);
    expect(dict[0].emit_hints).toHaveLength(1);
    expect(dict[0].emit_hints[0]).toEqual({
      command: "build",
      tag: "my-tag",
      description: "my desc",
    });
  });
});
