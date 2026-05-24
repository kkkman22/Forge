import { describe, expect, it } from "vitest";

describe("scan-literal-mismatches patterns", () => {
  const patterns = [
    /(\d+)\s*(?:个\s*)?(?:命令|commands?)(?!\w)/giu,
    /(\d+)\s*(?:个\s*)?(?:子命令|sub-?commands?)(?!\w)/giu,
  ];

  it("matches Chinese command count", () => {
    const text = "系统提供了 22 个命令";
    patterns[0].lastIndex = 0;
    const match = patterns[0].exec(text);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("22");
  });

  it("matches English command count", () => {
    const text = "There are 18 commands available";
    patterns[0].lastIndex = 0;
    const match = patterns[0].exec(text);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("18");
  });

  it("matches sub-command count", () => {
    const text = "包含 5 个子命令";
    patterns[1].lastIndex = 0;
    const match = patterns[1].exec(text);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe("5");
  });

  it("does not match inside code block detection", () => {
    const lines = ["```", "22 个命令", "```", "实际 22 个命令在外面"];
    // Simple code block detection
    let inBlock = false;
    let insideCodeCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trimStart().startsWith("```")) {
        inBlock = !inBlock;
        continue;
      }
      if (inBlock) {
        insideCodeCount++;
      }
    }
    expect(insideCodeCount).toBe(1); // Only the line inside the code block
  });
});
