/**
 * Validation Contract Gate, Spec Leak detection, EARS enforcement.
 *
 * Validates: Requirements 11, 12
 */

import { validateVerifyBy } from "./contract-validator.js";
import type { RequirementsDocument, SpecBundle } from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// Contract Gate (Requirement 11)
// ---------------------------------------------------------------------------

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
    // Req1 AC1: Verify-By must use the layered grammar (vitest:unit / ... / manual).
    // Shared pure fn keeps this gate and scripts/check-spec-contract.sh in lockstep.
    const vbError = validateVerifyBy(clause.verifyBy ?? "");
    if (vbError) {
      findings.push({
        line: clause.line,
        severity: "P0",
        message: `${vbError} at line ${clause.line}: "${clause.raw}"`,
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

// ---------------------------------------------------------------------------
// Spec Leak — bundle adapter
//
// This bundle-aware view is layered on top of the canonical `detectSpecLeak`
// in src/spec-leak-detector.ts (which scans against banned-patterns.yaml +
// glossary whitelist). For non-pack-aware contexts (e.g. tests, ad-hoc audits)
// the strict / lenient regex sets below provide a self-contained fallback.
//
// The lenient set is derived from the strict set by removing patterns that
// only flag bare class / function names (which legitimately appear in
// design.md). That keeps both detectors in sync — extending strict
// automatically tightens lenient unless the new pattern is excluded.
// ---------------------------------------------------------------------------

const STRICT_PATTERNS: RegExp[] = [
  /\b[A-Z][a-z]+(?:Service|Manager|Handler|Controller|Repository|Factory|Builder|Adapter)\b/,
  /\bfunction\s+\w+\s*\(/,
  /\b(?:const|let|var)\s+\w+/,
  /\bimport\s+.+\s+from\b/,
  /\bclass\s+\w+/,
];

/**
 * Patterns that flag *structural* identifiers (class names, bare function
 * names) which are acceptable in design.md but not in requirements.md.
 * These are excluded from the lenient set; only "real code fragments"
 * like a function body or a fetched URL trigger lenient findings.
 */
const STRUCTURAL_ONLY: RegExp[] = [
  /\b[A-Z][a-z]+(?:Service|Manager|Handler|Controller|Repository|Factory|Builder|Adapter)\b/,
  /\bfunction\s+\w+\s*\(/,
  /\bclass\s+\w+/,
];

const LENIENT_EXTRA_PATTERNS: RegExp[] = [
  /\bfunction\s+\w+\s*\([^)]*\)\s*\{/,
  /\b(?:const|let|var)\s+\w+\s*=\s*[^;]+;/,
  /\breturn\s+fetch\(/,
];

/**
 * Derive the lenient pattern set from strict + lenient-extras.
 * (lenient = strict − structural-only + lenient-extras)
 *
 * Exposed so callers can inspect the active rule set.
 */
export function deriveLenientPatterns(): RegExp[] {
  const sourceFiltered = STRICT_PATTERNS.filter(
    (p) => !STRUCTURAL_ONLY.some((s) => s.source === p.source),
  );
  return [...sourceFiltered, ...LENIENT_EXTRA_PATTERNS];
}

export interface SpecLeakFinding {
  /** 1-indexed line within the scanned text. */
  line: number;
  /** Source file the text came from (e.g. "requirements.md"). */
  file: string;
  /** Pattern source string that matched. */
  pattern: string;
  /** Pre-formatted "[spec-leak] file:line" message for log output. */
  message: string;
}

export interface SpecLeakResult {
  leaked: boolean;
  /** Line-anchored findings with file:line tags. */
  findings: SpecLeakFinding[];
}

/**
 * Detect spec leaks from a SpecBundle.
 *
 * - `strict` scans `requirements.md` (intro + EARS criteria) with the full
 *   strict pattern set.
 * - `lenient` scans `design.md` with the lenient set (structural identifiers
 *   removed; legitimate technical names allowed).
 *
 * Output uses `[spec-leak] <file>:<line>` format so it can be tee'd straight
 * into terminal logs and matched by ship-gate scripts.
 */
export function detectSpecLeakFromBundle(
  bundle: SpecBundle,
  scope: "strict" | "lenient",
): SpecLeakResult {
  const req = bundle.primary as RequirementsDocument;
  const findings: SpecLeakFinding[] = [];

  if (scope === "strict") {
    const text = [req.intro, ...req.earsCriteria.map((c) => c.raw)].join("\n");
    scanLines(text, "requirements.md", STRICT_PATTERNS, findings);
  } else {
    const design = bundle.design;
    const designText = design
      ? [
          (design as { overview?: string }).overview ?? "",
          (design as { architecture?: string }).architecture ?? "",
          (design as { dataModel?: string }).dataModel ?? "",
          (design as { errorHandling?: string }).errorHandling ?? "",
        ].join("\n")
      : [req.intro, ...req.earsCriteria.map((c) => c.raw)].join("\n");
    const file = design ? "design.md" : "requirements.md";
    scanLines(designText, file, deriveLenientPatterns(), findings);
  }

  return { leaked: findings.length > 0, findings };
}

function scanLines(text: string, file: string, patterns: RegExp[], out: SpecLeakFinding[]): void {
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      if (pattern.test(lines[i])) {
        const line = i + 1;
        out.push({
          line,
          file,
          pattern: pattern.source,
          message: `[spec-leak] ${file}:${line}`,
        });
      }
    }
  }
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

// Rewrite strategies: ordered from most specific to least specific.
// The strategies attempt to recover EARS syntax from common authoring shapes.
// If none match, enforceEarsSyntax marks the result `exhausted: true` and
// returns the original text unchanged so ANL-01 in the analyzer can flag it.
const REWRITE_STRATEGIES: Array<(text: string) => string | null> = [
  // Strategy 1: Split on "→" or "->" (cause → effect)
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
  // Strategy 4: comma / 逗号 split (when, action)
  (text) => {
    const match = text.match(/^(.+?)[,，]\s*(.+)$/);
    if (!match) return null;
    return `当 ${match[1].trim()} 时 系统应当 ${match[2].trim()}`;
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
