#!/usr/bin/env node
// ============================================================================
// validate-skill-descriptions.mjs — SKILL.md description 校验器
//
// 扫描 skills/forge-*/SKILL.md，校验每个 frontmatter description 是否符合：
//   1. 非空
//   2. ≤ 1024 字符
//   3. 包含 "Use when"（大小写不敏感，允许任意空白）
//   4. 不含禁用模式：营销语言 / 版本号 / 具体日期
//
// 规则镜像自 src/skill-description.ts，内联实现以避免依赖 dist/ 构建。
//
// 用法：
//   node scripts/validate-skill-descriptions.mjs
//
// 退出码：
//   0  所有 skill description 合规
//   1  至少一个 skill 违规
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 规则定义（镜像 src/skill-description.ts）
// ---------------------------------------------------------------------------

const MAX_LENGTH = 1024;
const USE_WHEN_PATTERN = /use\s+when/i;
const FORBIDDEN_PATTERNS = [
  { pattern: /(最好的|革命性|best-ever|unbeatable)/i, reason: "营销性语言" },
  { pattern: /\bv\d+\.\d+/, reason: "版本号" },
  { pattern: /\b202\d-\d{2}-\d{2}\b/, reason: "具体日期" },
];

// ---------------------------------------------------------------------------
// Frontmatter 解析（镜像 src/frontmatter.ts 的 parseFrontmatter + extractStringField）
// ---------------------------------------------------------------------------

const DELIM = "---";

function parseFrontmatter(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith(DELIM)) return null;
  const afterFirst = trimmed.slice(DELIM.length);
  const closingIndex = afterFirst.indexOf(`\n${DELIM}`);
  if (closingIndex === -1) return null;
  return { raw: afterFirst.slice(0, closingIndex) };
}

function extractStringField(raw, field) {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`^${escaped}:\\s*"?([^"\\n]*)"?\\s*$`, "m");
  const m = raw.match(regex);
  return m ? m[1].trim() : null;
}

// ---------------------------------------------------------------------------
// 核心校验（镜像 src/skill-description.ts 的 validateDescription）
// ---------------------------------------------------------------------------

function validateDescription(filePath, content) {
  const fm = parseFrontmatter(content);
  const description = fm === null ? "" : (extractStringField(fm.raw, "description") ?? "");
  const length = description.length;
  const errors = [];

  if (fm === null) {
    errors.push("缺少 frontmatter");
  } else if (description === "") {
    errors.push("description 字段缺失或为空");
  }

  if (length > MAX_LENGTH) {
    errors.push(`description 超长：${length} > ${MAX_LENGTH}`);
  }

  const hasUseWhen = description !== "" && USE_WHEN_PATTERN.test(description);
  if (description !== "" && !hasUseWhen) {
    errors.push('description 缺少 "Use when" 触发语');
  }

  const hitReasons = [];
  for (const { pattern, reason } of FORBIDDEN_PATTERNS) {
    if (pattern.test(description)) {
      hitReasons.push(reason);
      errors.push(`description 命中禁用模式：${reason}`);
    }
  }

  return {
    filePath,
    description,
    length,
    hasUseWhen,
    hasForbiddenPatterns: hitReasons,
    valid: errors.length === 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 文件扫描：skills/forge-*/SKILL.md
// ---------------------------------------------------------------------------

function listSkillFiles(skillsDir) {
  const entries = readdirSync(skillsDir);
  const results = [];
  for (const name of entries) {
    if (!name.startsWith("forge-")) continue;
    const subdir = join(skillsDir, name);
    let st;
    try {
      st = statSync(subdir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const skillPath = join(subdir, "SKILL.md");
    try {
      if (statSync(skillPath).isFile()) results.push(skillPath);
    } catch {
      // 缺失 SKILL.md，跳过
    }
  }
  return results.sort();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const rootDir = resolve(__dirname, "..");
  const skillsDir = join(rootDir, "skills");

  const paths = listSkillFiles(skillsDir);
  const results = paths.map((p) => validateDescription(p, readFileSync(p, "utf8")));

  console.log("SKILL Description Check");
  console.log("=======================");

  let failed = 0;
  for (const r of results) {
    const rel = r.filePath.slice(rootDir.length + 1);
    if (r.valid) {
      console.log(`✓ ${rel}  (len=${r.length})`);
    } else {
      failed++;
      console.log(`✗ ${rel}  (len=${r.length})`);
      for (const err of r.errors) {
        console.log(`    - ${err}`);
      }
    }
  }

  console.log("");
  console.log(`Summary: ${results.length - failed}/${results.length} passed, ${failed} failed`);

  if (failed > 0) {
    console.log("");
    console.log(`FAIL: ${failed} skill description(s) violate the "Use when" spec.`);
    process.exit(1);
  }
  console.log("All skill descriptions valid ✓");
  process.exit(0);
}

main();
