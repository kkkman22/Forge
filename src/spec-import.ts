/**
 * External spec import — parseSpecArgs, parseExternalSpec, scoreImportedContent.
 *
 * Validates: Requirement 10
 */

import { existsSync } from "node:fs";

import type { EarsClause, WorkflowVariant } from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// parseSpecArgs
// ---------------------------------------------------------------------------

export interface ParseSpecArgsResult {
  mode: "feature" | "import" | "default";
  feature?: string;
  path?: string;
}

export function parseSpecArgs(argv: string[]): ParseSpecArgsResult {
  if (argv.length === 0) return { mode: "default" };

  const arg = argv[0];
  if (existsSync(arg)) {
    return { mode: "import", path: arg };
  }

  return { mode: "feature", feature: arg };
}

// ---------------------------------------------------------------------------
// parseExternalSpec
// ---------------------------------------------------------------------------

export interface ExternalSpecContent {
  purpose: string;
  earsCriteria: EarsClause[];
  nonFunctional: string[];
  outOfScope: string[];
}

export function parseExternalSpec(text: string): ExternalSpecContent {
  const purpose = text.match(/^#\s+(.+)/m)?.[1] ?? "";

  // Extract EARS clauses
  const earsCriteria: EarsClause[] = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^[-*]\s*当\s+(.+?)\s+时\s+系统(?:应当)?\s+(.+)$/);
    if (match) {
      earsCriteria.push({
        line: i + 1,
        when: match[1].trim(),
        shall: match[2].trim(),
        raw: line.replace(/^[-*]\s*/, ""),
      });
      continue;
    }
    const legacyMatch = line.match(/^[-*]\s*当\s+(.+?)\s*则\s+(.+)$/);
    if (legacyMatch) {
      earsCriteria.push({
        line: i + 1,
        when: legacyMatch[1].trim(),
        shall: legacyMatch[2].trim(),
        raw: line.replace(/^[-*]\s*/, ""),
      });
    }
  }

  // Extract NFR
  const nfrMatch = text.match(/##\s*Non-?functional[\s\S]*?\n([\s\S]*?)(?=\n## |$)/i);
  const nonFunctional = (nfrMatch?.[1] ?? "")
    .split("\n").map((l) => l.replace(/^[-*]\s*/, "").trim()).filter(Boolean);

  return { purpose, earsCriteria, nonFunctional, outOfScope: [] };
}

// ---------------------------------------------------------------------------
// scoreImportedContent
// ---------------------------------------------------------------------------

export function scoreImportedContent(input: {
  earsCriteria: EarsClause[];
  hasArchitecture: boolean;
}): WorkflowVariant {
  if (input.earsCriteria.length > 0 && !input.hasArchitecture) {
    return "requirements-first";
  }
  if (input.hasArchitecture && input.earsCriteria.length === 0) {
    return "design-first";
  }
  if (input.earsCriteria.length === 0 && !input.hasArchitecture) {
    return "quick-plan";
  }
  // Both present: default RF
  return "requirements-first";
}
