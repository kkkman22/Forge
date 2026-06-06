/**
 * UI change detection for the decide phase.
 *
 * Determines whether the designer agent should be added to the decide team
 * based on task description keywords, interaction flow patterns, and file extensions.
 *
 * @module decide/ui-detection
 */

import type { DecideContext } from "./types.js";

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
