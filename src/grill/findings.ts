/**
 * Findings rendering, parsing, and resume support.
 *
 * @module grill/findings
 */

import type { FailureContext } from "../failure-sink.js";
import type { Glossary } from "../glossary.js";
import type { TermCandidate } from "../glossary-extractor.js";
import { extractNewGlossaryCandidates } from "./glossary.js";
import { selectNextQuestion } from "./tree.js";
import type {
  DecisionCategory,
  DecisionNodeStatus,
  DecisionTree,
  DecisionTreeNode,
  GrillAbandonedInput,
} from "./types.js";

/**
 * Render the `findings/grill-<topic>.md` body for a completed grill session.
 *
 * **Validates: Requirements 4.5**
 */
export function renderGrillFindings(tree: DecisionTree, alignmentSummary: string): string {
  const candidates = extractNewGlossaryCandidates(tree, EMPTY_GLOSSARY_FOR_RENDER);
  return renderGrillFindingsWithCandidates(tree, alignmentSummary, candidates);
}

/**
 * Internal variant that accepts a pre-computed candidate list.
 */
function renderGrillFindingsWithCandidates(
  tree: DecisionTree,
  alignmentSummary: string,
  candidates: TermCandidate[],
): string {
  const title = extractTitle(tree.rootDescription);
  const lines: string[] = [];

  lines.push(`# Grill Findings: ${title}`);
  lines.push("");
  lines.push("## Decision Tree");
  lines.push("");
  for (const root of tree.nodes) {
    renderTreeNode(root, 0, lines);
  }

  lines.push("");
  lines.push("## Q&A Pairs");
  lines.push("");
  const qaLines = renderQAPairs(tree.nodes);
  if (qaLines.length === 0) {
    lines.push("none");
  } else {
    for (const line of qaLines) lines.push(line);
  }

  lines.push("");
  lines.push("## Alignment Summary");
  lines.push("");
  const summaryBody = alignmentSummary.trim().length > 0 ? alignmentSummary : "none";
  lines.push(summaryBody);

  lines.push("");
  lines.push("## New Glossary Candidates");
  lines.push("");
  if (candidates.length === 0) {
    lines.push("none");
  } else {
    for (const c of candidates) {
      lines.push(`- ${c.term} (${c.frequency})`);
    }
  }

  lines.push("");
  return lines.join("\n");
}

/**
 * Parse a `findings/grill-<topic>.md` file back into a DecisionTree.
 *
 * **Validates: Requirements 4.10**
 */
export function parseGrillFindings(content: string, now: Date = new Date()): DecisionTree | null {
  const lines = content.split("\n");

  let title: string | null = null;
  let treeStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (title === null) {
      const titleMatch = FINDINGS_TITLE_LINE.exec(line);
      if (titleMatch !== null) {
        title = titleMatch[1].trim();
      }
    }
    if (line === FINDINGS_DECISION_TREE_HEADER) {
      treeStart = i;
      break;
    }
  }

  if (treeStart === -1) return null;

  const roots: DecisionTreeNode[] = [];
  const stack: Array<{ depth: number; node: DecisionTreeNode }> = [];

  for (let i = treeStart + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("## ")) break;

    const nodeMatch = FINDINGS_NODE_LINE.exec(line);
    if (nodeMatch !== null) {
      const parsed = parseFindingsNodeLine(nodeMatch);
      if (parsed === null) continue;

      while (stack.length > 0 && stack[stack.length - 1].depth >= parsed.depth) {
        stack.pop();
      }

      if (parsed.depth === 0) {
        roots.push(parsed.node);
      } else {
        const top = stack[stack.length - 1];
        if (top === undefined || top.depth !== parsed.depth - 1) {
          continue;
        }
        top.node.children.push(parsed.node);
      }

      stack.push({ depth: parsed.depth, node: parsed.node });
      continue;
    }

    const answerMatch = FINDINGS_ANSWER_LINE.exec(line);
    if (answerMatch !== null && stack.length > 0) {
      const top = stack[stack.length - 1];
      const expectedIndent = (top.depth + 1) * 2;
      if (answerMatch[1].length === expectedIndent) {
        top.node.userAnswer = answerMatch[2];
      }
    }
  }

  if (roots.length === 0) return null;

  const timestamp = now.toISOString();
  return {
    rootDescription: title ?? "",
    nodes: roots,
    createdAt: timestamp,
    lastUpdated: timestamp,
  };
}

/**
 * Resume helper that glues parseGrillFindings and selectNextQuestion.
 *
 * **Validates: Requirements 4.10**
 */
export function resumeGrillFromFindings(
  content: string,
  now: Date = new Date(),
): { tree: DecisionTree; nextNode: DecisionTreeNode | null } | null {
  const tree = parseGrillFindings(content, now);
  if (tree === null) return null;
  return { tree, nextNode: selectNextQuestion(tree) };
}

export function buildGrillAbandonedContext(input: GrillAbandonedInput): FailureContext {
  return {
    skill: "forge-grill",
    topic: input.topic,
    tier: input.tier,
    trigger: "grill_abandoned",
    situation: input.lastPendingNode
      ? `需求澄清中止，最后待决节点：${input.lastPendingNode}`
      : "需求澄清被用户中止",
    rootCause: input.lastPendingNode
      ? `未完成边界对齐，最后待决问题：${input.lastPendingNode}`
      : undefined,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const EMPTY_GLOSSARY_FOR_RENDER: Glossary = {
  schema_version: 1,
  updated: "",
  terms: [],
};

function extractTitle(description: string): string {
  for (const line of description.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return "(untitled)";
}

function renderTreeNode(node: DecisionTreeNode, depth: number, lines: string[]): void {
  const indent = "  ".repeat(depth);
  const status = node.status.toUpperCase();
  lines.push(`${indent}- [${status}] ${node.category}/${node.id}: ${node.question}`);
  if (node.userAnswer !== undefined && node.userAnswer.length > 0) {
    lines.push(`${indent}  Answer: ${node.userAnswer}`);
  }
  for (const child of node.children) {
    renderTreeNode(child, depth + 1, lines);
  }
}

function renderQAPairs(nodes: DecisionTreeNode[]): string[] {
  const lines: string[] = [];
  const visit = (node: DecisionTreeNode): void => {
    if (node.status === "resolved" && node.userAnswer !== undefined) {
      lines.push(`- Q: ${node.question}`);
      lines.push(`  A: ${node.userAnswer}`);
    }
    for (const child of node.children) visit(child);
  };
  for (const root of nodes) visit(root);
  return lines;
}

const DECISION_CATEGORY_SET: ReadonlySet<string> = new Set<DecisionCategory>([
  "functionality",
  "boundary",
  "dependency",
  "assumption",
  "non_goal",
]);

const DECISION_STATUS_SET: ReadonlySet<string> = new Set<DecisionNodeStatus>([
  "pending",
  "resolved",
  "deferred",
  "skipped",
]);

const FINDINGS_NODE_LINE = /^( *)- \[([A-Z]+)\] (\w+)\/([\w-]+): (.+)$/;
const FINDINGS_ANSWER_LINE = /^( +)Answer: (.+)$/;
const FINDINGS_TITLE_LINE = /^# Grill Findings: (.*)$/;
const FINDINGS_DECISION_TREE_HEADER = "## Decision Tree";

function parseFindingsNodeLine(
  match: RegExpExecArray,
): { depth: number; node: DecisionTreeNode } | null {
  const indent = match[1];
  const statusRaw = match[2];
  const category = match[3];
  const id = match[4];
  const question = match[5];

  if (indent.length % 2 !== 0) return null;
  const depth = indent.length / 2;

  const status = statusRaw.toLowerCase();
  if (!DECISION_STATUS_SET.has(status)) return null;
  if (!DECISION_CATEGORY_SET.has(category)) return null;

  return {
    depth,
    node: {
      id,
      category: category as DecisionCategory,
      question,
      status: status as DecisionNodeStatus,
      children: [],
    },
  };
}
