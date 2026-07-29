/**
 * Test_Output_Trimmer — serialize/deserialize test runner output.
 *
 * Extracted from `context-budget.ts` (audit P2 #9 god-file split).
 */

/** @public */
export interface TestOutputSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  failures: Array<{
    testName: string;
    filePath: string;
    line: number;
    errorMessage: string;
  }>;
  parseFailed?: boolean;
}

/** @public */
export function serializeTestOutput(summary: TestOutputSummary): string {
  if (summary.failed === 0) {
    return `\u2713 ${summary.passed}/${summary.total} tests passed (0 failed, ${summary.skipped} skipped) in ${(summary.duration / 1000).toFixed(1)}s`;
  }

  const lines: string[] = [
    `\u2717 ${summary.failed} failed, ${summary.passed} passed, ${summary.skipped} skipped in ${(summary.duration / 1000).toFixed(1)}s`,
  ];

  for (const f of summary.failures) {
    lines.push(`  FAIL ${f.testName} (${f.filePath}:${f.line})`);
    lines.push(`    ${f.errorMessage}`);
  }

  return lines.join("\n");
}

/** @public */
export function canParseTestOutput(text: string): boolean {
  const firstLine = text.split("\n")[0].trim();
  return (
    !!firstLine.match(/^✓ (\d+)\/(\d+) tests passed \(0 failed, (\d+) skipped\) in ([\d.]+)s$/) ||
    !!firstLine.match(/^✗ (\d+) failed, (\d+) passed, (\d+) skipped in ([\d.]+)s$/)
  );
}

/** @public */
export function deserializeTestOutput(text: string): TestOutputSummary {
  const result: TestOutputSummary = {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0,
    duration: 0,
    failures: [],
  };

  const firstLine = text.split("\n")[0].trim();

  // All-pass format: ✓ N/M tests passed (0 failed, N skipped) in Xs
  const passMatch = firstLine.match(
    /^✓ (\d+)\/(\d+) tests passed \(0 failed, (\d+) skipped\) in ([\d.]+)s$/,
  );
  if (passMatch) {
    result.passed = Number.parseInt(passMatch[1], 10);
    result.total = Number.parseInt(passMatch[2], 10);
    result.failed = 0;
    result.skipped = Number.parseInt(passMatch[3], 10);
    result.duration = Math.round(Number.parseFloat(passMatch[4]) * 1000);
    return result;
  }

  // Failure format: ✗ N failed, N passed, N skipped in Xs
  const failMatch = firstLine.match(/^✗ (\d+) failed, (\d+) passed, (\d+) skipped in ([\d.]+)s$/);
  if (failMatch) {
    result.failed = Number.parseInt(failMatch[1], 10);
    result.passed = Number.parseInt(failMatch[2], 10);
    result.skipped = Number.parseInt(failMatch[3], 10);
    result.duration = Math.round(Number.parseFloat(failMatch[4]) * 1000);
    result.total = result.failed + result.passed + result.skipped;
  } else {
    result.parseFailed = true;
    return result;
  }

  // Parse failure entries
  const allLines = text.split("\n");
  let i = 1;
  while (i < allLines.length) {
    const m = allLines[i].match(/^\s*FAIL (.+) \((.+):(\d+)\)$/);
    if (m) {
      const errorMsg = i + 1 < allLines.length ? allLines[i + 1].replace(/^\s{4}/, "") : "";
      result.failures.push({
        testName: m[1],
        filePath: m[2],
        line: Number.parseInt(m[3], 10),
        errorMessage: errorMsg,
      });
      i += 2;
      continue;
    }
    i++;
  }

  return result;
}
