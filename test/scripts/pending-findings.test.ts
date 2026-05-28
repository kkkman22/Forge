import { describe, it } from "vitest";

interface Finding {
  severity: "P0" | "P1" | "P2" | "P3";
  source: string;
  fileLine: string;
  summary: string;
}

function serializePendingFindings(
  findings: Finding[],
  taskName: string,
): string {
  if (!findings || findings.length === 0) return "";

  const timestamp = new Date().toISOString();
  const header = [
    "---",
    `task: "${taskName}"`,
    `generated_at: "${timestamp}"`,
    `status: "pending"`,
    "---",
    "",
    "| # | Severity | Source | File:Line | Summary |",
    "|---|----------|--------|-----------|---------|",
  ];

  const rows = findings.map(
    (f, i) =>
      `| ${i + 1} | ${f.severity} | ${f.source} | ${f.fileLine} | ${truncate(f.summary, 80)} |`,
  );

  return [...header, ...rows].join("\n");
}

function truncate(s: string, maxBytes: number): string {
  let result = s;
  while (Buffer.byteLength(result, "utf-8") > maxBytes && result.length > 10) {
    result = result.slice(0, -1);
  }
  if (result !== s) result += "…";
  return result;
}

describe("serializePendingFindings", () => {
  it("serializes findings to markdown table with frontmatter", ({
    expect,
  }) => {
    const findings: Finding[] = [
      {
        severity: "P0",
        source: "L3-security",
        fileLine: "auth.ts:42",
        summary: "SQL injection in query builder",
      },
      {
        severity: "P1",
        source: "L2-quality",
        fileLine: "export.ts:15",
        summary: "Missing error handling",
      },
    ];

    const result = serializePendingFindings(findings, "my-task");

    expect(result).toContain('task: "my-task"');
    expect(result).toContain("status: \"pending\"");
    expect(result).toContain("| 1 | P0 | L3-security | auth.ts:42 |");
    expect(result).toContain("| 2 | P1 | L2-quality | export.ts:15 |");
    expect(result).toContain("SQL injection in query builder");
  });

  it("handles empty findings array", ({ expect }) => {
    const result = serializePendingFindings([], "task");
    expect(result).toBe("");
  });

  it("handles null/undefined findings", ({ expect }) => {
    expect(serializePendingFindings(null as any, "task")).toBe("");
    expect(serializePendingFindings(undefined as any, "task")).toBe("");
  });

  it("truncates long summaries", ({ expect }) => {
    const longSummary = "A".repeat(200);
    const findings: Finding[] = [
      {
        severity: "P1",
        source: "L1-spec",
        fileLine: "foo.ts:1",
        summary: longSummary,
      },
    ];

    const result = serializePendingFindings(findings, "task");
    const summaryCell = result.split("|").find((s) => s.includes("AAA"));

    expect(summaryCell).toBeDefined();
    expect(summaryCell!.includes("…")).toBe(true);
  });
});
