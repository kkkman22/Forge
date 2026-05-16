import { describe, expect, it } from "vitest";
import {
  type HandoffBlock,
  parseHandoffBlock,
  serializeHandoff,
  validateHandoff,
} from "../../src/handoff-schema.js";

function makeHandoff(overrides: Partial<HandoffBlock> = {}): HandoffBlock {
  return {
    task_id: "T-1",
    completed: ["created src/foo.ts"],
    not_completed: [],
    commands_executed: [{ cmd: "npm run check", exit_code: 0 }],
    issues_found: [],
    procedure_compliance:
      "RED: test/foo.test.ts added failing case\nGREEN: src/foo.ts implemented\nREFACTOR: skipped",
    ...overrides,
  };
}

const validYamlBlock = `\
\`\`\`yaml handoff
task_id: T-1
completed:
  - created src/foo.ts
not_completed: []
commands_executed:
  - cmd: "npm run check"
    exit_code: 0
issues_found: []
procedure_compliance: |
  RED: test/foo.test.ts added failing case
  GREEN: src/foo.ts implemented
  REFACTOR: skipped
\`\`\`
`;

describe("handoff-schema", () => {
  describe("parseHandoffBlock", () => {
    it("parses a valid 5-field handoff block", () => {
      const result = parseHandoffBlock(validYamlBlock);
      expect(result.task_id).toBe("T-1");
      expect(result.completed).toEqual(["created src/foo.ts"]);
      expect(result.commands_executed).toEqual([{ cmd: "npm run check", exit_code: 0 }]);
    });

    it("rejects block missing task_id", () => {
      const block = validYamlBlock.replace("task_id: T-1\n", "");
      expect(() => parseHandoffBlock(block)).toThrow(/task_id/);
    });

    it("rejects block missing completed field", () => {
      const block = validYamlBlock.replace("completed:\n  - created src/foo.ts\n", "");
      expect(() => parseHandoffBlock(block)).toThrow(/completed/);
    });

    it("rejects block missing not_completed field", () => {
      const block = validYamlBlock.replace("not_completed: []\n", "");
      expect(() => parseHandoffBlock(block)).toThrow(/not_completed/);
    });

    it("rejects block missing commands_executed field", () => {
      const block = validYamlBlock.replace(/commands_executed:[\s\S]*?exit_code: 0\n/, "");
      expect(() => parseHandoffBlock(block)).toThrow(/commands_executed/);
    });

    it("rejects block missing issues_found field", () => {
      const block = validYamlBlock.replace("issues_found: []\n", "");
      expect(() => parseHandoffBlock(block)).toThrow(/issues_found/);
    });

    it("rejects block missing procedure_compliance field", () => {
      const block = validYamlBlock.replace(/procedure_compliance:[\s\S]*?skipped\n/, "");
      expect(() => parseHandoffBlock(block)).toThrow(/procedure_compliance/);
    });
  });

  describe("validateHandoff", () => {
    it("passes for a complete valid handoff", () => {
      const result = validateHandoff(makeHandoff());
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("rejects when commands_executed entry lacks cmd field", () => {
      const handoff = makeHandoff({
        commands_executed: [{ cmd: "", exit_code: 0 }],
      });
      const result = validateHandoff(handoff);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("cmd"))).toBe(true);
    });

    it("rejects when commands_executed entry lacks exit_code field", () => {
      const handoff = makeHandoff({
        commands_executed: [{ cmd: "npm run check", exit_code: undefined as unknown as number }],
      });
      const result = validateHandoff(handoff);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("exit_code"))).toBe(true);
    });

    it("rejects when procedure_compliance missing RED/GREEN/REFACTOR keywords", () => {
      const handoff = makeHandoff({
        procedure_compliance: "wrote some code",
      });
      const result = validateHandoff(handoff);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some(
          (e) => e.includes("RED") || e.includes("GREEN") || e.includes("REFACTOR"),
        ),
      ).toBe(true);
    });

    it("accepts procedure_compliance with 'skipped'", () => {
      const handoff = makeHandoff({
        procedure_compliance: "skipped",
      });
      const result = validateHandoff(handoff);
      expect(result.valid).toBe(true);
    });

    it("light tier: passes with only commands_executed and procedure_compliance", () => {
      const result = validateHandoff(
        {
          task_id: "T-1",
          completed: [],
          not_completed: [],
          commands_executed: [{ cmd: "npm run check", exit_code: 0 }],
          issues_found: [],
          procedure_compliance: "skipped",
        },
        { tier: "light" },
      );
      expect(result.valid).toBe(true);
    });
  });

  describe("serializeHandoff", () => {
    it("round-trips: parse(serialize(handoff)) matches original", () => {
      const original = makeHandoff();
      const serialized = serializeHandoff(original);
      const parsed = parseHandoffBlock(serialized);
      expect(parsed).toEqual(original);
    });
  });
});
