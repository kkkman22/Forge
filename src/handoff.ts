/**
 * Handoff document system — preserves decisions, rationale, and context
 * across stage transitions in the Forge pipeline.
 *
 * Each completing stage produces
 * a handoff document before transitioning, so the next stage starts with
 * full context instead of re-discovering or re-debating settled decisions.
 *
 * Handoff documents live in `.forge/handoffs/<from>-to-<to>.md`.
 *
 * Design principles:
 *   - Handoffs are lightweight (10-20 lines of decisions, not full specs)
 *   - Handoffs accumulate (later stages can read all prior handoffs)
 *   - Handoffs survive task cancellation (not deleted by /tinkerman abort)
 *   - Each handoff has a fixed structure: decided / rejected / risks / artifacts / remaining
 */

import { extractStringField, parseFrontmatter } from "./frontmatter.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface HandoffEntry {
  /** What was decided in this stage. */
  decided: string[];
  /** Alternatives considered and why they were rejected. */
  rejected: string[];
  /** Identified risks for the next stage. */
  risks: string[];
  /** Key files created or modified. */
  artifacts: string[];
  /** Items left for the next stage to handle. */
  remaining: string[];
}

export interface HandoffDocument {
  /** Stage that produced this handoff. */
  fromStage: string;
  /** Stage that should consume this handoff. */
  toStage: string;
  /** ISO timestamp of when the handoff was created. */
  createdAt: string;
  /** The handoff content. */
  entry: HandoffEntry;
}

// ---------------------------------------------------------------------------
// Valid stage transitions (defines which handoffs are expected)
// ---------------------------------------------------------------------------

export const STAGE_TRANSITIONS: ReadonlyArray<[string, string]> = [
  ["decide", "spec"],
  ["spec", "plan"],
  ["plan", "build"],
  ["build", "review"],
  ["review", "test"],
  ["test", "ship"],
  ["ship", "learn"],
];

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validate a handoff entry has meaningful content.
 *
 * Rules:
 *   - `decided` must have at least one entry (a stage that decided nothing is suspicious)
 *   - `rejected` can be empty (not every stage rejects alternatives)
 *   - `risks` can be empty (not every stage identifies risks)
 *   - `artifacts` can be empty (some stages don't produce files)
 *   - `remaining` can be empty (last stage has nothing remaining)
 *   - No field can contain empty strings
 */
export function validateHandoffEntry(entry: HandoffEntry): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (entry.decided.length === 0) {
    errors.push("Handoff must contain at least one decision");
  }

  const allFields: [string, string[]][] = [
    ["decided", entry.decided],
    ["rejected", entry.rejected],
    ["risks", entry.risks],
    ["artifacts", entry.artifacts],
    ["remaining", entry.remaining],
  ];

  for (const [fieldName, items] of allFields) {
    for (let i = 0; i < items.length; i++) {
      if (items[i].trim() === "") {
        errors.push(`${fieldName}[${i}] is empty`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a stage transition is a known valid transition.
 */
export function isValidTransition(from: string, to: string): boolean {
  return STAGE_TRANSITIONS.some(([f, t]) => f === from && t === to);
}

/**
 * Generate the file path for a handoff document.
 */
export function handoffPath(from: string, to: string): string {
  return `.forge/handoffs/${from}-to-${to}.md`;
}

/**
 * Render a handoff document to markdown format.
 *
 * Output format:
 * ```
 * ---
 * from: "decide"
 * to: "spec"
 * created: "2025-01-15T14:30:00Z"
 * ---
 *
 * ## Handoff: decide → spec
 *
 * ### Decided
 * - ...
 *
 * ### Rejected
 * - ...
 *
 * ### Risks
 * - ...
 *
 * ### Artifacts
 * - ...
 *
 * ### Remaining
 * - ...
 * ```
 */
export function renderHandoff(doc: HandoffDocument): string {
  const lines: string[] = [];

  lines.push("---");
  lines.push(`from: "${doc.fromStage}"`);
  lines.push(`to: "${doc.toStage}"`);
  lines.push(`created: "${doc.createdAt}"`);
  lines.push("---");
  lines.push("");
  lines.push(`## Handoff: ${doc.fromStage} → ${doc.toStage}`);
  lines.push("");

  const sections: [string, string[]][] = [
    ["Decided", doc.entry.decided],
    ["Rejected", doc.entry.rejected],
    ["Risks", doc.entry.risks],
    ["Artifacts", doc.entry.artifacts],
    ["Remaining", doc.entry.remaining],
  ];

  for (const [title, items] of sections) {
    lines.push(`### ${title}`);
    if (items.length === 0) {
      lines.push("（无）");
    } else {
      for (const item of items) {
        lines.push(`- ${item.trim()}`);
      }
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Parse a rendered handoff markdown back into a HandoffDocument.
 * Returns null if the content is not a valid handoff document.
 */
export function parseHandoff(content: string): HandoffDocument | null {
  const parsed = parseFrontmatter(content);
  if (!parsed) return null;

  const frontmatter = parsed.raw;
  const body = parsed.body.trim();

  // Parse frontmatter fields using shared extractors
  const fromStage = extractStringField(frontmatter, "from") ?? "";
  const toStage = extractStringField(frontmatter, "to") ?? "";
  const createdAt = extractStringField(frontmatter, "created") ?? "";

  if (!fromStage || !toStage || !createdAt) return null;

  // Parse body sections
  const parseSection = (sectionName: string): string[] => {
    const regex = new RegExp(`### ${sectionName}\\n([\\s\\S]*?)(?=\\n### |$)`);
    const match = body.match(regex);
    if (!match) return [];
    const sectionContent = match[1].trim();
    if (sectionContent === "（无）") return [];
    return sectionContent
      .split("\n")
      .filter((line) => line.startsWith("- "))
      .map((line) => line.slice(2));
  };

  return {
    fromStage,
    toStage,
    createdAt,
    entry: {
      decided: parseSection("Decided"),
      rejected: parseSection("Rejected"),
      risks: parseSection("Risks"),
      artifacts: parseSection("Artifacts"),
      remaining: parseSection("Remaining"),
    },
  };
}

/**
 * Collect all prior handoffs for a given stage.
 *
 * For example, if the current stage is "build", this returns handoffs from:
 *   - decide-to-spec.md
 *   - spec-to-plan.md
 *   - plan-to-build.md
 *
 * This allows the build stage to see the full decision history.
 */
export function priorHandoffPaths(currentStage: string): string[] {
  const paths: string[] = [];
  for (const [from, to] of STAGE_TRANSITIONS) {
    paths.push(handoffPath(from, to));
    if (to === currentStage) break;
  }
  return paths;
}
