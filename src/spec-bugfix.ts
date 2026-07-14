/**
 * Bugfix Spec — parser, renderer, self-checks.
 *
 * Validates: Requirement 14
 */

import type {
  BugfixDesignDocument,
  BugfixDocument,
  EarsClause,
  SpecBundle,
  SpecFileFrontmatter,
  WorkflowVariant,
} from "./spec-bundle.js";
// P2-4: shared spec-frontmatter helpers (was a duplicate of spec-parser's logic).
import { extractSpecField, extractSpecFrontmatterYaml } from "./spec-parser.js";

// ---------------------------------------------------------------------------
// Parse result types
// ---------------------------------------------------------------------------

export interface ParseError {
  line?: number;
  message: string;
}
export interface ParseResult<T> {
  doc?: T;
  errors?: ParseError[];
}

// ---------------------------------------------------------------------------
// parseBugfixMarkdown
// ---------------------------------------------------------------------------

export function parseBugfixMarkdown(text: string): ParseResult<BugfixDocument> {
  if (!text || text.trim().length === 0) return { errors: [{ message: "Empty input" }] };

  const fm = parseFrontmatter(text);
  if (Array.isArray(fm)) return { errors: fm };

  const body = text.replace(/^---[\s\S]*?---\n*/, "");

  const current = extractEarsFromSection(body, "Current Behavior");
  const expected = extractEarsFromSection(body, "Expected Behavior");
  const unchanged = extractEarsFromSection(body, "Unchanged Behavior");

  // Validate all three sections exist
  if (
    !hasSection(body, "Current Behavior") ||
    !hasSection(body, "Expected Behavior") ||
    !hasSection(body, "Unchanged Behavior")
  ) {
    return {
      errors: [{ message: "Missing required section (Current/Expected/Unchanged Behavior)" }],
    };
  }

  return {
    doc: {
      frontmatter: { ...fm, kind: "bugfix" } as SpecFileFrontmatter & { kind: "bugfix" },
      current,
      expected,
      unchanged,
    },
  };
}

// ---------------------------------------------------------------------------
// parseBugfixDesignMarkdown
// ---------------------------------------------------------------------------

export function parseBugfixDesignMarkdown(text: string): ParseResult<BugfixDesignDocument> {
  if (!text || text.trim().length === 0) return { errors: [{ message: "Empty input" }] };

  const fm = parseFrontmatter(text);
  if (Array.isArray(fm)) return { errors: fm };

  const body = text.replace(/^---[\s\S]*?---\n*/, "");

  const rootCause = extractSection(body, "Root Cause Analysis");
  const fixStrategy = extractSection(body, "Fix Strategy");
  const testProperties = extractSection(body, "Test Properties");

  if (!rootCause || !fixStrategy || !testProperties) {
    const missing = [];
    if (!rootCause) missing.push("Root Cause Analysis");
    if (!fixStrategy) missing.push("Fix Strategy");
    if (!testProperties) missing.push("Test Properties");
    return { errors: [{ message: `Missing sections: ${missing.join(", ")}` }] };
  }

  return {
    doc: {
      frontmatter: { ...fm, kind: "bugfix" } as SpecFileFrontmatter & { kind: "bugfix" },
      rootCause,
      fixStrategy,
      testProperties,
    },
  };
}

// ---------------------------------------------------------------------------
// renderBugfixMarkdown
// ---------------------------------------------------------------------------

export function renderBugfixMarkdown(doc: BugfixDocument): string {
  const parts: string[] = [];
  parts.push(renderFrontmatter(doc.frontmatter));
  parts.push("");
  parts.push(`# Bugfix: ${doc.frontmatter.feature}`);
  parts.push("");
  parts.push("## Current Behavior");
  parts.push("");
  for (const c of doc.current) parts.push(`- ${c.raw}`);
  parts.push("");
  parts.push("## Expected Behavior");
  parts.push("");
  for (const e of doc.expected) parts.push(`- ${e.raw}`);
  parts.push("");
  parts.push("## Unchanged Behavior");
  parts.push("");
  for (const u of doc.unchanged) parts.push(`- ${u.raw}`);
  parts.push("");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// renderBugfixDesignMarkdown
// ---------------------------------------------------------------------------

export function renderBugfixDesignMarkdown(doc: BugfixDesignDocument): string {
  const parts: string[] = [];
  parts.push(renderFrontmatter(doc.frontmatter));
  parts.push("");
  parts.push("# Bugfix Design");
  parts.push("");
  parts.push("## Root Cause Analysis");
  parts.push("");
  parts.push(doc.rootCause);
  parts.push("");
  parts.push("## Fix Strategy");
  parts.push("");
  parts.push(doc.fixStrategy);
  parts.push("");
  parts.push("## Test Properties");
  parts.push("");
  parts.push(doc.testProperties);
  parts.push("");
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// runBugfixSelfChecks (BFX-01~06)
// ---------------------------------------------------------------------------

export interface BugfixCheckFinding {
  rule: string;
  severity: "P0" | "P1";
  message: string;
}

export interface BugfixCheckResult {
  pass: boolean;
  findings: BugfixCheckFinding[];
}

const EARS_REGEX = /^当\s+.+\s+时\s+系统(?:应当)?\s+.+$/;
const EARS_LEGACY = /^当\s+.+\s*则\s+.+$/;

export function runBugfixSelfChecks(bundle: SpecBundle): BugfixCheckResult {
  const doc = bundle.primary as BugfixDocument;
  const findings: BugfixCheckFinding[] = [];

  // BFX-01: Three sections must exist
  if (doc.current.length === 0 || doc.expected.length === 0 || doc.unchanged.length === 0) {
    findings.push({
      rule: "BFX-01",
      severity: "P0",
      message: "All three sections (Current/Expected/Unchanged) must have entries",
    });
  }

  // BFX-02: Sections must not be empty/placeholder
  const allClauses = [...doc.current, ...doc.expected, ...doc.unchanged];
  for (const clause of allClauses) {
    if (!clause.raw || clause.raw.trim() === "" || /^(TODO|TBD|待补充)$/i.test(clause.raw.trim())) {
      findings.push({
        rule: "BFX-02",
        severity: "P0",
        message: `Placeholder or empty clause: "${clause.raw}"`,
      });
    }
  }

  // BFX-03: Current != Expected verbatim
  for (let i = 0; i < Math.min(doc.current.length, doc.expected.length); i++) {
    if (doc.current[i].raw === doc.expected[i].raw) {
      findings.push({
        rule: "BFX-03",
        severity: "P0",
        message: `Current and Expected are identical at index ${i}: "${doc.current[i].raw}"`,
      });
    }
  }

  // BFX-04: Unchanged vs Expected conflict (same condition, same behavior = no conflict; same condition, different behavior from expected is expected)
  // Actually: if Unchanged has same condition as Expected with same behavior, it's redundant not conflicting
  // Real conflict: Unchanged says system should do X, but Expected says system should NOT do X for same condition
  for (const u of doc.unchanged) {
    for (const e of doc.expected) {
      if (u.when === e.when && u.shall !== e.shall) {
        // Unchanged says system should do A, Expected says system should do B for same condition
        // This means the fix changes what Unchanged says shouldn't change — conflict!
        findings.push({
          rule: "BFX-04",
          severity: "P0",
          message: `Unchanged and Expected conflict on condition "${u.when}": unchanged="${u.shall}" vs expected="${e.shall}"`,
        });
      }
    }
  }

  // BFX-05: All entries must be EARS syntax
  for (const clause of allClauses) {
    if (!EARS_REGEX.test(clause.raw) && !EARS_LEGACY.test(clause.raw)) {
      findings.push({ rule: "BFX-05", severity: "P1", message: `Non-EARS entry: "${clause.raw}"` });
    }
  }

  // BFX-06: At least 1 non-[manual] Unchanged entry
  const nonManual = doc.unchanged.filter((u) => !u.raw.endsWith("[manual]"));
  if (doc.unchanged.length > 0 && nonManual.length === 0) {
    findings.push({
      rule: "BFX-06",
      severity: "P1",
      message: "All Unchanged entries are [manual]; at least one automated PBT needed",
    });
  }

  return { pass: findings.every((f) => f.severity !== "P0") || findings.length === 0, findings };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function parseFrontmatter(text: string): SpecFileFrontmatter | ParseError[] {
  // P2-4: delegate delimiter split + field extraction to shared helpers.
  const yaml = extractSpecFrontmatterYaml(text);
  if (yaml === null) return [{ message: "Missing YAML frontmatter" }];

  const feature = extractSpecField(yaml, "feature");
  const status = extractSpecField(yaml, "status");
  const date = extractSpecField(yaml, "date");
  const wv = extractSpecField(yaml, "workflow_variant") ?? "requirements-first";
  const kind = extractSpecField(yaml, "kind") as "feature" | "bugfix" | undefined;

  if (!feature || !status || !date) {
    return [{ message: "Missing required frontmatter fields" }];
  }

  return {
    feature,
    status: status as "draft" | "locked",
    date,
    workflow_variant: wv as WorkflowVariant,
    kind,
  };
}

function extractSection(body: string, heading: string): string {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(?:^|\\n)## ${escaped}[ \\t]*\\n([\\s\\S]*?)(?=\\n## |$)`, "");
  const match = body.match(regex);
  return match?.[1]?.trim() ?? "";
}

function hasSection(body: string, heading: string): boolean {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\n)## ${escaped}[ \\t]*\\n`).test(body);
}

function extractEarsFromSection(body: string, heading: string): EarsClause[] {
  const sectionText = extractSection(body, heading);
  if (!sectionText) return [];

  const clauses: EarsClause[] = [];
  const lines = sectionText.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const match = line.match(/^[-*]\s*当\s+(.+?)\s+时\s+系统(?:应当)?\s+(.+)$/);
    if (match) {
      clauses.push({
        line: i + 1,
        when: match[1].trim(),
        shall: match[2].trim(),
        raw: line.replace(/^[-*]\s*/, ""),
      });
      continue;
    }
    const legacyMatch = line.match(/^[-*]\s*当\s+(.+?)\s*则\s+(.+)$/);
    if (legacyMatch) {
      clauses.push({
        line: i + 1,
        when: legacyMatch[1].trim(),
        shall: legacyMatch[2].trim(),
        raw: line.replace(/^[-*]\s*/, ""),
      });
    }
  }
  return clauses;
}

function renderFrontmatter(fm: SpecFileFrontmatter): string {
  const lines = ["---"];
  lines.push(`feature: ${fm.feature}`);
  lines.push(`status: ${fm.status}`);
  lines.push(`date: ${fm.date}`);
  lines.push(`workflow_variant: ${fm.workflow_variant}`);
  if (fm.kind) lines.push(`kind: ${fm.kind}`);
  lines.push("---");
  return lines.join("\n");
}
