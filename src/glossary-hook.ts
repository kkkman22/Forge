import type { TermCandidate } from "./glossary-extractor.js";
import {
  extractCandidates,
  filterCandidates,
  DEFAULT_EXTRACTION_RULES,
} from "./glossary-extractor.js";
import type { Glossary } from "./glossary.js";
import type { DecisionTree, DecisionTreeNode } from "./grill.js";
import type { SessionData } from "./learn.js";

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

// ---------------------------------------------------------------------------
// Normalizer: rawInput → TermCandidate[]
// ---------------------------------------------------------------------------

function collectGlossaryNames(glossary: Glossary): string[] {
  const out: string[] = [];
  for (const term of glossary.terms) {
    out.push(term.term);
    if (term.aliases !== undefined) {
      for (const alias of term.aliases) out.push(alias);
    }
  }
  return out;
}

function textToCandidates(
  text: string,
  existingTerms: string[],
): TermCandidate[] {
  const raw = extractCandidates(text, existingTerms);
  return filterCandidates(raw, DEFAULT_EXTRACTION_RULES);
}

function collectTreeText(tree: DecisionTree): string {
  const parts: string[] = [];
  if (tree.rootDescription.length > 0) parts.push(tree.rootDescription);
  const visit = (node: DecisionTreeNode): void => {
    if (node.question.length > 0) parts.push(node.question);
    if (node.userAnswer !== undefined && node.userAnswer.length > 0) {
      parts.push(node.userAnswer);
    }
    for (const child of node.children) visit(child);
  };
  for (const root of tree.nodes) visit(root);
  return parts.join("\n");
}

function collectSessionText(data: SessionData): string {
  const chunks: string[] = [];
  const pushAll = (values: string[] | undefined): void => {
    if (values === undefined) return;
    for (const v of values) {
      if (v.length > 0) chunks.push(v);
    }
  };
  pushAll(data.decisions);
  pushAll(data.findings);
  pushAll(data.reviews);
  pushAll(data.progress);
  pushAll(data.sessions);
  return chunks.join(". ");
}

export function normalizeInput(input: GlossaryCheckInput): TermCandidate[] {
  const existing = collectGlossaryNames(input.glossary);

  switch (input.rawInput.kind) {
    case "candidates":
      return input.rawInput.terms.map((t) => ({
        term: t.term,
        context: t.definition,
        frequency: 1,
      }));

    case "decision_tree":
      return textToCandidates(
        collectTreeText(input.rawInput.tree as DecisionTree),
        existing,
      );

    case "spec_content":
      return textToCandidates(input.rawInput.markdown, existing);

    case "plan_content": {
      const text = input.rawInput.tasks
        .map((t) => `${t.title}. ${t.description}`)
        .join(". ");
      return textToCandidates(text, existing);
    }

    case "review_findings": {
      const text = input.rawInput.findings
        .map((f) => f.description)
        .join(". ");
      return textToCandidates(text, existing);
    }

    case "session":
      return textToCandidates(
        collectSessionText(input.rawInput.data),
        existing,
      );

    case "commit_message":
      return textToCandidates(input.rawInput.message, existing);
  }
}
