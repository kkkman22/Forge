#!/usr/bin/env node
// category: user-facing
/**
 * lint-agents.mjs — Agent 文件 lint 门禁。
 *
 * 校验 agents/ 源 agent 文件(spec#2):
 *   ERROR: name/description 缺失、CRLF 行结尾
 *   WARN:  缺推荐 section(从 AGENT-TEMPLATE.md 动态读取)、正文 <50 词
 *
 * section 名单向依赖 spec#3 的 templates/AGENT-TEMPLATE.md
 * (无循环:模板先定义,lint 后校验)。
 *
 * 纯逻辑在 src/agent-lint.ts(23 测试覆盖),本 CLI 自包含(复用范式)。
 *
 * Usage:
 *   node scripts/lint-agents.mjs [files...]    # 指定文件
 *   node scripts/lint-agents.mjs               # 全 agents/
 *   node scripts/lint-agents.mjs --strict      # WARN 也视为失败
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");
const TEMPLATE_PATH = join(ROOT, "templates", "AGENT-TEMPLATE.md");
const REQUIRED_FRONTMATTER = ["name", "description"];
const DEFAULT_SECTIONS = ["Identity", "Mission", "Critical Rules"];
// 角色 → 必填字段(与 src/agent-lint.ts ROLE_RULES 镜像;字段名 camelCase)。
const ROLE_RULES = [
  { role: "review", match: /^(spec-check|quality-check|security-check)\.md$/i, requiredFields: ["disallowedTools"] },
  { role: "decide", match: /^forge-decide-.*\.md$/i, requiredFields: ["effort"] },
];
function resolveAgentRole(fileName) {
  const base = fileName.split("/").pop();
  for (const rule of ROLE_RULES) {
    if (rule.match.test(base)) return rule.role;
  }
  return null;
}
const MIN_BODY_WORDS = 50;

function showHelp() {
  console.log(`Usage: node scripts/lint-agents.mjs [files...] [--strict]

Agent 文件 lint 门禁(spec#2)。校验 agents/ 唯一源(ADR-0010)。
  ERROR: name/description 缺失、CRLF 行结尾(阻断)
  WARN:  缺推荐 section、正文 <50 词(不阻断,除非 --strict)

推荐 section 从 templates/AGENT-TEMPLATE.md 动态读取(spec#3 单向依赖)。

Options:
  --strict      WARN 也视为失败(exit 1)
  --help, -h    Show this help message`);
}

// ── core (mirrors src/agent-lint.ts; tested there) ──
function extractFrontmatter(text) {
  if (!text.startsWith("---")) return null;
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  return m ? m[1] : null;
}
function getFmField(fm, field) {
  const m = fm.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : null;
}
function extractBody(text) {
  if (!text.startsWith("---")) return text;
  const parts = text.split(/^---$/m);
  return parts.length < 3 ? text : parts.slice(2).join("---").replace(/^\n+/, "");
}
function hasCRLF(text) {
  return text.includes("\r\n") || text.includes("\r");
}
function countWords(body) {
  const en = (body.match(/[a-zA-Z0-9]+/g) || []).length;
  const zh = (body.match(/[\u4e00-\u9fa5]/g) || []).length;
  return en + Math.floor(zh / 2);
}
function hasSection(body, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^##\\s+.*${esc}`, "im").test(body);
}

// 从 AGENT-TEMPLATE.md 读取推荐 section(单向 #3→#2)
function loadRecommendedSections() {
  if (!existsSync(TEMPLATE_PATH)) {
    return DEFAULT_SECTIONS; // spec#3 未落地时用默认
  }
  const tmpl = readFileSync(TEMPLATE_PATH, "utf8");
  // 提取 ## 标题作为 section 名
  const sections = [...tmpl.matchAll(/^##\s+(.+)$/gm)].map((m) => m[1].trim());
  // 过滤掉非 section 的标题(如 Overview/References 等模板说明)
  const sectionKeywords = ["identity", "mission", "rule", "deliverable", "communication"];
  const filtered = sections.filter((s) =>
    sectionKeywords.some((kw) => s.toLowerCase().includes(kw))
  );
  return filtered.length > 0 ? filtered : DEFAULT_SECTIONS;
}

function lintFile(fileName, text, sections) {
  const issues = [];
  if (hasCRLF(text)) {
    issues.push({ file: fileName, severity: "ERROR", code: "CRLF", message: "CRLF 行结尾 — 转为 LF" });
    return issues;
  }
  const fm = extractFrontmatter(text);
  if (fm === null) {
    issues.push({ file: fileName, severity: "ERROR", code: "NO_FRONTMATTER", message: "缺少 YAML frontmatter" });
    return issues;
  }
  for (const field of REQUIRED_FRONTMATTER) {
    if (getFmField(fm, field) === null) {
      issues.push({ file: fileName, severity: "ERROR", code: `MISSING_${field.toUpperCase()}`, message: `frontmatter 缺少: ${field}` });
    }
  }
  // 角色专属必填字段(review → disallowedTools, decide → effort)
  const role = resolveAgentRole(fileName);
  if (role !== null) {
    const rule = ROLE_RULES.find((r) => r.role === role);
    if (rule) {
      for (const field of rule.requiredFields) {
        if (getFmField(fm, field) === null) {
          issues.push({ file: fileName, severity: "ERROR", code: `ROLE_MISSING_${field.toUpperCase()}`, message: `${role} 类 agent 缺少: ${field}` });
        }
      }
    }
  }
  const body = extractBody(text);
  for (const section of sections) {
    if (!hasSection(body, section)) {
      issues.push({ file: fileName, severity: "WARN", code: `MISSING_SECTION`, message: `缺少推荐 section: ${section}` });
    }
  }
  const words = countWords(body);
  if (words < MIN_BODY_WORDS) {
    issues.push({ file: fileName, severity: "WARN", code: "BODY_TOO_SHORT", message: `正文过短(${words}词 < ${MIN_BODY_WORDS})` });
  }
  return issues;
}

// ── main ──
function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--help") || argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }
  const strict = argv.includes("--strict");
  const fileArgs = argv.filter((a) => !a.startsWith("-"));

  if (!existsSync(AGENTS_DIR)) {
    console.error(`✗ agents/ 不存在: ${AGENTS_DIR}`);
    process.exit(1);
  }

  const sections = loadRecommendedSections();
  const files =
    fileArgs.length > 0
      ? fileArgs.map((a) => (a.startsWith("/") ? a : resolve(process.cwd(), a))).filter((p) => existsSync(p))
      : readdirSync(AGENTS_DIR).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => join(AGENTS_DIR, f));

  if (files.length === 0) {
    console.log("No agent files to lint.");
    process.exit(0);
  }

  console.log(`Linting ${files.length} agent(s)... (推荐 section: ${sections.join(", ")})`);
  console.log("");

  let errors = 0;
  let warnings = 0;
  const allIssues = [];
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    const issues = lintFile(file, text, sections);
    allIssues.push(...issues);
    for (const i of issues) {
      const tag = i.severity === "ERROR" ? "ERROR" : "WARN ";
      console.log(`  [${tag}] ${i.file}: ${i.message}`);
      if (i.severity === "ERROR") errors++;
      else warnings++;
    }
  }

  console.log("");
  console.log(`Results: ${errors} error(s), ${warnings} warning(s) in ${files.length} files.`);

  if (errors > 0 || (strict && warnings > 0)) {
    console.log("FAILED");
    process.exit(1);
  }
  console.log("PASSED");
  process.exit(0);
}

main();
