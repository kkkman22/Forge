/**
 * Review engine — core logic extracted from forge-review/SKILL.md.
 *
 * Implements:
 *   - filterByConfidence:       Filters findings below the confidence threshold
 *   - deduplicateFindings:      Merges findings with matching fingerprints (file + line ±3 + description)
 *   - applyCrossValidation:     Boosts confidence when 2+ reviewers find the same issue
 *   - runReportQualityGate:     Validates the 6-item quality gate on the final report
 *
 * Confidence filtering (from SKILL.md §6):
 *   - confidence ≥ 0.8 → included in report
 *   - confidence 0.5–0.7 → logged to low-confidence file, not in report
 *   - confidence < 0.5 → discarded
 *
 * Deduplication (from SKILL.md §7.1):
 *   - Fingerprint: normalize(filePath) + line_bucket(±3) + normalize(description)
 *   - On match: keep highest severity, highest confidence, most conservative fix route
 *
 * Cross-validation (from SKILL.md §7.2):
 *   - 2+ independent reviewers on same finding → confidence += 0.10 (cap 1.0)
 *
 * Report quality gate (from SKILL.md §7.3):
 *   6 checks: actionable, no false positives, severity calibrated,
 *   line numbers accurate, no linter overlap, no protected file suggestions
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Severity = "P0" | "P1" | "P2" | "P3";

export type FixRoute = "safe_auto" | "gated_auto" | "manual" | "advisory";

export interface ReviewFinding {
  severity: Severity;
  confidence: number;
  fixRoute: FixRoute;
  filePath: string;
  lineNumber: number;
  description: string;
  suggestion: string;
  reviewer: string;
}

export interface MergedFinding extends ReviewFinding {
  reviewers: string[];
  crossValidated: boolean;
}

export interface QualityGateItem {
  name: string;
  passed: boolean;
}

/** YAML frontmatter of a review report written to .forge/reviews/<topic>.md */
export interface ReviewReportFrontmatter {
  topic: string;
  date: string;
  result: "pass" | "fail" | "incomplete";
  /** Commit hash at the time of review. Optional for backward compatibility. */
  reviewed_at_commit?: string;
  p0_count: number;
  p1_count: number;
  p2_count: number;
  p3_count: number;
}

export interface QualityGateResult {
  passed: boolean;
  items: QualityGateItem[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Findings below this confidence are excluded from the final report. */
export const CONFIDENCE_THRESHOLD = 0.8;

/** Findings in this range are logged but not in the report. */
export const LOW_CONFIDENCE_MIN = 0.5;

/** Confidence boost when 2+ reviewers independently find the same issue. */
export const CROSS_VALIDATION_BOOST = 0.1;

/** Maximum confidence value. */
export const MAX_CONFIDENCE = 1.0;

/** Line number tolerance for deduplication fingerprinting. */
export const LINE_TOLERANCE = 3;

// ---------------------------------------------------------------------------
// Severity and fix route ordering (for merge priority)
// ---------------------------------------------------------------------------

const SEVERITY_RANK: Record<Severity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

const FIX_ROUTE_CONSERVATISM: Record<FixRoute, number> = {
  manual: 0,
  gated_auto: 1,
  safe_auto: 2,
  advisory: 3,
};

// ---------------------------------------------------------------------------
// Confidence filtering (SKILL.md §6)
// ---------------------------------------------------------------------------

export interface ConfidenceFilterResult {
  /** Findings with confidence ≥ 0.8 — included in the report. */
  included: ReviewFinding[];
  /** Findings with confidence 0.5–0.7 — logged separately. */
  lowConfidence: ReviewFinding[];
  /** Findings with confidence < 0.5 — discarded. */
  discarded: ReviewFinding[];
}

/**
 * Filter findings by confidence threshold.
 *
 * Per SKILL.md §6:
 *   - ≥ 0.8 → report
 *   - 0.5–0.7 → low-confidence log
 *   - < 0.5 → discard
 */
export function filterByConfidence(findings: ReviewFinding[]): ConfidenceFilterResult {
  const included: ReviewFinding[] = [];
  const lowConfidence: ReviewFinding[] = [];
  const discarded: ReviewFinding[] = [];

  for (const f of findings) {
    if (f.confidence >= CONFIDENCE_THRESHOLD) {
      included.push(f);
    } else if (f.confidence >= LOW_CONFIDENCE_MIN) {
      lowConfidence.push(f);
    } else {
      discarded.push(f);
    }
  }

  return { included, lowConfidence, discarded };
}

// ---------------------------------------------------------------------------
// Deduplication (SKILL.md §7.1)
// ---------------------------------------------------------------------------

/**
 * Compute a deduplication fingerprint for a finding.
 *
 * Fingerprint = normalize(filePath) + line_bucket(lineNumber, ±3) + normalize(description)
 *
 * Line bucket groups lines within ±3 of each other. We use floor(line / (2*tolerance+1))
 * as a simple bucketing scheme — but for ±3 tolerance, we actually need to check
 * absolute difference during merge, not just bucket. So the fingerprint uses
 * filePath + description only, and line proximity is checked during merge.
 */
function normalizeText(text: string): string {
  return text.toLowerCase().trim().replace(/\s+/g, " ");
}

function fileDescriptionKey(f: ReviewFinding): string {
  return `${normalizeText(f.filePath)}::${normalizeText(f.description)}`;
}

function linesAreClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= LINE_TOLERANCE;
}

function higherSeverity(a: Severity, b: Severity): Severity {
  return SEVERITY_RANK[a] <= SEVERITY_RANK[b] ? a : b;
}

function moreConservativeRoute(a: FixRoute, b: FixRoute): FixRoute {
  return FIX_ROUTE_CONSERVATISM[a] <= FIX_ROUTE_CONSERVATISM[b] ? a : b;
}

/**
 * Deduplicate findings from multiple reviewers.
 *
 * Per SKILL.md §7.1:
 *   - Match on normalized file path + line proximity (±3) + normalized description
 *   - On match: keep highest severity, highest confidence, most conservative fix route
 *   - Track all contributing reviewers
 */
export function deduplicateFindings(findings: ReviewFinding[]): MergedFinding[] {
  const merged: MergedFinding[] = [];

  for (const f of findings) {
    const key = fileDescriptionKey(f);
    let matchIndex = -1;

    for (let i = 0; i < merged.length; i++) {
      const existing = merged[i];
      if (
        fileDescriptionKey(existing) === key &&
        linesAreClose(existing.lineNumber, f.lineNumber)
      ) {
        matchIndex = i;
        break;
      }
    }

    if (matchIndex === -1) {
      // New unique finding
      merged.push({
        ...f,
        reviewers: [f.reviewer],
        crossValidated: false,
      });
    } else {
      // Merge into existing
      const existing = merged[matchIndex];
      existing.severity = higherSeverity(existing.severity, f.severity);
      existing.confidence = Math.max(existing.confidence, f.confidence);
      existing.fixRoute = moreConservativeRoute(existing.fixRoute, f.fixRoute);
      existing.lineNumber = Math.min(existing.lineNumber, f.lineNumber);
      if (!existing.reviewers.includes(f.reviewer)) {
        existing.reviewers.push(f.reviewer);
      }
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Cross-validation (SKILL.md §7.2)
// ---------------------------------------------------------------------------

/**
 * Apply cross-validation confidence boost.
 *
 * Per SKILL.md §7.2:
 *   - When 2+ independent reviewers found the same issue → confidence += 0.10 (cap 1.0)
 *   - Mark as crossValidated
 */
export function applyCrossValidation(findings: MergedFinding[]): MergedFinding[] {
  return findings.map((f) => {
    if (f.reviewers.length >= 2) {
      return {
        ...f,
        confidence: Math.min(f.confidence + CROSS_VALIDATION_BOOST, MAX_CONFIDENCE),
        crossValidated: true,
      };
    }
    return { ...f };
  });
}

// ---------------------------------------------------------------------------
// Quality gate configuration (exported for customization)
// ---------------------------------------------------------------------------

/**
 * Vague language patterns in suggestions that indicate low-quality findings.
 * Configurable: consumers can override via `runReportQualityGate(findings, { vaguePatterns })`.
 */
export const DEFAULT_VAGUE_PATTERNS: string[] = [
  "考虑改进",
  "可能需要",
  "也许应该",
  "consider improving",
  "might need",
];

/**
 * Style-only keywords in descriptions. P0/P1 severity for style issues
 * indicates miscalibration.
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
 * Linter-detectable keywords. Findings about these belong to the linter,
 * not the review report.
 */
export const DEFAULT_LINTER_KEYWORDS: string[] = [
  "缺少分号",
  "缩进错误",
  "trailing comma",
  "missing semicolon",
  "indent error",
];

/** Options for customizing quality gate behavior. */
export interface QualityGateOptions {
  vaguePatterns?: string[];
  styleKeywords?: string[];
  linterKeywords?: string[];
}

// ---------------------------------------------------------------------------
// Report quality gate (SKILL.md §7.3)
// ---------------------------------------------------------------------------

/**
 * Run the 6-item report quality gate.
 *
 * Per SKILL.md §7.3, checks:
 *   1. Actionable: every finding has a non-empty suggestion
 *   2. No false positives: (caller-asserted, we check suggestion is specific)
 *   3. Severity calibrated: P0/P1 are not used for style-only issues (heuristic)
 *   4. Line number accuracy: all line numbers are positive integers
 *   5. No linter overlap: no findings that are purely formatting issues
 *   6. Protected files: no findings suggesting deletion of .forge/ files
 *
 * Keyword lists are configurable via the options parameter.
 */
export function runReportQualityGate(
  findings: MergedFinding[],
  options?: QualityGateOptions,
): QualityGateResult {
  const vaguePatterns = options?.vaguePatterns ?? DEFAULT_VAGUE_PATTERNS;
  const styleKeywords = options?.styleKeywords ?? DEFAULT_STYLE_KEYWORDS;
  const linterKeywords = options?.linterKeywords ?? DEFAULT_LINTER_KEYWORDS;

  const items: QualityGateItem[] = [];

  // 1. Actionable: every finding has a non-empty suggestion
  const allActionable = findings.every((f) => f.suggestion.trim().length > 0);
  items.push({ name: "可操作性", passed: allActionable });

  // 2. No false positives: suggestion should not contain vague language
  const noVagueSuggestions = findings.every(
    (f) => !vaguePatterns.some((p) => f.suggestion.toLowerCase().includes(p.toLowerCase())),
  );
  items.push({ name: "误报排除", passed: noVagueSuggestions });

  // 3. Severity calibrated: P0/P1 should not be for style-only issues
  const severityCalibrated = findings.every((f) => {
    if (f.severity === "P0" || f.severity === "P1") {
      const desc = f.description.toLowerCase();
      return !styleKeywords.some((kw) => desc.includes(kw.toLowerCase()));
    }
    return true;
  });
  items.push({ name: "严重度校准", passed: severityCalibrated });

  // 4. Line number accuracy: all line numbers are positive integers
  const lineNumbersValid = findings.every(
    (f) => Number.isInteger(f.lineNumber) && f.lineNumber > 0,
  );
  items.push({ name: "行号准确性", passed: lineNumbersValid });

  // 5. No linter overlap: findings should not be about formatting
  const noLinterOverlap = findings.every(
    (f) => !linterKeywords.some((kw) => f.description.toLowerCase().includes(kw.toLowerCase())),
  );
  items.push({ name: "不与 Linter 重复", passed: noLinterOverlap });

  // 6. Protected files: no findings suggesting deletion of .forge/ files
  const noProtectedFileSuggestions = findings.every(
    (f) =>
      !f.suggestion.toLowerCase().includes("删除 .forge/") &&
      !f.suggestion.toLowerCase().includes("delete .forge/") &&
      !f.filePath.startsWith(".forge/"),
  );
  items.push({ name: "受保护文件", passed: noProtectedFileSuggestions });

  return {
    passed: items.every((i) => i.passed),
    items,
  };
}

// ---------------------------------------------------------------------------
// Evolution artefact helpers (skills-cross-pollination — Requirement 8.5)
// ---------------------------------------------------------------------------

import type { Episode, EpisodeTier } from "./episode.js";
import {
  buildFailureEpisode,
  buildFailureEvolutionMarker,
  type FailureContext,
} from "./failure-sink.js";

/**
 * Input for {@link buildReviewEvolutionArtifacts}.
 *
 * Drivers classify findings into two buckets after a review run:
 *
 *   - `newPatternSituation` — a one-line summary of a pattern the
 *     reviewers flagged that is **not** present in any
 *     `knowledge/solutions/*.md`. Setting this asks the helper to
 *     produce both a failure episode and an Evolution marker targeting
 *     `forge-review#new_review_pattern`.
 *   - `matchedFailurePattern` — the name of an entry in
 *     `knowledge/known-failures.md` that this review successfully
 *     re-identified. Setting this asks the helper to echo the pattern
 *     name via `patternUpdate` so the driver can call
 *     `updatePatternStats(pattern, "success")` against `instincts.md`.
 *
 * Either, both, or neither field may be set. The helper does no IO.
 */
export interface ReviewEvolutionInput {
  topic: string;
  tier: EpisodeTier;
  newPatternSituation?: string;
  matchedFailurePattern?: string;
}

/** Output of {@link buildReviewEvolutionArtifacts}. Fields are omitted when not applicable. */
export interface ReviewEvolutionArtifacts {
  episode?: Episode;
  markerText?: string;
  patternUpdate?: string;
}

/**
 * Pure helper that turns a review's evolution signals into write-ready
 * artefacts.
 *
 * Behaviour (Requirement 8.5):
 *   - When `newPatternSituation` is a non-empty string, construct a
 *     `FailureContext` with `skill=forge-review` and
 *     `trigger=new_review_pattern`, then delegate to
 *     {@link buildFailureEpisode} and {@link buildFailureEvolutionMarker}.
 *     The resulting episode has `outcome: "failure"` and an id of the
 *     form `ep-YYYY-MM-DD-NNN`; the marker line targets
 *     `forge-review#new_review_pattern`.
 *   - When `matchedFailurePattern` is non-empty, the pattern name is
 *     echoed on `patternUpdate` so the driver can increment the
 *     pattern's success counter. The helper itself performs no updates.
 *   - When neither field is set, an empty object is returned.
 *
 * The function is deterministic: same `(input, now, sequenceInDay)` → same output.
 */
export function buildReviewEvolutionArtifacts(
  input: ReviewEvolutionInput,
  now: Date,
  sequenceInDay: number,
): ReviewEvolutionArtifacts {
  const out: ReviewEvolutionArtifacts = {};

  if (input.newPatternSituation !== undefined && input.newPatternSituation.length > 0) {
    const ctx: FailureContext = {
      skill: "forge-review",
      topic: input.topic,
      tier: input.tier,
      trigger: "new_review_pattern",
      situation: input.newPatternSituation,
    };
    const episode = buildFailureEpisode(ctx, now, sequenceInDay);
    const markerText = buildFailureEvolutionMarker(ctx, episode.id, now);
    out.episode = episode;
    out.markerText = markerText;
  }

  if (input.matchedFailurePattern !== undefined && input.matchedFailurePattern.length > 0) {
    out.patternUpdate = input.matchedFailurePattern;
  }

  return out;
}

// ---------------------------------------------------------------------------
// Subagent orchestration (Agent Team Migration — R1, R7)
// ---------------------------------------------------------------------------

import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import type { SubagentInvocation, SubagentResult } from "./loop-types.js";

/** Context for building review subagent invocations. */
export interface ReviewSubagentContext {
  hasSpec: boolean;
  specPath?: string;
  changedFiles: string[];
}

/**
 * Build the list of SubagentInvocations for a review.
 *
 * Always includes quality-check and security-check.
 * Includes spec-check only when a locked Spec is available (hasSpec === true).
 */
export function buildReviewSubagents(context: ReviewSubagentContext): SubagentInvocation[] {
  const invocations: SubagentInvocation[] = [];

  if (context.hasSpec) {
    invocations.push({
      agentType: "spec-check",
      prompt: `Review spec alignment. Spec path: ${context.specPath ?? "unknown"}. Changed files: ${context.changedFiles.join(", ")}`,
      permissionMode: "default",
      maxTurns: 10,
    });
  }

  invocations.push({
    agentType: "quality-check",
    prompt: `Review code quality. Changed files: ${context.changedFiles.join(", ")}`,
    permissionMode: "default",
    maxTurns: 10,
  });

  invocations.push({
    agentType: "security-check",
    prompt: `Review security and risk. Changed files: ${context.changedFiles.join(", ")}`,
    permissionMode: "default",
    maxTurns: 10,
  });

  return invocations;
}

/**
 * Merge subagent results through the existing review pipeline.
 *
 * Flow: extract findings from successful results → filterByConfidence →
 *       deduplicateFindings → applyCrossValidation
 */
/** Runtime validation for ReviewFinding objects parsed from Subagent output. */
function isValidReviewFinding(value: unknown): value is ReviewFinding {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.severity === "string" &&
    ["P0", "P1", "P2", "P3"].includes(obj.severity) &&
    typeof obj.confidence === "number" &&
    typeof obj.fixRoute === "string" &&
    typeof obj.filePath === "string" &&
    typeof obj.lineNumber === "number" &&
    typeof obj.description === "string" &&
    typeof obj.suggestion === "string" &&
    typeof obj.reviewer === "string"
  );
}

export function mergeReviewResults(results: SubagentResult[]): MergedFinding[] {
  const allFindings: ReviewFinding[] = [];

  for (const result of results) {
    if (result.status === "success" && result.output) {
      try {
        const parsed = JSON.parse(result.output);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (isValidReviewFinding(item)) {
              allFindings.push(item);
            }
          }
        }
      } catch {
        // Output is not JSON — skip this result
      }
    }
  }

  const { included } = filterByConfidence(allFindings);
  const deduped = deduplicateFindings(included);
  return applyCrossValidation(deduped);
}

// ---------------------------------------------------------------------------
// Frontmatter atomic rewrite (cmux integration — R15.1–R15.8)
// ---------------------------------------------------------------------------

interface ReviewProgressFrontmatter {
  topic: string;
  reviewers: string[];
  layers_status: Record<string, string>;
  created_at: string | null;
  completed_at: string | null;
  [key: string]: unknown;
}

function splitFrontmatterAndBody(content: string): {
  fmText: string;
  body: string;
  fm: Record<string, unknown>;
} {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return { fmText: "", body: content, fm: {} };
  }
  const fm = parseYaml(match[1]) ?? {};
  const body = content.slice(match[0].length);
  return { fmText: match[1], body, fm };
}

function renderWithFrontmatter(fm: Record<string, unknown>, body: string): string {
  const yamlStr = stringifyYaml(fm, { lineWidth: 0 }).trim();
  return `---\n${yamlStr}\n---${body}`;
}

/**
 * Initialize a review progress file with frontmatter (R15.1).
 */
export function initReviewFrontmatter(filePath: string, topic: string, reviewers: string[]): void {
  const layersStatus: Record<string, string> = {};
  for (const r of reviewers) {
    layersStatus[r.replace(/-/g, "_")] = "pending";
  }

  const fm: ReviewProgressFrontmatter = {
    topic,
    reviewers,
    layers_status: layersStatus,
    created_at: new Date().toISOString(),
    completed_at: null,
  };

  const body = "\n\n# Review Report\n";
  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, renderWithFrontmatter(fm as unknown as Record<string, unknown>, body));
  renameSync(tmpPath, filePath);
}

/**
 * Update a single layer's status in the review frontmatter (R15.2, R15.3).
 * Sets completed_at when all layers are "done".
 */
export function markLayerStatus(filePath: string, layerName: string, status: string): void {
  atomicUpdateFrontmatter(filePath, (fm) => {
    if (!fm.layers_status) fm.layers_status = {};
    (fm.layers_status as Record<string, string>)[layerName] = status;

    const layers = Object.values(fm.layers_status as Record<string, string>);
    if (layers.length > 0 && layers.every((s) => s === "done")) {
      fm.completed_at = new Date().toISOString();
    }
  });
}

/**
 * Atomically update the YAML frontmatter of a file (R15.4, R15.5).
 * Reads → parses → applies mutator → writes to tmp → renames.
 * On mutator error, the file is left unchanged.
 */
export function atomicUpdateFrontmatter(
  filePath: string,
  mutator: (fm: Record<string, unknown>) => void,
): void {
  const content = readFileSync(filePath, "utf-8");
  const { fm, body } = splitFrontmatterAndBody(content);

  mutator(fm);

  const tmpPath = `${filePath}.tmp`;
  writeFileSync(tmpPath, renderWithFrontmatter(fm, body));
  renameSync(tmpPath, filePath);
}
