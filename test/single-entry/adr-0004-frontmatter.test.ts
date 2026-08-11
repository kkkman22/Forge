import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = resolve(import.meta.dirname, "..", "..");
const ADR_PATH = resolve(ROOT, ".tinkerman/decisions/ADR-0004-skills-collapse-and-dispatcher.md");

describe("R6.1: ADR-0004 exists and has correct frontmatter", () => {
  it("ADR-0004 file exists", () => {
    expect(existsSync(ADR_PATH)).toBe(true);
  });

  it("frontmatter has id: ADR-0004", () => {
    const content = readFileSync(ADR_PATH, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).toBeTruthy();
    expect(fm![1]).toMatch(/id:\s*ADR-0004\b/);
  });

  it("frontmatter has status: accepted", () => {
    const content = readFileSync(ADR_PATH, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).toBeTruthy();
    expect(fm![1]).toMatch(/status:\s*accepted\b/);
  });

  it("frontmatter has date: 2026-05-17", () => {
    const content = readFileSync(ADR_PATH, "utf-8");
    const fm = content.match(/^---\n([\s\S]*?)\n---/);
    expect(fm).toBeTruthy();
    expect(fm![1]).toMatch(/date:\s*2026-05-17/);
  });

  it("frontmatter references ADR-0003 in supersedes_partial", () => {
    const content = readFileSync(ADR_PATH, "utf-8");
    expect(content).toMatch(/supersedes_partial.*ADR-0003/);
  });
});

describe("R6.2: ADR-0003 updated with supersedes note", () => {
  const ADR3_PATH = resolve(
    ROOT,
    ".tinkerman/decisions/ADR-0003-single-entry-command-consolidation.md",
  );

  it("ADR-0003 contains update note referencing ADR-0004", () => {
    const content = readFileSync(ADR3_PATH, "utf-8");
    expect(content).toMatch(/ADR-0004/);
    expect(content).toMatch(/supersedes_partial|Update 2026-05-17/);
  });
});
