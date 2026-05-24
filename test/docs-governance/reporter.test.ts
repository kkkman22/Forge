import { describe, expect, it } from "vitest";
import * as fc from "fast-check";
import type { DiagnosticRecord, Severity } from "../../src/docs-governance/types.js";
import { formatDiagnostics, formatNdjson, summarize, truncateMessage } from "../../src/docs-governance/reporter/diagnostic.js";
import { severityToExitCode } from "../../src/docs-governance/reporter/exit-code.js";
import { ExitCode } from "../../src/docs-governance/types.js";

const makeRecord = (severity: Severity): DiagnosticRecord => ({
  script: "check-docs-test",
  severity,
  file: "docs/test.md" as string & { readonly [Symbol.uniqueSymbol]: void },
  message: "test message",
});

describe("truncateMessage", () => {
  it("leaves short messages unchanged", () => {
    expect(truncateMessage("short")).toBe("short");
  });

  it("truncates messages over 500 chars", () => {
    const long = "a".repeat(501);
    const result = truncateMessage(long);
    expect(result.length).toBeLessThanOrEqual(520); // 500 + suffix
    expect(result.endsWith("…[truncated]")).toBe(true);
  });

  it("keeps 500-char message as-is", () => {
    const exact = "a".repeat(500);
    expect(truncateMessage(exact)).toBe(exact);
  });
});

describe("severityToExitCode", () => {
  it("returns OK for empty array", () => {
    expect(severityToExitCode([])).toBe(ExitCode.OK);
  });

  it("returns CRITICAL for critical severity", () => {
    expect(severityToExitCode([makeRecord("critical")])).toBe(ExitCode.CRITICAL);
  });

  it("returns ERROR for error severity", () => {
    expect(severityToExitCode([makeRecord("error")])).toBe(ExitCode.ERROR);
  });

  it("returns OK for warning severity", () => {
    expect(severityToExitCode([makeRecord("warning")])).toBe(ExitCode.OK);
  });

  it("returns OK for notice severity", () => {
    expect(severityToExitCode([makeRecord("notice")])).toBe(ExitCode.OK);
  });

  it("returns OK for info severity", () => {
    expect(severityToExitCode([makeRecord("info")])).toBe(ExitCode.OK);
  });

  it("takes max severity across multiple records", () => {
    const records = [makeRecord("info"), makeRecord("warning"), makeRecord("error")];
    expect(severityToExitCode(records)).toBe(ExitCode.ERROR);
  });

  it("critical beats error", () => {
    const records = [makeRecord("error"), makeRecord("critical")];
    expect(severityToExitCode(records)).toBe(ExitCode.CRITICAL);
  });

  // PBT: severityToExitCode equals max(severity).toExitCode
  it("PBT: exit code matches max severity", () => {
    const severities: Severity[] = ["critical", "error", "warning", "notice", "info"];
    fc.assert(
      fc.property(fc.array(fc.constantFrom(...severities)), (sevs) => {
        const records = sevs.map(makeRecord);
        const code = severityToExitCode(records);
        if (sevs.length === 0) {
          expect(code).toBe(ExitCode.OK);
          return;
        }
        const hasCritical = sevs.includes("critical");
        const hasError = sevs.includes("error");
        if (hasCritical) expect(code).toBe(ExitCode.CRITICAL);
        else if (hasError) expect(code).toBe(ExitCode.ERROR);
        else expect(code).toBe(ExitCode.OK);
      }),
    );
  });
});

describe("formatDiagnostics", () => {
  it("sorts by severity desc then file asc", () => {
    const records: DiagnosticRecord[] = [
      { script: "a", severity: "warning", file: "b.md" as any, message: "w" },
      { script: "b", severity: "error", file: "a.md" as any, message: "e" },
      { script: "c", severity: "error", file: "b.md" as any, message: "e2" },
    ];
    const result = formatDiagnostics(records);
    const lines = result.split("\n").filter((l) => l.trim());
    // error should come before warning
    const errIdx = lines.findIndex((l) => l.includes("error"));
    const warnIdx = lines.findIndex((l) => l.includes("warning"));
    expect(errIdx).toBeLessThan(warnIdx);
  });

  it("includes summary line at end", () => {
    const records = [makeRecord("error"), makeRecord("warning")];
    const result = formatDiagnostics(records);
    expect(result).toContain("Summary:");
  });
});

describe("formatNdjson", () => {
  it("produces one JSON line per record", () => {
    const records = [makeRecord("error"), makeRecord("warning")];
    const result = formatNdjson(records);
    const lines = result.trim().split("\n");
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });
});

describe("summarize", () => {
  it("counts severities correctly", () => {
    const records = [
      makeRecord("critical"),
      makeRecord("error"),
      makeRecord("error"),
      makeRecord("warning"),
    ];
    const result = summarize(records);
    expect(result).toBe("Summary: 1 critical, 2 error, 1 warning");
  });
});
