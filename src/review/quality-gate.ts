/**
 * Report quality gate — 6-item quality validation on the final report.
 *
 * @module review/quality-gate
 */

import type { MergedFinding, QualityGateOptions, QualityGateResult } from "./types.js";

/**
 * Vague language patterns in suggestions that indicate low-quality findings.
 */
export const DEFAULT_VAGUE_PATTERNS: string[] = [
  "考虑改进",
  "可能需要",
  "也许应该",
  "consider improving",
  "might need",
];

/**
 * Style-only keywords in descriptions.
 */
export const DEFAULT_STYLE_KEYWORDS: string[] = [
  "缩进",
  "分号",
  "空格",
  "格式",
  "indent",
  "semicolon",
  "whitespace",
  "formatting",
];

/**
 * Linter-detectable keywords.
 */
export const DEFAULT_LINTER_KEYWORDS: string[] = [
  "缺少分号",
  "缩进错误",
  "trailing comma",
  "missing semicolon",
  "indent error",
];

/**
 * Run the 6-item report quality gate.
 *
 * Per SKILL.md §7.3, checks:
 *   1. Actionable: every finding has a non-empty suggestion
 *   2. No false positives: suggestion should not contain vague language
 *   3. Severity calibrated: P0/P1 are not used for style-only issues
 *   4. Line number accuracy: all line numbers are positive integers
 *   5. No linter overlap: no findings that are purely formatting issues
 *   6. Protected files: no findings suggesting deletion of .tinkerman/ files
 */
export function runReportQualityGate(
  findings: MergedFinding[],
  options?: QualityGateOptions,
): QualityGateResult {
  const vaguePatterns = options?.vaguePatterns ?? DEFAULT_VAGUE_PATTERNS;
  const styleKeywords = options?.styleKeywords ?? DEFAULT_STYLE_KEYWORDS;
  const linterKeywords = options?.linterKeywords ?? DEFAULT_LINTER_KEYWORDS;

  const items = [];

  const allActionable = findings.every((f) => f.suggestion.trim().length > 0);
  items.push({ name: "可操作性", passed: allActionable });

  const noVagueSuggestions = findings.every(
    (f) => !vaguePatterns.some((p) => f.suggestion.toLowerCase().includes(p.toLowerCase())),
  );
  items.push({ name: "误报排除", passed: noVagueSuggestions });

  const severityCalibrated = findings.every((f) => {
    if (f.severity === "P0" || f.severity === "P1") {
      const desc = f.description.toLowerCase();
      return !styleKeywords.some((kw) => desc.includes(kw.toLowerCase()));
    }
    return true;
  });
  items.push({ name: "严重度校准", passed: severityCalibrated });

  const lineNumbersValid = findings.every(
    (f) => Number.isInteger(f.lineNumber) && f.lineNumber > 0,
  );
  items.push({ name: "行号准确性", passed: lineNumbersValid });

  const noLinterOverlap = findings.every(
    (f) => !linterKeywords.some((kw) => f.description.toLowerCase().includes(kw.toLowerCase())),
  );
  items.push({ name: "不与 Linter 重复", passed: noLinterOverlap });

  const noProtectedFileSuggestions = findings.every(
    (f) =>
      !f.suggestion.toLowerCase().includes("删除 .tinkerman/") &&
      !f.suggestion.toLowerCase().includes("delete .tinkerman/") &&
      !f.filePath.startsWith(".tinkerman/"),
  );
  items.push({ name: "受保护文件", passed: noProtectedFileSuggestions });

  return {
    passed: items.every((i) => i.passed),
    items,
  };
}
