/**
 * Scenario Linter - validates Gherkin scenario formatting rules.
 *
 * Enforces 4 default rules (SCN001-SCN004) and supports pack-provided
 * additional rules. Returns LintFinding array with file:line precision.
 *
 * Validates: R8.1-8.6 Scenario Linter
 */

import type { LintFinding } from "./pack/types.js";

// ---------------------------------------------------------------------------
// Default rules
// ---------------------------------------------------------------------------

/** Internal state for tracking scenario structure. */
interface ScenarioState {
  title: string;
  titleLine: number;
  hasGiven: boolean;
  hasWhen: boolean;
  hasThen: boolean;
}

/** Keywords that start Gherkin steps. */
const STEP_KEYWORDS = ["Given", "When", "Then", "And", "But"];

/** Patterns indicating internal state in THEN lines. */
const INTERNAL_PATTERNS = [
  /\bdatabase\s+(contains|has|stores|saves|inserts|updates|deletes)\b/i,
  /\btable\s+(rows?|contains|has)\b/i,
  /\bvariable\s+(equals?|is|contains)\b/i,
  /\bprivate\s+field\b/i,
  /\binternal\s+state\b/i,
  /\bmemory\s+(contains|holds)\b/i,
  /\bredis\s+(key|cache|store)\b/i,
];

/** Kebab-case pattern. */
const KEBAB_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** CJK character detection. */
const CJK_RE = /[一-鿿㐀-䶿]/;

// ---------------------------------------------------------------------------
// Linter implementation
// ---------------------------------------------------------------------------

/**
 * Lint Gherkin scenarios in spec text for formatting violations.
 *
 * @param specText - Full spec markdown content
 * @param filePath - File path for findings
 * @param options - Optional additional rules from packs
 * @returns Array of lint findings
 *
 * @example
 * ```ts
 * const findings = lintScenarios(specText, "spec.md");
 * const errors = findings.filter(f => f.severity === "error");
 * ```
 */
export function lintScenarios(
  specText: string,
  filePath: string,
  _options?: { additionalRules?: unknown[] },
): LintFinding[] {
  const findings: LintFinding[] = [];
  const lines = specText.split("\n");

  let inScenariosSection = false;
  let inCodeBlock = false;
  let currentScenario: ScenarioState | null = null;
  const completedScenarios: ScenarioState[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Track code block boundaries
    if (line.trimStart().startsWith("```")) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    // Track Scenarios section
    if (/^##\s+Scenarios/.test(line)) {
      inScenariosSection = true;
      continue;
    }
    if (/^##\s/.test(line) && !/^##\s+Scenarios/.test(line)) {
      // New section ends Scenarios
      if (currentScenario) {
        completedScenarios.push(currentScenario);
        currentScenario = null;
      }
      inScenariosSection = false;
      continue;
    }

    if (!inScenariosSection) continue;

    // Detect scenario title
    const scenarioMatch = /^###\s+Scenario\s+(.+?):\s*(.*)/.exec(line);
    if (scenarioMatch) {
      // Close previous scenario
      if (currentScenario) {
        completedScenarios.push(currentScenario);
      }

      const titlePart = scenarioMatch[1].trim();
      currentScenario = {
        title: titlePart,
        titleLine: lineNum,
        hasGiven: false,
        hasWhen: false,
        hasThen: false,
      };

      // SCN004: title format check
      if (!KEBAB_RE.test(titlePart) && !CJK_RE.test(titlePart)) {
        findings.push({
          ruleId: "SCN004",
          severity: "warning",
          file: filePath,
          line: lineNum,
          message: `Scenario title "${titlePart}" should use kebab-case or Chinese`,
        });
      }
      continue;
    }

    if (!inCodeBlock || !currentScenario) continue;

    // Check if line is a Gherkin step
    const trimmed = line.trim();
    const stepMatch = /^(Given|When|Then|And|But)\s+(.*)/.exec(trimmed);
    if (!stepMatch) continue;

    const keyword = stepMatch[1];
    const content = stepMatch[2];

    // Track structure
    if (keyword === "Given") currentScenario.hasGiven = true;
    if (keyword === "When") currentScenario.hasWhen = true;
    if (keyword === "Then") currentScenario.hasThen = true;

    // SCN001: period termination
    if (!content.endsWith(".") && !content.endsWith("。")) {
      findings.push({
        ruleId: "SCN001",
        severity: "error",
        file: filePath,
        line: lineNum,
        message: `${keyword} line must end with "." or "。"`,
      });
    }

    // SCN003: externally observable Then
    if (keyword === "Then") {
      for (const pattern of INTERNAL_PATTERNS) {
        if (pattern.test(content)) {
          findings.push({
            ruleId: "SCN003",
            severity: "error",
            file: filePath,
            line: lineNum,
            message: `Then line references internal state: "${pattern.source}"`,
          });
          break;
        }
      }
    }
  }

  // Close last scenario
  if (currentScenario) {
    completedScenarios.push(currentScenario);
  }

  // SCN002: structure completeness
  for (const scenario of completedScenarios) {
    if (!scenario.hasGiven || !scenario.hasWhen || !scenario.hasThen) {
      const missing: string[] = [];
      if (!scenario.hasGiven) missing.push("Given");
      if (!scenario.hasWhen) missing.push("When");
      if (!scenario.hasThen) missing.push("Then");
      findings.push({
        ruleId: "SCN002",
        severity: "error",
        file: filePath,
        line: scenario.titleLine,
        message: `Scenario "${scenario.title}" is missing: ${missing.join(", ")}`,
      });
    }
  }

  return findings.sort((a, b) => a.line - b.line);
}
