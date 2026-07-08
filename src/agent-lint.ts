/**
 * agent-lint.ts — Agent lint 核心逻辑(纯函数,可测)。
 *
 * 校验 agents/ 源 agent 文件的最低质量标准(spec#2):
 *   ERROR: name/description 缺失、CRLF 行结尾
 *   WARN:  缺推荐 section(Identity/Mission/Critical Rules)、正文 <50 词
 *
 * section 名从 spec#3 的 AGENT-TEMPLATE.md 动态读取(单向 #3→#2)。
 *
 * @see scripts/lint-agents.mjs (CLI 入口)
 */

/** lint 问题级别。 */
export type Severity = "ERROR" | "WARN";

/** lint 问题。 */
export interface LintIssue {
  file: string;
  severity: Severity;
  code: string;
  message: string;
}

/** 必填 frontmatter 字段(ERROR)。 */
export const REQUIRED_FRONTMATTER = ["name", "description"];

/**
 * 角色 → 必填 frontmatter 字段(ERROR)。
 *
 * 角色按文件名归类,字段名用项目实际约定的 camelCase(非 kebab-case):
 *   - review 类(spec-check/quality-check/security-check)→ disallowedTools
 *     (硬隔离:禁止 Bash/Write/Edit/Agent,防 review agent 自行改代码)
 *   - decide 类(forge-decide-*)→ effort
 *     (decide 视角必须声明推理投入档位)
 *
 * 注:forge-build/plan/review 的 memory/initialPrompt 暂不强制为 ERROR
 * —— forge-ship 等同前缀 agent 职责不同(跑门禁非自主循环),强制会误伤。
 * 已实测现有 review/decide agent 全部合规。
 */
export interface RoleRule {
  role: string;
  match: RegExp;
  requiredFields: string[];
}

export const ROLE_RULES: RoleRule[] = [
  {
    role: "review",
    match: /^(spec-check|quality-check|security-check)\.md$/i,
    requiredFields: ["disallowedTools"],
  },
  {
    role: "decide",
    match: /^forge-decide-.*\.md$/i,
    requiredFields: ["effort"],
  },
];

/** 根据文件名解析 agent 角色;未匹配返回 null。 */
export function resolveAgentRole(fileName: string): string | null {
  const base = fileName.split("/").pop() ?? fileName;
  for (const rule of ROLE_RULES) {
    if (rule.match.test(base)) return rule.role;
  }
  return null;
}

/** 推荐 section(WARN),从 AGENT-TEMPLATE 动态读取的默认值。 */
export const DEFAULT_RECOMMENDED_SECTIONS = ["Identity", "Mission", "Critical Rules"];

/** 正文最少词数(WARN)。 */
export const MIN_BODY_WORDS = 50;

/**
 * 提取 YAML frontmatter 块(首尾 --- 之间,不含定界符)。
 * 无 frontmatter 返回 null。
 */
export function extractFrontmatter(text: string): string | null {
  if (!text.startsWith("---")) return null;
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  return match ? match[1] : null;
}

/**
 * 提取 frontmatter 字段值(简单行匹配,不解析完整 YAML)。
 */
export function getFrontmatterField(frontmatter: string, field: string): string | null {
  const re = new RegExp(`^${field}:\\s*(.+)$`, "m");
  const match = frontmatter.match(re);
  if (!match) return null;
  return match[1].trim().replace(/^["']|["']$/g, "");
}

/**
 * 提取正文(frontmatter 之后的内容)。
 */
export function extractBody(text: string): string {
  if (!text.startsWith("---")) return text;
  const parts = text.split(/^---$/m);
  if (parts.length < 3) return text;
  return parts.slice(2).join("---").replace(/^\n+/, "");
}

/**
 * 检测 CRLF 行结尾。
 */
export function hasCRLF(text: string): boolean {
  return text.includes("\r\n") || text.includes("\r");
}

/**
 * 统计正文词数(按空白分割;中文按字符近似)。
 */
export function countWords(body: string): number {
  // 英文按空格分词;连续中文字符每 2 字算 1 词(粗略近似)
  const englishWords = (body.match(/[a-zA-Z0-9]+/g) || []).length;
  const chineseChars = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
  return englishWords + Math.floor(chineseChars / 2);
}

/**
 * 检测正文是否含某 section(## 标题,大小写不敏感)。
 */
export function hasSection(body: string, sectionName: string): boolean {
  const re = new RegExp(`^##\\s+.*${escapeRegex(sectionName)}`, "im");
  return re.test(body);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * lint 单个 agent 文件文本。
 *
 * @param fileName 文件名(用于报告)
 * @param text 文件全文
 * @param recommendedSections 推荐 section 列表(从模板读取)
 * @returns 问题列表(空=通过)
 */
export function lintAgentText(
  fileName: string,
  text: string,
  recommendedSections: string[] = DEFAULT_RECOMMENDED_SECTIONS,
): LintIssue[] {
  const issues: LintIssue[] = [];

  // 0. CRLF 检测
  if (hasCRLF(text)) {
    issues.push({
      file: fileName,
      severity: "ERROR",
      code: "CRLF",
      message: "CRLF 行结尾检测到 — 转为 LF",
    });
    return issues; // CRLF 会干扰后续 frontmatter 解析,直接返回
  }

  // 1. frontmatter 存在性
  const fm = extractFrontmatter(text);
  if (fm === null) {
    issues.push({
      file: fileName,
      severity: "ERROR",
      code: "NO_FRONTMATTER",
      message: "缺少 YAML frontmatter(应以 --- 开头)",
    });
    return issues;
  }

  // 2. 必填字段
  for (const field of REQUIRED_FRONTMATTER) {
    if (getFrontmatterField(fm, field) === null) {
      issues.push({
        file: fileName,
        severity: "ERROR",
        code: `MISSING_${field.toUpperCase()}`,
        message: `frontmatter 缺少必填字段: ${field}`,
      });
    }
  }

  // 2b. 角色专属必填字段(review → disallowedTools, decide → effort)
  const role = resolveAgentRole(fileName);
  if (role !== null) {
    const rule = ROLE_RULES.find((r) => r.role === role);
    if (rule) {
      for (const field of rule.requiredFields) {
        if (getFrontmatterField(fm, field) === null) {
          issues.push({
            file: fileName,
            severity: "ERROR",
            code: `ROLE_MISSING_${field.toUpperCase()}`,
            message: `${role} 类 agent 缺少必填字段: ${field}`,
          });
        }
      }
    }
  }

  // 3. 推荐 section(WARN)
  const body = extractBody(text);
  for (const section of recommendedSections) {
    if (!hasSection(body, section)) {
      issues.push({
        file: fileName,
        severity: "WARN",
        code: `MISSING_SECTION_${section.toUpperCase()}`,
        message: `缺少推荐 section: ${section}`,
      });
    }
  }

  // 4. 正文长度(WARN)
  const words = countWords(body);
  if (words < MIN_BODY_WORDS) {
    issues.push({
      file: fileName,
      severity: "WARN",
      code: "BODY_TOO_SHORT",
      message: `正文过短(${words} 词 < ${MIN_BODY_WORDS})`,
    });
  }

  return issues;
}
