/**
 * pending-findings.mjs — Serialize P0/P1 findings to markdown for pre-compact persistence.
 *
 * Used by next-step-protocol during inter-phase and intra-wave compact triggers.
 * Output format: YAML frontmatter + markdown table.
 */

const MAX_SUMMARY_BYTES = 80;

/**
 * @param {Array<{severity: string, source: string, fileLine: string, summary: string}>} findings
 * @param {string} taskName
 * @returns {string} markdown string, or "" if no findings
 */
export function serializePendingFindings(findings, taskName) {
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
      `| ${i + 1} | ${f.severity} | ${f.source} | ${f.fileLine} | ${truncateBytes(f.summary, MAX_SUMMARY_BYTES)} |`,
  );

  return [...header, ...rows].join("\n");
}

/**
 * Truncate string to fit within byte budget (handles CJK).
 */
function truncateBytes(s, maxBytes) {
  let result = s;
  while (Buffer.byteLength(result, "utf-8") > maxBytes && result.length > 10) {
    result = result.slice(0, -1);
  }
  if (result !== s) result += "…";
  return result;
}
