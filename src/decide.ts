/**
 * Decide engine — designer conditional trigger logic extracted from decide/SKILL.md.
 *
 * Implements the Agent Team member selection for `/forge decide`:
 *   - Default members: product, architect, security (always present)
 *   - Designer is dynamically added ONLY when the task involves UI changes
 *
 * UI change signals (from SKILL.md §3.4):
 *   1. Task description mentions frontend/UI keywords
 *   2. Involved files include UI-related extensions
 *   3. Task involves user interaction flow changes
 *
 * NOT triggered for: pure backend API, database changes, CI/CD config,
 * pure logic refactoring.
 */

export interface DecideContext {
  taskDescription: string;
  involvedFiles: string[];
}

export interface TeamMember {
  name: string;
  role: string;
  agent: string;
}

/** Renamed alias for the Subagent migration — semantically equivalent to TeamMember. */
export type SubagentConfig = TeamMember;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

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

/**
 * Keywords in task descriptions that signal UI changes.
 * Covers both Chinese and English terms from SKILL.md §3.4.
 */
const UI_DESCRIPTION_KEYWORDS: string[] = [
  // Chinese keywords
  "前端",
  "页面",
  "组件",
  "样式",
  "界面",
  "导航栏",
  "导航",
  "表单",
  "布局",
  "按钮",
  "弹窗",
  "对话框",
  "模态框",
  "下拉",
  "菜单",
  "侧边栏",
  "头部",
  "底部",
  "响应式",
  "移动端适配",
  "主题",
  "暗色模式",
  "亮色模式",
  // English keywords
  "ui",
  "frontend",
  "front-end",
  "component",
  "page",
  "style",
  "css",
  "layout",
  "navigation",
  "navbar",
  "sidebar",
  "modal",
  "dialog",
  "button",
  "form",
  "dropdown",
  "menu",
  "responsive",
  "theme",
  "dark mode",
  "light mode",
];

/**
 * Patterns in task descriptions that signal user interaction flow changes.
 * These indicate UI work even without explicit UI keywords.
 */
const INTERACTION_FLOW_PATTERNS: string[] = [
  // Chinese patterns
  "注册流程",
  "登录流程",
  "搜索功能",
  "用户交互",
  "交互流程",
  "操作流程",
  "用户设置",
  "设置页面",
  "个人中心",
  "购物车",
  "结账流程",
  "支付流程",
  "上传功能",
  "拖拽",
  "筛选功能",
  "排序功能",
  "分页",
  // English patterns
  "registration flow",
  "login flow",
  "search feature",
  "user interaction",
  "checkout flow",
  "payment flow",
  "upload feature",
  "drag and drop",
  "filter feature",
  "sort feature",
  "pagination",
  "onboarding",
  "wizard",
  "user settings",
];

/** File extensions that indicate UI-related files. */
const UI_FILE_EXTENSIONS: string[] = [
  ".tsx",
  ".jsx",
  ".vue",
  ".svelte",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".styl",
];

// ---------------------------------------------------------------------------
// Detection helpers
// ---------------------------------------------------------------------------

/**
 * Check whether the task description contains any UI-related keywords.
 * Case-insensitive matching.
 */
export function descriptionHasUIKeywords(description: string): boolean {
  const lower = description.toLowerCase();
  return UI_DESCRIPTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}

/**
 * Check whether the task description mentions user interaction flow changes.
 * Case-insensitive matching.
 */
export function descriptionHasInteractionFlows(description: string): boolean {
  const lower = description.toLowerCase();
  return INTERACTION_FLOW_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}

/**
 * Check whether any of the involved files have UI-related extensions.
 */
export function filesHaveUIExtensions(files: string[]): boolean {
  return files.some((file) => {
    const lower = file.toLowerCase();
    return UI_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  });
}

/**
 * Determine whether the task involves UI changes based on all three signal
 * categories from SKILL.md §3.4.
 */
export function involvesUIChanges(context: DecideContext): boolean {
  return (
    descriptionHasUIKeywords(context.taskDescription) ||
    descriptionHasInteractionFlows(context.taskDescription) ||
    filesHaveUIExtensions(context.involvedFiles)
  );
}

// ---------------------------------------------------------------------------
// Decision document path helpers
// ---------------------------------------------------------------------------

/**
 * Convert a topic string to kebab-case.
 *
 * Rules:
 *  - Lowercase the entire string
 *  - Replace whitespace and non-alphanumeric/non-hyphen characters with hyphens
 *  - Collapse consecutive hyphens into one
 *  - Trim leading/trailing hyphens
 *  - If result is empty (e.g. pure non-ASCII input like Chinese), fallback to
 *    "untitled-<4-char-hash>" for readability while preserving uniqueness
 */
export function toKebabCase(topic: string): string {
  const result = topic
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-") // replace non-alphanumeric (except hyphen) with hyphen
    .replace(/-{2,}/g, "-") // collapse consecutive hyphens
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens

  if (result.length > 0) {
    return result;
  }

  // Fallback for non-ASCII input: generate a readable prefix + short hash
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    const char = topic.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0; // simple djb2-like hash
  }
  const hex = Math.abs(hash).toString(16).padStart(4, "0").slice(0, 4);
  return `untitled-${hex}`;
}

/**
 * Generate the decision document output path.
 *
 * @param date  - Date string in YYYY-MM-DD format
 * @param topic - Human-readable topic string (will be converted to kebab-case)
 * @returns Path in the format `.forge/decisions/<YYYY-MM-DD>-<topic>.md`
 */
export function generateDecisionPath(date: string, topic: string): string {
  const kebabTopic = toKebabCase(topic);
  return `.forge/decisions/${date}-${kebabTopic}.md`;
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Subagent orchestration (Agent Team Migration — R2, R7)
// ---------------------------------------------------------------------------

import type { SubagentInvocation } from "./loop-types.js";

const MAX_PERSPECTIVE_TOKENS = 500;

/**
 * Build Round 1 SubagentInvocations for the decide phase.
 *
 * Maps SubagentConfig[] to SubagentInvocation[] with perspective-specific prompts.
 * Always includes product, architect, security. Includes designer iff involvesUIChanges.
 */
export function buildDecideRound1Subagents(context: DecideContext): SubagentInvocation[] {
  const members = getDecideSubagents(context);

  return members.map((member) => ({
    agentType: member.agent,
    prompt: `[${member.role}] 分析任务：${context.taskDescription}。涉及文件：${context.involvedFiles.join(", ")}。请控制在 ${MAX_PERSPECTIVE_TOKENS} tokens 以内。`,
    permissionMode: "default" as const,
    maxTurns: 10,
  }));
}

/**
 * Build the Round 2 Critic SubagentInvocation.
 *
 * The Critic receives all Round 1 perspective outputs for cross-review.
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

/** Output from the Critic agent for status resolution. */
export interface CriticOutput {
  hasBlockingIssues: boolean;
  issues: string[];
}

/**
 * Resolve the decide document status based on Critic output.
 *
 * Returns "needs_revision" when blocking issues are present, "confirmed" otherwise.
 */
export function resolveDecideStatus(output: CriticOutput): "needs_revision" | "confirmed" {
  return output.hasBlockingIssues ? "needs_revision" : "confirmed";
}
