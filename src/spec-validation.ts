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

export function detectSpecLeakFromBundle(
  bundle: SpecBundle,
  scope: "strict" | "lenient",
): SpecLeakResult {
  const req = bundle.primary as RequirementsDocument;
  const text = [req.intro, ...req.earsCriteria.map((c) => c.raw)].join("\n");

  const findings: SpecLeakResult["findings"] = [];
  const lines = text.split("\n");
  const patterns = scope === "strict"
    ? STRICT_PATTERNS
    : LENIENT_EXTRA_PATTERNS;

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        findings.push({ line: i + 1, pattern: pattern.source });
      }
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

// Rewrite strategies: ordered from most specific to least specific
const REWRITE_STRATEGIES: Array<(text: string) => string | null> = [
  // Strategy 1: Split on "→" or "→" (result)
  (text) => {
    const sep = text.includes("→") ? "→" : text.includes("->") ? "->" : null;
    if (!sep) return null;
    const parts = text.split(sep);
    if (parts.length !== 2) return null;
    return `当 ${parts[0].trim()} 时 系统应当 ${parts[1].trim()}`;
  },
  // Strategy 2: Split on "后" (after)
  (text) => {
    const match = text.match(/^(.+?)后\s*(.+)$/);
    if (!match) return null;
    return `当 ${match[1].trim()} 时 系统应当 ${match[2].trim()}`;
  },
  // Strategy 3: Split on "then" / "则" (then)
  (text) => {
    const match = text.match(/^(.+?)\s*(?:then|则)\s*(.+)$/i);
    if (!match) return null;
    return `当 ${match[1].trim()} 时 系统应当 ${match[2].trim()}`;
  },
  // Strategy 4: Last resort — wrap entire text as both condition and action
  (text) => {
    if (!text.trim()) return null;
    return `当 ${text.trim()} 时 系统应当 ${text.trim()}`;
  },
];

export function enforceEarsSyntax(
  text: string,
  options?: { maxRetries?: number; eventsPath?: string },
): EarsEnforcementResult {
  const maxRetries = options?.maxRetries ?? 3;
  const eventsPath = options?.eventsPath;

  if (EARS_FULL.test(text) || EARS_LEGACY.test(text)) {
    return { output: text, retries: 0 };
  }

  if (!text.trim()) {
    return { output: text, retries: 0, exhausted: true };
  }

  // Try each strategy in order
  for (let attempt = 0; attempt < REWRITE_STRATEGIES.length; attempt++) {
    const rewritten = REWRITE_STRATEGIES[attempt](text);
    if (rewritten && (EARS_FULL.test(rewritten) || EARS_LEGACY.test(rewritten))) {
      return { output: rewritten, retries: attempt + 1 };
    }
  }

  // Exhausted — emit event and return original + failure marker
  if (eventsPath) {
    import("./event-writer.js").then(({ writeEvent }) => {
      writeEvent(eventsPath, "ears_enforcement_exhausted", { input: text.slice(0, 200) });
    });
  }
  return { output: text, retries: maxRetries, exhausted: true };
}
