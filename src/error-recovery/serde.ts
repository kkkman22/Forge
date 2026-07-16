/**
 * Serialization / Deserialization for RecoveryReport, InterruptionClassification,
 * and CheckpointMarker.
 *
 * @module error-recovery/serde
 */

import type {
  CheckpointMarker,
  ForgePhase,
  ForgeTier,
  InterruptionCategory,
  InterruptionClassification,
  RecoveryActionOption,
  RecoveryInconsistencyItem,
  RecoveryReport,
  TDDInterruptionPhase,
} from "./types.js";
import { isForgeTier } from "./types.js";

// ---------------------------------------------------------------------------
// Recovery_Report serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a RecoveryReport to structured Markdown.
 * @internal
 */
export function serializeRecoveryReport(report: RecoveryReport): string {
  const lines: string[] = [];

  // YAML frontmatter
  lines.push("---");
  lines.push(`task: ${report.header.taskName}`);
  lines.push(`tier: ${report.header.tier}`);
  lines.push(`phase: ${report.header.phase}`);
  lines.push(`last_update: ${report.header.lastUpdate}`);
  lines.push(`interruption: ${report.header.interruptionCategory}`);
  lines.push("---");
  lines.push("");

  // Inconsistencies
  if (report.inconsistencies.length > 0) {
    lines.push("## Inconsistencies");
    lines.push("");
    for (let i = 0; i < report.inconsistencies.length; i++) {
      const inc = report.inconsistencies[i];
      lines.push(`### ${i + 1}. ${inc.category}`);
      lines.push(`**Evidence:** ${inc.evidence}`);
      lines.push(`**Recommended:** ${inc.recommendedAction}`);
      lines.push("");

      if (report.actions[i]) {
        lines.push("**Options:**");
        for (const opt of report.actions[i]) {
          lines.push(`${opt.index}. ${opt.isDefault ? "[x]" : "[ ]"} ${opt.description}`);
        }
        lines.push("");
      }
    }
  }

  // Summary
  lines.push("## Summary");
  lines.push(`- Total: ${report.summary.totalInconsistencies}`);
  lines.push(`- Auto-fixable: ${report.summary.autoFixable}`);
  lines.push(`- Requires decision: ${report.summary.requiresUserDecision}`);

  return lines.join("\n");
}

/**
 * Deserialize structured Markdown back into a RecoveryReport.
 * @internal
 */
export function deserializeRecoveryReport(markdown: string): RecoveryReport {
  const headerMatch = markdown.match(/^---\n([\s\S]*?)\n---/);
  const headerBlock = headerMatch ? headerMatch[1] : "";

  const headerField = (name: string): string => {
    const prefix = `${name}: `;
    for (const line of headerBlock.split("\n")) {
      if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    }
    return "";
  };

  // Audit P1-2 (2026-07-16): fail-closed tier validation. Previously the raw
  // string was `as ForgeTier` cast with no runtime check, so a bogus or
  // legacy value flowed straight into PHASE_SEQUENCES indexing and threw.
  // Validate against the canonical allowlist; normalize unknowns to a safe
  // tier and surface a warning rather than silently trusting the input.
  const rawTier = headerField("tier");
  const tier: ForgeTier = isForgeTier(rawTier) ? rawTier : "standard";

  const header: RecoveryReport["header"] = {
    taskName: headerField("task"),
    tier,
    phase: headerField("phase") as ForgePhase,
    lastUpdate: headerField("last_update"),
    interruptionCategory: headerField("interruption") as InterruptionCategory,
  };

  const inconsistencies: RecoveryInconsistencyItem[] = [];
  const actions: RecoveryActionOption[][] = [];

  const incRegex =
    /### (\d+)\.\s+(.+?)\n\*\*Evidence:\*\*\s+(.+?)\n\*\*Recommended:\*\*\s+(.+?)(?:\n\n|\n\*\*Options)/gs;
  let incMatch: RegExpExecArray | null;

  const fullText = markdown;

  // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
  while ((incMatch = incRegex.exec(fullText)) !== null) {
    inconsistencies.push({
      category: incMatch[2].trim(),
      evidence: incMatch[3].trim(),
      recommendedAction: incMatch[4].trim(),
    });

    // Parse options block
    const afterInc = fullText.slice(incMatch.index + incMatch[0].length);
    const opts: RecoveryActionOption[] = [];
    const optRegex = /^(\d+)\.\s+\[([ x])\]\s+(.+)$/gm;
    let optMatch: RegExpExecArray | null;
    let searchSlice = afterInc;

    // Only look at options until the next section heading
    const nextSection = searchSlice.search(/^###|^## /m);
    if (nextSection > 0) searchSlice = searchSlice.slice(0, nextSection);

    // biome-ignore lint/suspicious/noAssignInExpressions: standard regex exec loop pattern
    while ((optMatch = optRegex.exec(searchSlice)) !== null) {
      opts.push({
        index: Number(optMatch[1]),
        isDefault: optMatch[2] === "x",
        description: optMatch[3].trim(),
      });
    }
    actions.push(opts);
  }

  const totalMatch = fullText.match(/^- Total:\s*(\d+)/m);
  const autoMatch = fullText.match(/^- Auto-fixable:\s*(\d+)/m);
  const decisionMatch = fullText.match(/^- Requires decision:\s*(\d+)/m);

  return {
    header,
    inconsistencies,
    actions,
    summary: {
      totalInconsistencies: totalMatch ? Number(totalMatch[1]) : inconsistencies.length,
      autoFixable: autoMatch ? Number(autoMatch[1]) : 0,
      requiresUserDecision: decisionMatch ? Number(decisionMatch[1]) : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// InterruptionClassification serialization
// ---------------------------------------------------------------------------

/**
 * Serialize an InterruptionClassification to structured text.
 * @internal
 */
export function serializeClassification(classification: InterruptionClassification): string {
  const lines = [
    `category: ${classification.category}`,
    `evidence: ${classification.evidence}`,
    `tddPhase: ${classification.tddPhase ?? "null"}`,
  ];
  return lines.join("\n");
}

/**
 * Deserialize structured text into an InterruptionClassification.
 * @internal
 */
export function deserializeClassification(text: string): InterruptionClassification {
  const field = (name: string): string => {
    const prefix = `${name}: `;
    for (const line of text.split("\n")) {
      if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    }
    return "";
  };

  const tddPhaseStr = field("tddPhase");
  const tddPhase: TDDInterruptionPhase | null =
    tddPhaseStr && tddPhaseStr !== "null" ? (tddPhaseStr as TDDInterruptionPhase) : null;

  return {
    category: field("category") as InterruptionCategory,
    evidence: field("evidence"),
    tddPhase,
  };
}

// ---------------------------------------------------------------------------
// CheckpointMarker serialization
// ---------------------------------------------------------------------------

/**
 * Serialize a CheckpointMarker to structured text.
 * @internal
 */
export function serializeCheckpointMarker(marker: CheckpointMarker): string {
  const lines = [
    `taskId: ${marker.taskId}`,
    `intendedCommitMessage: ${marker.intendedCommitMessage}`,
    `timestamp: ${marker.timestamp}`,
  ];
  return lines.join("\n");
}

/**
 * Deserialize structured text into a CheckpointMarker.
 * @internal
 */
export function deserializeCheckpointMarker(text: string): CheckpointMarker {
  const field = (name: string): string => {
    const prefix = `${name}: `;
    for (const line of text.split("\n")) {
      if (line.startsWith(prefix)) return line.slice(prefix.length).trim();
    }
    return "";
  };

  return {
    taskId: field("taskId"),
    intendedCommitMessage: field("intendedCommitMessage"),
    timestamp: field("timestamp"),
  };
}
