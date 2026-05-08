// Skill skeleton validator — checks SKILL.md for required section structure.
//
// Validates: Requirements 2.1, 2.4, 2.8, 2.13

import { extractStringField, parseFrontmatter } from "./frontmatter.js";

export type DeliverableCategory =
  | "decision"
  | "execution"
  | "delivery"
  | "diagnostic"
  | "query"
  | "other";

export const DELIVERABLE_FIELD_MAP: Record<DeliverableCategory, readonly string[]> = {
  decision: ["Decision", "Rationale", "Evidence", "Next Action"],
  execution: ["Changed Files", "Tests Run", "Verification Output", "Commit Hash"],
  delivery: ["Delivery Target", "Gate Results", "Next Step Prompt"],
  diagnostic: ["Finding", "Root Cause", "Recommendation", "Confidence"],
  query: [],
  other: [],
};

export interface SkeletonCheck {
  filePath?: string;
  hasPrerequisites: boolean;
  hasWorkflow: boolean;
  hasDeliverable: boolean;
  deliverableExempt: boolean;
  legacyExempt: boolean;
  valid: boolean;
  errors: string[];
}

const PREREQUISITES_RE = /^##\s+\d+\.\s*Prerequisites/m;
const DELIVERABLE_RE = /^##\s+\d+\.\s*Deliverable/m;

export function parseSkeleton(content: string): SkeletonCheck {
  const fm = parseFrontmatter(content);
  const deliverableExempt =
    fm !== null && extractStringField(fm.raw, "deliverable_exempt") === "true";
  const legacyExempt =
    fm !== null && extractStringField(fm.raw, "skeleton_exempt_legacy") === "true";

  const hasPrerequisites = PREREQUISITES_RE.test(content);
  const hasDeliverable = DELIVERABLE_RE.test(content);

  // Workflow is assumed present if there are any ## headings (generic check)
  const hasWorkflow = /^##\s+\d+\./m.test(content);

  const errors: string[] = [];

  if (!hasPrerequisites && !legacyExempt) {
    errors.push("缺少 ## Prerequisites 章节");
  }

  if (!hasDeliverable && !deliverableExempt && !legacyExempt) {
    errors.push("缺少 ## Deliverable 章节");
  }

  const valid = legacyExempt || errors.length === 0;

  return {
    hasPrerequisites,
    hasWorkflow,
    hasDeliverable,
    deliverableExempt,
    legacyExempt,
    valid,
    errors,
  };
}

export function renderSkeletonReport(checks: SkeletonCheck[]): string {
  const lines: string[] = [];
  for (const c of checks) {
    const path = c.filePath ?? "unknown";
    const mark = c.valid ? "✓" : "✗";
    const legacy = c.legacyExempt ? " [legacy]" : "";
    const exempt = c.deliverableExempt ? " [deliverable-exempt]" : "";
    lines.push(`${mark} ${path}${legacy}${exempt}`);
    for (const e of c.errors) {
      lines.push(`    - ${e}`);
    }
  }
  return lines.join("\n");
}
