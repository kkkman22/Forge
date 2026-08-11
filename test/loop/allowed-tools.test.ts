/**
 * @file Allowed tools contract tests for loop skill.
 *
 * Validates that instructions.md frontmatter lists the required tools
 * for native scheduling (ScheduleWakeup, CronCreate, CronDelete, CronList).
 *
 * RED: Will fail if allowed_tools doesn't include scheduling tools.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const INSTRUCTIONS_PATH = resolve(__dirname, "../../skills/tinkerman/lib/loop/instructions.md");

function readInstructions(): string {
  return readFileSync(INSTRUCTIONS_PATH, "utf-8");
}

function parseAllowedTools(content: string): string[] {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error("No frontmatter found");

  const fmText = match[1];
  const tools: string[] = [];
  let inTools = false;

  for (const line of fmText.split("\n")) {
    if (line.match(/^allowed_tools:/)) {
      inTools = true;
      continue;
    }
    if (inTools) {
      const toolMatch = line.match(/^\s*-\s*(.+)$/);
      if (toolMatch) {
        tools.push(toolMatch[1].trim());
      } else if (line.match(/^\w/)) {
        break;
      }
    }
  }

  return tools;
}

const REQUIRED_TOOLS = ["Read", "Bash", "ScheduleWakeup", "CronCreate", "CronDelete", "CronList"];

describe("Loop Skill allowed tools", () => {
  it("parses allowed_tools list from frontmatter", () => {
    const tools = parseAllowedTools(readInstructions());
    expect(tools.length).toBeGreaterThan(0);
  });

  for (const tool of REQUIRED_TOOLS) {
    it(`includes ${tool} in allowed_tools`, () => {
      const tools = parseAllowedTools(readInstructions());
      expect(tools).toContain(tool);
    });
  }
});
