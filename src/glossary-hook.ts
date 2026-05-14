import type { TermCandidate } from "./glossary-extractor.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type GlossaryCheckPhase =
  | "spec"
  | "decide"
  | "grill"
  | "plan"
  | "review"
  | "learn"
  | "build";

export type GlossaryCheckMode = "autonomous" | "interactive";

export type GlossaryConflictResolution =
  | "keep_existing"
  | "replace_existing"
  | "add_alias"
  | "skip";

export interface GlossaryConflictInfo {
  candidate: string;
  existing: import("./glossary.js").GlossaryTerm;
  reason: import("./glossary.js").ConflictResult["reason"];
}

export interface GlossaryCheckResult {
  phase: GlossaryCheckPhase;
  hasConflict: boolean;
  conflicts: GlossaryConflictInfo[];
  newCandidates: TermCandidate[];
  shouldBlock: boolean;
}

export type GlossaryCheckInput = {
  phase: GlossaryCheckPhase;
  mode: GlossaryCheckMode;
  rawInput:
    | { kind: "candidates"; terms: import("./glossary.js").GlossaryTerm[] }
    | { kind: "decision_tree"; tree: unknown }
    | { kind: "spec_content"; markdown: string }
    | {
        kind: "plan_content";
        tasks: Array<{ title: string; description: string }>;
      }
    | {
        kind: "review_findings";
        findings: Array<{ description: string }>;
      }
    | { kind: "session"; data: import("./learn.js").SessionData }
    | { kind: "commit_message"; message: string };
  glossary: import("./glossary.js").Glossary;
  now: Date;
  alreadyChecked: Set<string>;
};

// ---------------------------------------------------------------------------
// Block policy: phase × mode → shouldBlock
// ---------------------------------------------------------------------------

export const GLOSSARY_BLOCK_POLICY: Record<
  GlossaryCheckPhase,
  Record<GlossaryCheckMode, boolean>
> = {
  spec: { interactive: true, autonomous: false },
  decide: { interactive: true, autonomous: false },
  grill: { interactive: true, autonomous: false },
  plan: { interactive: false, autonomous: false },
  review: { interactive: false, autonomous: false },
  learn: { interactive: true, autonomous: false },
  build: { interactive: false, autonomous: false },
};

// ---------------------------------------------------------------------------
// Hash (frequency control key)
// ---------------------------------------------------------------------------

export function hashCandidates(candidates: TermCandidate[]): string {
  if (candidates.length === 0) return "";
  const sorted = candidates
    .map((c) => c.term.trim().toLowerCase())
    .filter((t) => t.length > 0)
    .sort();
  return sorted.join("|");
}
