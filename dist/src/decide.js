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
// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
/** Default team members that are always present in the decide Agent Team. */
const DEFAULT_MEMBERS = [
    { name: "product", role: "产品视角", agent: "product" },
    { name: "architect", role: "架构视角", agent: "architect" },
    { name: "security", role: "安全视角", agent: "security" },
];
/** The designer member added conditionally. */
const DESIGNER_MEMBER = {
    name: "designer",
    role: "设计视角",
    agent: "designer",
};
/**
 * Keywords in task descriptions that signal UI changes.
 * Covers both Chinese and English terms from SKILL.md §3.4.
 */
const UI_DESCRIPTION_KEYWORDS = [
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
const INTERACTION_FLOW_PATTERNS = [
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
const UI_FILE_EXTENSIONS = [
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
export function descriptionHasUIKeywords(description) {
    const lower = description.toLowerCase();
    return UI_DESCRIPTION_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
}
/**
 * Check whether the task description mentions user interaction flow changes.
 * Case-insensitive matching.
 */
export function descriptionHasInteractionFlows(description) {
    const lower = description.toLowerCase();
    return INTERACTION_FLOW_PATTERNS.some((p) => lower.includes(p.toLowerCase()));
}
/**
 * Check whether any of the involved files have UI-related extensions.
 */
export function filesHaveUIExtensions(files) {
    return files.some((file) => {
        const lower = file.toLowerCase();
        return UI_FILE_EXTENSIONS.some((ext) => lower.endsWith(ext));
    });
}
/**
 * Determine whether the task involves UI changes based on all three signal
 * categories from SKILL.md §3.4.
 */
export function involvesUIChanges(context) {
    return (descriptionHasUIKeywords(context.taskDescription) ||
        descriptionHasInteractionFlows(context.taskDescription) ||
        filesHaveUIExtensions(context.involvedFiles));
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
export function toKebabCase(topic) {
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
export function generateDecisionPath(date, topic) {
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
export function getDecideTeamMembers(context) {
    const members = [...DEFAULT_MEMBERS];
    if (involvesUIChanges(context)) {
        members.push(DESIGNER_MEMBER);
    }
    return members;
}
//# sourceMappingURL=decide.js.map