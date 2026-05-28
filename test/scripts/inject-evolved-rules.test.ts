import { describe, it } from "vitest";

const MAX_CONTENT_BYTES = 80;

function extractContentOnly(markdown: string | null | undefined): string {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const result: string[] = ["## Evolved Rules (content-only)"];
  let inRule = false;
  let inFrontmatter = false;

  for (const line of lines) {
    if (line.trim() === "---") {
      inFrontmatter = !inFrontmatter;
      continue;
    }
    if (inFrontmatter) continue;

    if (/^### R\d+:/.test(line)) {
      inRule = true;
      result.push("", line);
      continue;
    }
    if (!inRule) continue;

    if (/^\*\*Content\*\*:/.test(line)) {
      let truncated = line;
      while (Buffer.byteLength(truncated, "utf-8") > MAX_CONTENT_BYTES && truncated.length > 10) {
        truncated = truncated.slice(0, -1);
      }
      if (truncated !== line) truncated += "…";
      result.push(truncated);
      continue;
    }

    if (/^### |^<!-- |^## /.test(line)) {
      inRule = false;
      continue;
    }

    if (/^\*\*(Prevents|Source|Added|Confidence|Last_triggered|Infra_Ref)\*\*:/.test(line)) {
    }
  }

  return result.join("\n");
}

describe("extractContentOnly", () => {
  it("extracts only Content lines from rules, strips metadata", ({ expect }) => {
    const input = `---
updated: "2026-01-01"
---

# Error-Prevention Rules

### R1: Test Rule

**Content**: Short rule.
**Prevents**: Some error
**Source**: knowledge/file.md
**Added**: 2026-01-01
**Confidence**: 0.8

### R2: Another Rule

**Content**: Second rule content here.
**Prevents**: Another error`;

    const result = extractContentOnly(input);

    expect(result).toContain("**Content**: Short rule.");
    expect(result).toContain("### R1: Test Rule");
    expect(result).toContain("### R2: Another Rule");
    expect(result).not.toContain("**Prevents**:");
    expect(result).not.toContain("**Source**:");
    expect(result).toContain("## Evolved Rules (content-only)");
    // Frontmatter and intro text should be stripped
    expect(result).not.toContain("Error-Prevention Rules");
  });

  it("truncates long Content lines to byte budget", ({ expect }) => {
    const longContent = "A".repeat(200);
    const input = `### R1: Long Rule\n\n**Content**: ${longContent}\n**Prevents**: Something`;

    const result = extractContentOnly(input);
    const contentLine = result.split("\n").find((l) => l.startsWith("**Content**"))!;

    expect(Buffer.byteLength(contentLine, "utf-8")).toBeLessThanOrEqual(MAX_CONTENT_BYTES + 10); // +10 for "…" and rounding
    expect(contentLine).toContain("…");
  });

  it("handles empty/null/undefined input", ({ expect }) => {
    expect(extractContentOnly("")).toBe("");
    expect(extractContentOnly(null)).toBe("");
    expect(extractContentOnly(undefined)).toBe("");
  });

  it("handles input with no rules (just header text)", ({ expect }) => {
    const result = extractContentOnly("# Rules\n\nNo rules yet.");
    expect(result).toBe("## Evolved Rules (content-only)");
  });
});
