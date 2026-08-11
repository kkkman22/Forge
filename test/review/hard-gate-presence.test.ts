import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");
const instructionsPath = join(projectRoot, "skills/tinkerman/lib/review/instructions.md");
const distPluginInstructionsPath = join(
  projectRoot,
  "dist-plugin/skills/tinkerman/lib/review/instructions.md",
);

describe("Hard-gate presence", () => {
  it('skills/tinkerman/lib/review/instructions.md contains <HARD-GATE name="no-mainagent-review">', () => {
    const content = readFileSync(instructionsPath, "utf-8");
    expect(content).toContain('<HARD-GATE name="no-mainagent-review">');
  });

  it("Hard-gate section enumerates 4 forbidden forms", () => {
    const content = readFileSync(instructionsPath, "utf-8");

    // Check that the hard-gate section exists
    expect(content).toContain('<HARD-GATE name="no-mainagent-review">');

    // Check that all 4 forbidden forms are mentioned
    expect(content).toContain("直接 Read diff 自评");
    expect(content).toContain("调用本地工具自评");
    expect(content).toContain("Skill 内联自评");
    expect(content).toContain("重写已有 subagent 报告");

    // Check that the hard-gate closing tag exists
    expect(content).toContain("</HARD-GATE>");
  });

  it("dist-plugin mirror has identical Hard-gate content", () => {
    const sourceContent = readFileSync(instructionsPath, "utf-8");
    const distContent = readFileSync(distPluginInstructionsPath, "utf-8");

    // Extract hard-gate sections from both files
    const extractHardGateSection = (content: string): string => {
      const start = content.indexOf('<HARD-GATE name="no-mainagent-review">');
      if (start === -1) return "";
      const end = content.indexOf("</HARD-GATE>", start);
      if (end === -1) return "";
      return content.slice(start, end + "</HARD-GATE>".length);
    };

    const sourceHardGate = extractHardGateSection(sourceContent);
    const distHardGate = extractHardGateSection(distContent);

    expect(sourceHardGate).toBeTruthy();
    expect(distHardGate).toBeTruthy();
    expect(distHardGate).toBe(sourceHardGate);
  });
});
