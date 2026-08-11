import { describe, expect, it } from "vitest";
import { formatPackageSummary, PackageSummarySchema } from "../src/schemas/package-summary.js";

describe("PackageSummarySchema", () => {
  it("accepts a bounded package summary", () => {
    const parsed = PackageSummarySchema.parse({
      status: "done",
      package_id: "P1",
      tasks_completed: ["T-01"],
      changed_files: { items: ["src/a.ts"], overflow_count: 0 },
      commands: [
        {
          cmd: "npx vitest run test/a.test.ts",
          result: "pass",
          evidence_path: ".tinkerman/runs/a.log",
        },
      ],
      findings: { p0: 0, p1: 0, highest_risk: "none" },
      blockers: [],
      report_path: ".tinkerman/runs/run/packages/P1.md",
      next_action: "package:P2",
    });

    expect(parsed.status).toBe("done");
  });

  it("rejects unbounded changed file and command lists", () => {
    expect(() =>
      PackageSummarySchema.parse({
        status: "done",
        package_id: "P1",
        tasks_completed: [],
        changed_files: { items: ["1", "2", "3", "4", "5", "6"], overflow_count: 0 },
        commands: [
          { cmd: "a", result: "pass", evidence_path: "a" },
          { cmd: "b", result: "pass", evidence_path: "b" },
          { cmd: "c", result: "pass", evidence_path: "c" },
          { cmd: "d", result: "pass", evidence_path: "d" },
        ],
        findings: { p0: 0, p1: 0, highest_risk: "none" },
        blockers: [],
        report_path: "report",
        next_action: "done",
      }),
    ).toThrow();
  });

  it("formats a compact summary without raw command output", () => {
    const summary = formatPackageSummary({
      status: "done",
      package_id: "P1",
      tasks_completed: ["T-01", "T-02"],
      changed_files: { items: ["src/a.ts"], overflow_count: 2 },
      commands: [
        { cmd: "npm run check", result: "pass", evidence_path: ".tinkerman/runs/check.log" },
      ],
      findings: { p0: 0, p1: 0, highest_risk: "none" },
      blockers: [],
      report_path: ".tinkerman/runs/P1.md",
      next_action: "package:P2",
    });

    expect(summary).toContain("package_id: P1");
    expect(summary).toContain("changed_files: 1 (+2 more)");
    expect(summary).not.toContain("stdout");
  });
});
