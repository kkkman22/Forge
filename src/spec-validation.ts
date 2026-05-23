/**
 * Validation Contract Gate, Spec Leak detection, EARS enforcement.
 *
 * Validates: Requirements 11, 12
 */

import type { SpecBundle, RequirementsDocument, EarsClause } from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// Contract Gate (Requirement 11)
// ---------------------------------------------------------------------------

const VALID_VERIFY_BY = ["vitest", "bash", "forge_git", "forge_exec", "manual"];
const PLACEHOLDER_EVIDENCE = ["TODO", "TBD", "待补充", "待确认", ""];

export interface ContractGateFinding {
  line?: number;
  severity: "P0";
  message: string;
}

export interface ContractGateResult {
  pass: boolean;
  skipped?: boolean;
  findings: ContractGateFinding[];
}

export function validateContractGate(bundle: SpecBundle): ContractGateResult {
  const req = bundle.primary as RequirementsDocument;

  if (req.frontmatter.contract_legacy) {
    return { pass: true, skipped: true, findings: [] };
  }

  const findings: ContractGateFinding[] = [];

  for (const clause of req.earsCriteria) {
    if (!clause.verifyBy || !VALID_VERIFY_BY.includes(clause.verifyBy)) {
      findings.push({
        line: clause.line,
        severity: "P0",
        message: `Missing or invalid verifyBy at line ${clause.line}: "${clause.raw}"`,
      });
    }

    if (!clause.evidence || PLACEHOLDER_EVIDENCE.includes(clause.evidence.trim())) {
      findings.push({
        line: clause.line,
        severity: "P0",
        message: `Missing or placeholder evidence at line ${clause.line}: "${clause.raw}"`,
      });
    }
  }

  return { pass: findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// Spec Leak (Requirement 11)
// ---------------------------------------------------------------------------

const STRICT_PATTERNS = [
  /\b[A-Z][a-z]+(?:Service|Manager|Handler|Controller|Repository|Factory|Builder|Adapter)\b/,
  /\bfunction\s+\w+\s*\(/,
  /\b(?:const|let|var)\s+\w+/,
  /\bimport\s+.+\s+from\b/,
  /\bclass\s+\w+/,
];

const LENIENT_EXTRA_PATTERNS = [
  /\bfunction\s+\w+\s*\([^)]*\)\s*\{/,
  /\b(?:const|let|var)\s+\w+\s*=\s*[^;]+;/,
  /\breturn\s+fetch\(/,
];

export interface SpecLeakResult {
  leaked: boolean;
  findings: { line?: number; pattern: string }[];
}

export function detectSpecLeak(
  bundle: SpecBundle,
  scope: "strict" | "lenient",
): SpecLeakResult {
  const req = bundle.primary as RequirementsDocument;
  const text = [req.intro, ...req.earsCriteria.map((c) => c.raw)].join("\n");

  const findings: SpecLeakResult["findings"] = [];
  const patterns = scope === "strict"
    ? STRICT_PATTERNS
    : LENIENT_EXTRA_PATTERNS;

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      findings.push({ pattern: pattern.source });
    }
  }

  return { leaked: findings.length > 0, findings };
}

// ---------------------------------------------------------------------------
// EARS Enforcement (Requirement 12)
// ---------------------------------------------------------------------------

const EARS_FULL = /^当\s+.+\s+时\s+系统(?:应当)?\s+.+$/;
const EARS_LEGACY = /^当\s+.+\s*则\s+.+$/;

export interface EarsEnforcementResult {
  output: string;
  retries: number;
  exhausted?: boolean;
}

export function enforceEarsSyntax(
  text: string,
  options?: { maxRetries?: number },
): EarsEnforcementResult {
  const maxRetries = options?.maxRetries ?? 3;

  if (EARS_FULL.test(text) || EARS_LEGACY.test(text)) {
    return { output: text, retries: 0 };
  }

  // Simple rewrite strategy: wrap content in EARS pattern
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const rewritten = `当 ${text} 时 系统应当 ${text}`;

    if (EARS_FULL.test(rewritten)) {
      return { output: rewritten, retries: attempt };
    }
  }

  // Exhausted — return best effort
  const fallback = `当 ${text} 时 系统应当 ${text}`;
  return { output: fallback, retries: maxRetries, exhausted: true };
}
