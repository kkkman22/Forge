/**
 * Spec engine — core logic extracted from forge-spec/SKILL.md.
 *
 * Implements the Spec lifecycle:
 *   - confirmSpec:  Transitions a draft Spec to "locked" status
 *   - rejectSpec:   Keeps a Spec in "draft" status (no-op on status)
 *   - validateTestability: Ensures every requirement has ≥1 testable scenario
 *   - validateBrownfieldDelta: Ensures brownfield Specs contain a complete Delta section
 *   - detectGlossaryMiss: Surfaces spec terms that are not yet defined in the glossary
 *
 * Spec document format (from SKILL.md §3):
 *   YAML frontmatter: feature, status ("draft" | "locked"), date
 *   Body: 目的, 需求 (with 当...则... scenarios), 不做什么, Delta (brownfield only)
 */

import {
  DEFAULT_EXTRACTION_RULES,
  extractCandidates,
  filterCandidates,
  type TermCandidate,
} from "./glossary-extractor.js";

export { renderGlossaryConflictPrompt, runGlossaryCheck } from "./glossary-hook.js";
export type { BugfixOrchestrationResult } from "./spec-bugfix-orchestration.js";
export { runBugfixOrchestration } from "./spec-bugfix-orchestration.js";
export type { SpecKind } from "./spec-bundle.js";
export type { ExternalSpecContent, ImportModeResult, ParseSpecArgsResult } from "./spec-import.js";
export {
  parseExternalSpec,
  parseSpecArgs,
  runImportMode,
  scoreImportedContent,
} from "./spec-import.js";
export { detectSpecKind } from "./spec-kind.js";
export { detectSpecLeak, loadBannedPatterns } from "./spec-leak-detector.js";
export type { ContractGateResult, EarsEnforcementResult } from "./spec-validation.js";
export {
  detectSpecLeakFromBundle,
  enforceEarsSyntax,
  validateContractGate,
} from "./spec-validation.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SpecFrontmatter {
  feature: string;
  status: "draft" | "locked";
  date: string;
  /** External spec source path (import mode only). */
  importSource?: string;
}

export interface Requirement {
  title: string;
  description: string;
  scenarios: string[]; // Each scenario in "当...则..." format
}

export interface DeltaSection {
  added: string[]; // 新增
  modified: string[]; // 修改
  unchanged: string[]; // 不变
}

export interface SpecDocument {
  frontmatter: SpecFrontmatter;
  purpose: string;
  requirements: Requirement[];
  exclusions: string[]; // 不做什么
  delta?: DeltaSection; // Only for brownfield
  isBrownfield: boolean;
}

// ---------------------------------------------------------------------------
// Result type for confirmSpec
// ---------------------------------------------------------------------------

export type ConfirmSpecResult =
  | { success: true; spec: SpecDocument }
  | { success: false; errors: string[] };

// ---------------------------------------------------------------------------
// Spec lifecycle functions
// ---------------------------------------------------------------------------

/**
 * Confirm (lock) a Spec document.
 *
 * Validates the spec before locking:
 *   1. All requirements must have testable scenarios (validateTestability)
 *   2. Brownfield specs must have a complete Delta section (validateBrownfieldDelta)
 *
 * Returns a success result with the locked SpecDocument, or a failure result
 * with validation error messages.
 *
 * Per SKILL.md §2 Step 3, user confirmation transitions draft → locked.
 */
export function confirmSpec(spec: SpecDocument): ConfirmSpecResult {
  const errors: string[] = [];

  if (!validateTestability(spec.requirements)) {
    errors.push("Not all requirements have testable scenarios");
  }

  if (spec.isBrownfield && !validateBrownfieldDelta(spec)) {
    errors.push("Brownfield spec missing complete Delta section");
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return {
    success: true,
    spec: {
      ...spec,
      frontmatter: {
        ...spec.frontmatter,
        status: "locked",
      },
    },
  };
}

/**
 * Reject a Spec document.
 *
 * Returns a new SpecDocument with status kept as "draft".
 * Per SKILL.md §2 Step 3, rejection keeps the spec in draft state.
 */
export function rejectSpec(spec: SpecDocument): SpecDocument {
  return {
    ...spec,
    frontmatter: {
      ...spec.frontmatter,
      status: "draft",
    },
  };
}

/**
 * Create an imported Spec document from external source.
 *
 * Wraps externally-sourced requirements into a SpecDocument with importSource
 * tracking. Used when a developer provides a PM spec via `/tinkerman spec <file>`.
 */
export function createImportedSpec(
  feature: string,
  date: string,
  purpose: string,
  requirements: Requirement[],
  exclusions: string[],
  importSource: string,
  isBrownfield: boolean,
  delta?: DeltaSection,
): SpecDocument {
  return {
    frontmatter: {
      feature,
      status: "draft",
      date,
      importSource,
    },
    purpose,
    requirements,
    exclusions,
    isBrownfield,
    delta,
  };
}

// ---------------------------------------------------------------------------
// Validation functions
// ---------------------------------------------------------------------------

/**
 * Validate that every requirement has at least one testable scenario.
 *
 * Per SKILL.md §4.1, each scenario must use the "当...则..." format.
 * Enhanced: 当...则... scenarios must also contain a verifiable assertion
 * keyword (e.g., 返回, 等于, 包含, 失败) in the expected result clause.
 * Non-当则 format scenarios pass without enhanced check (backward compat).
 * Returns true if ALL requirements have ≥1 testable scenario.
 */
export function validateTestability(requirements: Requirement[]): boolean {
  if (requirements.length === 0) {
    return false;
  }

  return requirements.every(
    (req) => req.scenarios.length > 0 && req.scenarios.some((s) => isScenarioTestable(s)),
  );
}

/** Keywords indicating a verifiable assertion in the expected result. */
const VERIFIABLE_KEYWORDS =
  /返回|等于|包含|不存在|exit|状态码|失败|成功|拒绝|通过|为\b|显示|输出|抛出|退出码|不为|为空|非空/;

/**
 * Check whether a single scenario is testable.
 * - Non-当则 format: passes (backward compat)
 * - 当...则... format: must have a verifiable assertion in the result clause
 */
function isScenarioTestable(scenario: string): boolean {
  const scenarioPattern = /当.+则.+/;
  if (!scenarioPattern.test(scenario)) {
    return true; // backward compat: non-当则 format passes
  }

  const resultMatch = scenario.match(/则(.+)/);
  if (!resultMatch) {
    return false;
  }

  const result = resultMatch[1].trim();
  return VERIFIABLE_KEYWORDS.test(result);
}

/**
 * Validate that a brownfield Spec contains a complete Delta section.
 *
 * Per SKILL.md §4.3, brownfield Specs MUST have a Delta section with
 * three subsections: 新增 (added), 修改 (modified), 不变 (unchanged).
 * Each subsection must have at least one entry.
 *
 * Returns true if the spec is brownfield AND has a valid Delta section,
 * or if the spec is NOT brownfield (non-brownfield specs don't need Delta).
 */
export function validateBrownfieldDelta(spec: SpecDocument): boolean {
  if (!spec.isBrownfield) {
    return true; // Non-brownfield specs don't need Delta
  }

  if (!spec.delta) {
    return false; // Brownfield spec missing Delta section entirely
  }

  // All three subsections must exist and have at least one entry
  return (
    spec.delta.added.length > 0 && spec.delta.modified.length > 0 && spec.delta.unchanged.length > 0
  );
}

// ---------------------------------------------------------------------------
// Glossary-miss detection
// ---------------------------------------------------------------------------

/**
 * Serialize a SpecDocument's body text fields into a single string suitable
 * for term extraction. Includes the purpose, each requirement's title /
 * description / scenarios, the exclusions list, and (when present) every
 * Delta subsection entry.
 *
 * The serialization is intentionally simple — lines are joined with `\n`
 * and no additional markup is emitted. Callers that need a different
 * shape should build their own string; this helper exists so the common
 * case does not have to re-implement the traversal.
 *
 * This function is pure.
 */
export function specTextFromDocument(spec: SpecDocument): string {
  const parts: string[] = [];

  if (spec.purpose.length > 0) {
    parts.push(spec.purpose);
  }

  for (const req of spec.requirements) {
    if (req.title.length > 0) parts.push(req.title);
    if (req.description.length > 0) parts.push(req.description);
    for (const scenario of req.scenarios) {
      if (scenario.length > 0) parts.push(scenario);
    }
  }

  for (const exclusion of spec.exclusions) {
    if (exclusion.length > 0) parts.push(exclusion);
  }

  if (spec.delta !== undefined) {
    for (const entry of spec.delta.added) {
      if (entry.length > 0) parts.push(entry);
    }
    for (const entry of spec.delta.modified) {
      if (entry.length > 0) parts.push(entry);
    }
    for (const entry of spec.delta.unchanged) {
      if (entry.length > 0) parts.push(entry);
    }
  }

  return parts.join("\n");
}

/**
 * Identify candidate terms from a spec text that are not yet defined in
 * the glossary.
 *
 * Pipeline:
 *   1. {@link extractCandidates} surfaces TitleCase phrases, PascalCase
 *      identifiers, and Chinese multi-character sequences that do not
 *      appear in `glossaryTerms`.
 *   2. {@link filterCandidates} applies the default extraction rules so
 *      noise (camelCase locals, rare one-off terms) is removed and the
 *      result is capped at `DEFAULT_EXTRACTION_RULES.maxCandidatesPerSession`.
 *
 * `glossaryTerms` should include every term name AND every alias already
 * present in the glossary so aliased concepts are not reported as misses.
 *
 * Returns the filtered shortlist in the order produced by `filterCandidates`
 * (frequency desc, term asc). This function is pure and performs no IO.
 */
export function detectGlossaryMiss(specText: string, glossaryTerms: string[]): TermCandidate[] {
  const raw = extractCandidates(specText, glossaryTerms);
  return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}

/**
 * Render the `[glossary-miss]` notice line displayed at the end of spec
 * output when the glossary does not yet define every surfaced term.
 *
 * Returns the empty string when `missed` is empty so callers can unconditionally
 * concatenate the notice without inserting a stray blank line.
 */
export function renderGlossaryMissNotice(missed: TermCandidate[]): string {
  if (missed.length === 0) return "";
  const terms = missed.map((c) => c.term).join(", ");
  return `[glossary-miss] 未定义术语：[${terms}]`;
}

// ---------------------------------------------------------------------------
// Business-analyst parallel triggering
// ---------------------------------------------------------------------------

/**
 * Collect the union of `core_subdomains` declared across all enabled packs.
 *
 * Each pack's `featureFlags.core_subdomains` is expected to be a `string[]`
 * when present. Packs that omit the flag (or set it to a non-array value) are
 * treated as contributing an empty set. The result is deduplicated.
 *
 * This function is pure.
 */
export function getCoreSubdomains(
  enabledPacks: Array<{ featureFlags: Record<string, unknown> }>,
): string[] {
  const result: string[] = [];
  for (const pack of enabledPacks) {
    const subdomains = pack.featureFlags?.core_subdomains;
    if (Array.isArray(subdomains)) {
      result.push(...subdomains);
    }
  }
  return [...new Set(result)];
}

/**
 * Determine whether the business-analyst subagent should be triggered in
 * parallel during the spec phase.
 *
 * Returns `true` when `currentContext` is defined and appears in the union
 * of core subdomains collected from the enabled packs.
 *
 * This function is pure.
 */
export function shouldTriggerBusinessAnalyst(
  currentContext: string | undefined,
  enabledPacks: Array<{ featureFlags: Record<string, unknown> }>,
): boolean {
  if (!currentContext) return false;
  const coreSubdomains = getCoreSubdomains(enabledPacks);
  return coreSubdomains.includes(currentContext);
}

// ---------------------------------------------------------------------------
// Spec entry routing (Requirements 10, 14 — import + bugfix)
// ---------------------------------------------------------------------------

import { readdirSync } from "node:fs";
import type { BugfixOrchestrationResult } from "./spec-bugfix-orchestration.js";
import { runBugfixOrchestration } from "./spec-bugfix-orchestration.js";
import type { SpecBundle } from "./spec-bundle.js";
import type { ImportModeResult } from "./spec-import.js";
import { parseSpecArgs, runImportMode } from "./spec-import.js";
import { detectSpecKind } from "./spec-kind.js";

export type SpecRouteResult =
  | { mode: "default" }
  | { mode: "import"; path: string; result: ImportModeResult }
  | { mode: "feature"; feature: string }
  | { mode: "bugfix"; bundle: SpecBundle; result: BugfixOrchestrationResult };

/**
 * Route spec entry based on argv and feature directory contents.
 *
 * - Import mode: `/tinkerman spec <file.md>` → parseSpecArgs → runImportMode
 * - Bugfix mode: bugfix.md detected → runBugfixOrchestration
 * - Feature mode: `/tinkerman spec <feature-name>` → feature flow
 * - Default: `/tinkerman spec` → default flow
 */
export function routeSpecEntry(
  argv: string[],
  featureDir: string,
  outputDir: string,
  existingBundle?: SpecBundle,
): SpecRouteResult {
  const parsed = parseSpecArgs(argv);

  if (parsed.mode === "import" && parsed.path) {
    const result = runImportMode(parsed.path, outputDir);
    return { mode: "import", path: parsed.path, result };
  }

  if (parsed.mode === "feature" && parsed.feature) {
    // Check if this is actually a bugfix
    try {
      const files = readdirSync(featureDir);
      const kind = detectSpecKind(files);
      if (kind === "bugfix" && existingBundle) {
        const result = runBugfixOrchestration(existingBundle);
        return { mode: "bugfix", bundle: existingBundle, result };
      }
    } catch (_err: unknown) {
      // Directory doesn't exist yet — feature mode
    }
    return { mode: "feature", feature: parsed.feature };
  }

  return { mode: "default" };
}
