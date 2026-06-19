/**
 * Decide subagent orchestration — team building and Round 1/2 construction.
 *
 * @module decide/orchestration
 */

import type { DecisionCandidate, DecisionSignals } from "../adr-criteria.js";
import { evaluateAdrCriteria } from "../adr-criteria.js";
import type { SubagentInvocation } from "../types.js";
import type {
  CriteriaScreenItem,
  CriticOutput,
  DecideContext,
  SubagentConfig,
  TeamMember,
} from "./types.js";
import { involvesUIChanges } from "./ui-detection.js";

/** Default team members that are always present in the decide Agent Team. */
const DEFAULT_MEMBERS: TeamMember[] = [
  { name: "product", role: "产品视角", agent: "product" },
  { name: "architect", role: "架构视角", agent: "architect" },
  { name: "security", role: "安全视角", agent: "security" },
];

/** The designer member added conditionally. */
const DESIGNER_MEMBER: TeamMember = {
  name: "designer",
  role: "设计视角",
  agent: "designer",
};

const MAX_PERSPECTIVE_TOKENS = 500;

/**
 * Return the Agent Team members for the decide phase.
 *
 * - product, architect, security are always included.
 * - designer is included if and only if the task involves UI changes.
 */
export function getDecideTeamMembers(context: DecideContext): TeamMember[] {
  return getDecideSubagents(context);
}

/** Alias for the Subagent migration — returns the same members. */
export function getDecideSubagents(context: DecideContext): SubagentConfig[] {
  const members = [...DEFAULT_MEMBERS];

  if (involvesUIChanges(context)) {
    members.push(DESIGNER_MEMBER);
  }

  return members;
}

/**
 * Build Round 1 SubagentInvocations for the decide phase.
 */
export function buildDecideRound1Subagents(context: DecideContext): SubagentInvocation[] {
  const members = getDecideSubagents(context);
  const contextSection =
    context.contextFiles && context.contextFiles.length > 0
      ? `\nRelevant artifacts (spec/research files this task declared):\n${context.contextFiles.map((f) => `- ${f}`).join("\n")}`
      : "";

  return members.map((member) => ({
    agentType: member.agent,
    prompt: `[${member.role}] 分析任务：${context.taskDescription}。涉及文件：${context.involvedFiles.join(", ")}。请控制在 ${MAX_PERSPECTIVE_TOKENS} tokens 以内。${contextSection}`,
    permissionMode: "default" as const,
    maxTurns: 10,
  }));
}

/**
 * Build the Round 2 Critic SubagentInvocation.
 */
export function buildDecideCriticInvocation(
  round1Outputs: string[],
  _context: DecideContext,
): SubagentInvocation {
  const allOutputs = round1Outputs.join("\n\n---\n\n");

  return {
    agentType: "critic",
    prompt: `交叉审查以下视角输出，找出盲点和不一致：\n\n${allOutputs}`,
    permissionMode: "default",
    maxTurns: 10,
  };
}

/**
 * Resolve the decide document status based on Critic output.
 *
 * Returns "needs_revision" when blocking issues are present, "confirmed" otherwise.
 */
export function resolveDecideStatus(output: CriticOutput): "needs_revision" | "confirmed" {
  return output.hasBlockingIssues ? "needs_revision" : "confirmed";
}

/**
 * Run the ADR three-question screen over a batch of decision candidates.
 *
 * **Validates: Requirements 2.1, 2.3, 2.4, 2.10**
 */
export function runCriteriaScreen(
  decisions: DecisionCandidate[],
  signalsList: DecisionSignals[],
): CriteriaScreenItem[] {
  if (decisions.length !== signalsList.length) {
    throw new RangeError(
      `runCriteriaScreen: decisions and signals must have the same length (got ${decisions.length} decisions, ${signalsList.length} signals).`,
    );
  }

  const items: CriteriaScreenItem[] = [];
  for (let i = 0; i < decisions.length; i++) {
    const decision = decisions[i];
    const signals = signalsList[i];
    items.push({
      decision,
      signals,
      result: evaluateAdrCriteria(decision, signals),
    });
  }
  return items;
}
