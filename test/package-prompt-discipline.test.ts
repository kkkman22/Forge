import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..");

function read(relPath: string): string {
  return readFileSync(resolve(ROOT, relPath), "utf-8");
}

describe("package decision prompt discipline", () => {
  it("uses AskUserQuestion for package split, package boundary, and resume choices", () => {
    const plan = read("skills/forge/lib/plan/instructions.md");
    const build = read("skills/forge/lib/build/instructions.md");
    const resume = read("skills/forge/lib/resume/instructions.md");
    const shared = read("shared/next-step-protocol.md");

    expect(plan).toContain("AskUserQuestion");
    expect(plan).toContain("package split");
    expect(build).toContain("AskUserQuestion");
    expect(build).toContain("package boundary");
    expect(resume).toContain("AskUserQuestion");
    expect(resume).toContain("current_package");
    expect(shared).toContain("package split");
    expect(shared).toContain("package-boundary resume");
  });

  it("does not tell users to type commands for package continuation decisions", () => {
    const resume = read("skills/forge/lib/resume/instructions.md");
    expect(resume).not.toMatch(/等待用户确认/);
    expect(resume).not.toMatch(/确认\s*→\s*从定位的任务继续 `\/forge build`/);
  });
});
