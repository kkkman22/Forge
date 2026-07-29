import type { Glossary, GlossaryTerm } from "./glossary.js";
import { detectConflict } from "./glossary.js";
import type { TermCandidate } from "./glossary-extractor.js";
import {
  DEFAULT_EXTRACTION_RULES,
  extractCandidates,
  filterCandidates,
} from "./glossary-extractor.js";
import type { DecisionTree, DecisionTreeNode } from "./grill/types.js";
// P3-2: import SessionData from the shared leaf module (was from learn.js,
// which created a learn ↔ glossary-hook back-edge).
import type { SessionData } from "./session-types.js";

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
    | { kind: "session"; data: import("./session-types.js").SessionData }
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

function textToCandidates(text: string, existingTerms: string[]): TermCandidate[] {
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
        [], // don't exclude existing — need to detect redefinitions
      );

    case "spec_content":
      return textToCandidates(input.rawInput.markdown, existing);

    case "plan_content": {
      const text = input.rawInput.tasks.map((t) => `${t.title}. ${t.description}`).join(". ");
      return textToCandidates(text, existing);
    }

    case "review_findings": {
      const text = input.rawInput.findings.map((f) => f.description).join(". ");
      return textToCandidates(text, existing);
    }

    case "session":
      return textToCandidates(collectSessionText(input.rawInput.data), existing);

    case "commit_message":
      return textToCandidates(input.rawInput.message, existing);
  }
}

// ---------------------------------------------------------------------------
// Dispatch: unified glossary check entry point
// ---------------------------------------------------------------------------

export function runGlossaryCheck(input: GlossaryCheckInput): GlossaryCheckResult {
  // Fast path for candidates: pass full GlossaryTerm (with aliases) directly
  if (input.rawInput.kind === "candidates") {
    return runCandidatesCheck(input, input.rawInput.terms);
  }

  const candidates = normalizeInput(input);
  const cacheKey = `${input.phase}:${hashCandidates(candidates)}`;

  if (input.alreadyChecked.has(cacheKey)) {
    return {
      phase: input.phase,
      hasConflict: false,
      conflicts: [],
      newCandidates: [],
      shouldBlock: false,
    };
  }

  const conflicts: GlossaryConflictInfo[] = [];
  const newCandidates: TermCandidate[] = [];
  const timestamp = input.now.toISOString().slice(0, 10);

  for (const c of candidates) {
    const provisional: GlossaryTerm = {
      term: c.term,
      definition: c.context,
      last_updated: timestamp,
    };
    const result = detectConflict(input.glossary, provisional);
    if (result.hasConflict && result.conflictingTerm !== undefined && result.reason !== undefined) {
      conflicts.push({
        candidate: c.term,
        existing: result.conflictingTerm,
        reason: result.reason,
      });
    } else {
      newCandidates.push(c);
    }
  }

  const shouldBlock = conflicts.length > 0 && GLOSSARY_BLOCK_POLICY[input.phase][input.mode];

  return {
    phase: input.phase,
    hasConflict: conflicts.length > 0,
    conflicts,
    newCandidates,
    shouldBlock,
  };
}

function runCandidatesCheck(input: GlossaryCheckInput, terms: GlossaryTerm[]): GlossaryCheckResult {
  const cacheKey = `${input.phase}:${hashCandidates(terms.map((t) => ({ term: t.term, context: t.definition, frequency: 1 })))}`;

  if (input.alreadyChecked.has(cacheKey)) {
    return {
      phase: input.phase,
      hasConflict: false,
      conflicts: [],
      newCandidates: [],
      shouldBlock: false,
    };
  }

  const conflicts: GlossaryConflictInfo[] = [];
  const newCandidates: TermCandidate[] = [];

  for (const candidate of terms) {
    const result = detectConflict(input.glossary, candidate);
    if (result.hasConflict && result.conflictingTerm !== undefined && result.reason !== undefined) {
      conflicts.push({
        candidate: candidate.term,
        existing: result.conflictingTerm,
        reason: result.reason,
      });
    } else {
      newCandidates.push({ term: candidate.term, context: candidate.definition, frequency: 1 });
    }
  }

  const shouldBlock = conflicts.length > 0 && GLOSSARY_BLOCK_POLICY[input.phase][input.mode];

  return {
    phase: input.phase,
    hasConflict: conflicts.length > 0,
    conflicts,
    newCandidates,
    shouldBlock,
  };
}

// ---------------------------------------------------------------------------
// Render: unified prompt template
// ---------------------------------------------------------------------------

export function renderGlossaryConflictPrompt(
  result: GlossaryCheckResult,
  _mode: GlossaryCheckMode,
): string {
  if (!result.hasConflict || result.conflicts.length === 0) return "";

  const lines: string[] = [];
  lines.push(`⚠️ 检测到术语冲突 (${result.conflicts.length}):`);
  for (const conflict of result.conflicts) {
    lines.push(
      `  - "${conflict.candidate}"`,
      `    现有定义: ${conflict.existing.definition}`,
      `    冲突原因: ${conflict.reason}`,
    );
  }
  lines.push("请选择处理：");
  lines.push("  1. 保留现有");
  lines.push("  2. 替换为新定义");
  lines.push("  3. 新增为别名");
  lines.push("  4. 跳过（保留歧义）");
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Render: autonomous advisory
// ---------------------------------------------------------------------------

export function getAdvisoryPath(phase: GlossaryCheckPhase, topic: string): string {
  return `.forge/findings/glossary-advisory-${phase}-${topic}.md`;
}

export function renderPendingAdvisoryNotice(paths: string[]): string {
  if (paths.length === 0) return "";
  const lines: string[] = [];
  lines.push(`[glossary] pending glossary advisories (${paths.length}):`);
  for (const p of paths) {
    lines.push(`  - ${p}`);
  }
  return lines.join("\n");
}

export function renderGlossaryAdvisory(result: GlossaryCheckResult): string {
  if (!result.hasConflict || result.conflicts.length === 0) return "";

  const lines: string[] = [];
  lines.push(`# Glossary Advisory: ${result.phase}`);
  lines.push("");
  lines.push(`本次 autonomous 执行检测到术语冲突 ${result.conflicts.length} 处。`);
  lines.push("建议在交互模式下运行 `/forge learn --review-glossary` 进行人工裁定。");
  lines.push("");
  lines.push("## 冲突清单");
  for (const conflict of result.conflicts) {
    lines.push(
      `- "${conflict.candidate}": existing = "${conflict.existing.definition}", reason = ${conflict.reason}`,
    );
  }
  if (result.newCandidates.length > 0) {
    lines.push("");
    lines.push("## 候选新术语");
    for (const c of result.newCandidates) {
      lines.push(`- ${c.term} (frequency: ${c.frequency})`);
    }
  }
  return lines.join("\n");
}
