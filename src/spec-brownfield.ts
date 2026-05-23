/**
 * Brownfield auto-detection and self-checks.
 *
 * detectBrownfieldSignals: checks git history, prior spec, keywords.
 * runBrownfieldSelfChecks: validates Delta, Current State, Reversibility.
 *
 * Validates: Requirement 9
 */

import type { SpecBundle, RequirementsDocument, DesignDocument } from "./spec-bundle.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BrownfieldInput {
  hasGitHistory: boolean;
  hasPriorSpec: boolean;
  taskDescription: string;
}

export interface BrownfieldResult {
  brownfield: boolean;
  signals: string[];
}

export interface BrownfieldCheckFinding {
  rule: string;
  severity: "P0" | "P1";
  message: string;
}

export interface BrownfieldCheckResult {
  pass: boolean;
  skipped?: boolean;
  findings: BrownfieldCheckFinding[];
}

// ---------------------------------------------------------------------------
// Keyword dictionaries
// ---------------------------------------------------------------------------

const BROWNFIELD_KEYWORDS_ZH = ["改造", "重构", "修改既有", "修复", "升级", "迁移", "替换"];
const BROWNFIELD_KEYWORDS_EN = [
  "refactor", "restructure", "modify existing", "fix", "upgrade", "migrate",
  "replace", "rewrite", "port", "brownfield",
];

// ---------------------------------------------------------------------------
// detectBrownfieldSignals
// ---------------------------------------------------------------------------

export function detectBrownfieldSignals(input: BrownfieldInput, eventsPath?: string): BrownfieldResult {
  const signals: string[] = [];

  if (input.hasGitHistory) signals.push("git-history");
  if (input.hasPriorSpec) signals.push("prior-spec");

  const desc = input.taskDescription.toLowerCase();
  for (const kw of BROWNFIELD_KEYWORDS_ZH) {
    if (desc.includes(kw)) {
      signals.push("keyword");
      break;
    }
  }
  if (!signals.includes("keyword")) {
    for (const kw of BROWNFIELD_KEYWORDS_EN) {
      if (desc.includes(kw)) {
        signals.push("keyword");
        break;
      }
    }
  }

  const result: BrownfieldResult = {
    brownfield: signals.length > 0,
    signals,
  };

  if (result.brownfield && eventsPath) {
    import("./event-writer.js").then(({ writeEvent }) => {
      writeEvent(eventsPath, "brownfield_mode_inferred", { signals: result.signals });
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// runBrownfieldSelfChecks
// ---------------------------------------------------------------------------

export function runBrownfieldSelfChecks(bundle: SpecBundle): BrownfieldCheckResult {
  const req = bundle.primary as RequirementsDocument;
  const design = bundle.design as DesignDocument | undefined;

  // Skip if not brownfield
  if (!req.frontmatter.brownfield) {
    return { pass: true, skipped: true, findings: [] };
  }

  const findings: BrownfieldCheckFinding[] = [];

  // BF-01: Delta must exist with all three subsections non-empty
  if (!req.delta) {
    findings.push({ rule: "BF-01", severity: "P0", message: "Missing Delta section in requirements" });
  } else if (req.delta.added.length === 0 || req.delta.modified.length === 0 || req.delta.unchanged.length === 0) {
    findings.push({ rule: "BF-01", severity: "P0", message: "Delta subsections must all be non-empty" });
  }

  // BF-02: Current State must have file:line references
  if (!design?.currentState || !/\S+:\d+/.test(design.currentState)) {
    findings.push({ rule: "BF-02", severity: "P0", message: "Current State missing file:line references" });
  }

  // BF-03: Reversibility must have both rollback and mount points
  if (!design?.reversibility) {
    findings.push({ rule: "BF-03", severity: "P0", message: "Missing Reversibility section" });
  } else {
    const hasRollback = design.reversibility.includes("回滚") || design.reversibility.toLowerCase().includes("rollback");
    const hasMount = design.reversibility.includes("挂载") || design.reversibility.toLowerCase().includes("mount");
    if (!hasRollback || !hasMount) {
      findings.push({ rule: "BF-03", severity: "P0", message: "Reversibility must have both rollback plan and mount points" });
    }
  }

  // BF-04: Anti-drift — Delta added/modified must reference real files in Current State
  if (req.delta && design?.currentState) {
    const currentFiles = design.currentState.match(/\b\w+\.\w+/g) ?? [];
    for (const added of req.delta.added) {
      const fileRef = added.match(/\b\w+\.\w+/)?.[0];
      if (fileRef && currentFiles.length > 0 && !currentFiles.some((cf) => cf === fileRef || cf.endsWith("/" + fileRef))) {
        findings.push({
          rule: "BF-04",
          severity: "P1",
          message: `Delta added "${added}" references "${fileRef}" not found in Current State`,
        });
      }
    }
  }

  // BF-05: Anti-drift — Proposed Change must cover all Delta modified items
  if (req.delta && design?.proposedChange) {
    for (const mod of req.delta.modified) {
      const fileRef = mod.match(/\b\w+\.\w+/)?.[0];
      if (fileRef && !design.proposedChange.includes(fileRef)) {
        findings.push({
          rule: "BF-05",
          severity: "P1",
          message: `Delta modified "${mod}" references "${fileRef}" not covered in Proposed Change`,
        });
      }
    }
  }

  return {
    pass: findings.length === 0,
    findings,
  };
}
