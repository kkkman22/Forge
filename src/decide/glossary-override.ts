/**
 * Glossary alignment check and ADR user overrides for the decide phase.
 *
 * @module decide/glossary-override
 */

import type { AdrCriteriaResult, DecisionCandidate } from "../adr-criteria.js";
import type { Glossary, GlossaryTerm } from "../glossary.js";
import { runGlossaryCheck } from "../glossary-hook.js";
import type {
  AdrOverride,
  DecideGlossaryConflict,
  InlineNoteAppender,
  StatusFileContext,
} from "./types.js";

/**
 * Check every candidate term introduced in the decide phase against the
 * current glossary and return the full list of conflicts found.
 */
export function checkDecideGlossaryConflicts(
  candidateTerms: GlossaryTerm[],
  glossary: Glossary,
): DecideGlossaryConflict[] {
  const result = runGlossaryCheck({
    phase: "decide",
    mode: "interactive",
    rawInput: { kind: "candidates", terms: candidateTerms },
    glossary,
    now: new Date(),
    alreadyChecked: new Set(),
  });
  const byName = new Map<string, GlossaryTerm>();
  for (const t of candidateTerms) byName.set(t.term.trim().toLowerCase(), t);

  return result.conflicts
    .filter((c): c is typeof c & { reason: NonNullable<typeof c.reason> } => c.reason !== undefined)
    .map((c) => {
      const original = byName.get(c.candidate.trim().toLowerCase());
      return {
        term: c.candidate,
        existing: c.existing,
        candidate: original ?? {
          term: c.candidate,
          definition: c.existing.definition,
          last_updated: c.existing.last_updated,
        },
        reason: c.reason,
      };
    });
}

/**
 * Render a user-facing clarification prompt for the given conflicts.
 */
export function renderDecideGlossaryConflictPrompt(conflicts: DecideGlossaryConflict[]): string {
  if (conflicts.length === 0) return "";

  const lines: string[] = [];
  lines.push(`⚠️ Glossary conflict detected (${conflicts.length}):`);
  for (const conflict of conflicts) {
    lines.push(
      `  - "${conflict.term}": existing = "${conflict.existing.definition}", proposed = "${conflict.candidate.definition}"`,
    );
  }
  lines.push("请澄清：保留现有 / 替换现有 / 新增别名");
  return lines.join("\n");
}

/**
 * Replace every literal `-->` with `--&gt;` for safe HTML comment embedding.
 */
function escapeCommentTerminator(text: string): string {
  return text.replace(/-->/g, "--&gt;");
}

/**
 * Render a one-line HTML-comment "inline decision note".
 *
 * Output: `<!-- decision: ${title} | reason: ${reasoning} -->`
 */
export function renderInlineDecisionNote(
  decision: DecisionCandidate,
  result: AdrCriteriaResult,
): string {
  const safeTitle = escapeCommentTerminator(decision.title);
  const safeReason = escapeCommentTerminator(result.reasoning);
  return `<!-- decision: ${safeTitle} | reason: ${safeReason} -->`;
}

/**
 * Append an inline decision note to an upstream file.
 */
export function appendInlineNote(fs: InlineNoteAppender, upstreamFile: string, note: string): void {
  const existing = fs.exists(upstreamFile) ? fs.readFile(upstreamFile) : "";
  let next: string;
  if (existing.length === 0) {
    next = `${note}\n`;
  } else if (existing.endsWith("\n\n")) {
    next = `${existing}${note}\n`;
  } else if (existing.endsWith("\n")) {
    next = `${existing}\n${note}\n`;
  } else {
    next = `${existing}\n\n${note}\n`;
  }
  fs.writeFile(upstreamFile, next);
}

/**
 * Select the upstream file to which an inline decision note should be appended.
 *
 * Priority: progressPath > planPath > specPath > null
 */
export function resolveUpstreamFile(status: StatusFileContext): string | null {
  if (status.progressPath !== undefined && status.progressPath !== "") {
    return status.progressPath;
  }
  if (status.planPath !== undefined && status.planPath !== "") {
    return status.planPath;
  }
  if (status.specPath !== undefined && status.specPath !== "") {
    return status.specPath;
  }
  return null;
}

/**
 * Inspect a user prompt for ADR-verdict override keywords.
 *
 * **Validates: Requirements 2.6**
 */
export function parseAdrOverride(userPrompt: string): AdrOverride {
  const hasNoAdr = userPrompt.includes("--no-adr");
  const hasForceAdr = userPrompt.includes("--force-adr");

  if (hasNoAdr) {
    return { forceAdr: false, noAdr: true };
  }
  if (hasForceAdr) {
    return { forceAdr: true, noAdr: false };
  }
  return { forceAdr: false, noAdr: false };
}

/**
 * Apply a user override to an AdrCriteriaResult.
 *
 * **Validates: Requirements 2.6**
 */
export function applyAdrOverride(
  result: AdrCriteriaResult,
  override: AdrOverride,
): AdrCriteriaResult {
  if (override.noAdr) {
    return {
      ...result,
      shouldBecomeAdr: false,
      verdict: "DISCARD",
      reasoning: "User override: --no-adr",
    };
  }
  if (override.forceAdr) {
    return {
      ...result,
      shouldBecomeAdr: true,
      verdict: "WRITE_ADR",
      reasoning: "User override: --force-adr",
    };
  }
  return result;
}
