/**
 * Review_Summarizer — serialize/deserialize review reports.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split).
 */

/** @public */
export interface ReviewSummary {
  filePath: string;
  severityCounts: { p0: number; p1: number; p2: number; p3: number };
  findings: Array<{
    severity: "P0" | "P1" | "P2" | "P3";
    filePath: string;
    line: number;
    description: string;
  }>;
}

/** @public */
export function serializeReviewSummary(summary: ReviewSummary): string {
  const { severityCounts, findings, filePath } = summary;
  const total = severityCounts.p0 + severityCounts.p1 + severityCounts.p2 + severityCounts.p3;

  if (total === 0 && findings.length === 0) {
    return `\u{1F4CB} \u{8BC4}\u{5BA1}\u{901A}\u{8FC7}\u{FF0C}\u{96F6}\u{53D1}\u{73B0}\u{FF08}\u{8BE6}\u{89C1} ${filePath}\u{FF09}`;
  }

  const lines: string[] = [
    `\u{1F4CB} \u{8BC4}\u{5BA1}\u{7ED3}\u{679C}\u{6458}\u{8981}\u{FF08}\u{8BE6}\u{89C1} ${filePath}\u{FF09}`,
    `  P0: ${severityCounts.p0} | P1: ${severityCounts.p1} | P2: ${severityCounts.p2} | P3: ${severityCounts.p3}`,
  ];

  for (const f of findings) {
    lines.push(`  ${f.severity}: ${f.filePath}:${f.line} \u2014 ${f.description}`);
  }

  return lines.join("\n");
}

/** @public */
export function deserializeReviewSummary(text: string): ReviewSummary {
  const result: ReviewSummary = {
    filePath: "",
    severityCounts: { p0: 0, p1: 0, p2: 0, p3: 0 },
    findings: [],
  };

  const lines = text.split("\n");

  // Extract filePath from first line
  const headerMatch = text.match(/详见 (.+?)）/u) ?? text.match(/（详见 (.+?)）/u);
  if (headerMatch) {
    result.filePath = headerMatch[1];
  }

  for (const line of lines) {
    let m: RegExpMatchArray | null;

    m = line.match(/^\s*P0: (\d+) \| P1: (\d+) \| P2: (\d+) \| P3: (\d+)$/);
    if (m) {
      result.severityCounts = {
        p0: Number.parseInt(m[1], 10),
        p1: Number.parseInt(m[2], 10),
        p2: Number.parseInt(m[3], 10),
        p3: Number.parseInt(m[4], 10),
      };
      continue;
    }

    m = line.match(/^\s*(P[0-3]): (.+):(\d+) — (.+)$/);
    if (m) {
      if (!["P0", "P1", "P2", "P3"].includes(m[1])) continue;
      result.findings.push({
        severity: m[1] as "P0" | "P1" | "P2" | "P3",
        filePath: m[2],
        line: Number.parseInt(m[3], 10),
        description: m[4],
      });
    }
  }

  return result;
}
