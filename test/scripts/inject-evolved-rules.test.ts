import { describe, it } from "vitest";

function extractContentOnly(markdown: string | null | undefined): string {
  if (!markdown) return "";
  const lines = markdown.split("\n");
  const result: string[] = [];
  let inRule = false;

  for (const line of lines) {
    if (/^### R\d+:/.test(line)) {
      inRule = true;
      result.push(line);
      continue;
    }
    if (!inRule) {
      result.push(line);
      continue;
    }
    if (/^\*\*Content\*\*:/.test(line)) {
      result.push(line);
      continue;
    }
    if (line.startsWith("### ") || line.startsWith("<!-- ")) {
      inRule = false;
      result.push(line);
      continue;
    }
    if (
      /^\*\*(Prevents|Source|Added|Confidence|Last_triggered|Infra_Ref)\*\*:/.test(
        line,
      )
    ) {
      continue;
    }
    if (inRule && line.trim() === "") {
      result.push(line);
      continue;
    }
    if (inRule && !/^\*\*/.test(line)) {
      result.push(line);
      continue;
    }
    if (!inRule) {
      result.push(line);
    }
  }

  return result.join("\n");
}

describe("extractContentOnly", () => {
  it("extracts only Content lines from rules, strips metadata", ({ expect }) => {
    const input = `# Error-Prevention Rules

### R1: Test Rule

**Content**: This is the core rule statement.
**Prevents**: Some error
**Source**: knowledge/file.md
**Added**: 2026-01-01
**Confidence**: 0.8

### R2: Another Rule

**Content**: Second rule content here.
**Prevents**: Another error`;

    const result = extractContentOnly(input);

    expect(result).toContain("**Content**: This is the core rule statement.");
    expect(result).toContain("**Content**: Second rule content here.");
    expect(result).toContain("### R1: Test Rule");
    expect(result).toContain("### R2: Another Rule");
    expect(result).not.toContain("**Prevents**:");
    expect(result).not.toContain("**Source**:");
    expect(result).not.toContain("**Added**:");
    expect(result).not.toContain("**Confidence**:");
  });

  it("produces output smaller than 1.5KB for 12 rules", ({ expect }) => {
    const rules = Array.from(
      { length: 12 },
      (_, i) =>
        `### R${i + 1}: Rule ${i + 1}\n\n**Content**: ${"A".repeat(60)} rule ${i + 1}.\n**Prevents**: Error ${i + 1}\n**Source**: source-${i + 1}\n**Added**: 2026-01-01\n**Confidence**: 0.8`,
    ).join("\n\n");

    const result = extractContentOnly(`# Rules\n\n${rules}`);
    expect(Buffer.byteLength(result, "utf-8")).toBeLessThan(1500);
  });

  it("handles empty/null/undefined input", ({ expect }) => {
    expect(extractContentOnly("")).toBe("");
    expect(extractContentOnly(null)).toBe("");
    expect(extractContentOnly(undefined)).toBe("");
  });

  it("preserves non-rule content (comments, intro text)", ({ expect }) => {
    const input = `# Rules

<!-- Rule format -->
Intro text.

### R1: First

**Content**: Rule one.
**Prevents**: Something`;

    const result = extractContentOnly(input);
    expect(result).toContain("<!-- Rule format -->");
    expect(result).toContain("Intro text.");
    expect(result).not.toContain("**Prevents**:");
  });
});
