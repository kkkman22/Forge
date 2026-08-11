#!/usr/bin/env node
// category: user-facing
// ============================================================================
// validate-skill-descriptions.mjs — SKILL.md description 校验器
//
// 扫描 skills/tinkerman-*/SKILL.md，校验每个 frontmatter description 是否符合：
//   1. 非空
//   2. ≤ 1024 字符
//   3. 包含 "Use when"（大小写不敏感，允许任意空白）
//   4. 不含禁用模式：营销语言 / 版本号 / 具体日期
//   5. [NEW] 恰好两句话（两句式格式）
//   6. [NEW] 首句以祈使动词开头
//   7. [NEW] 第二句以 "Use when" 开头
//
// 规则 5-7 默认 error 模式，加 --lenient 切换 warning 模式（逃生阀）。
//
// 规则镜像自 src/skill-description.ts，内联实现以避免依赖 dist/ 构建。
//
// 用法：
//   node scripts/validate-skill-descriptions.mjs [--strict]
//
// 退出码：
//   0  所有 skill description 合规
//   1  至少一个 skill 违规（含 --strict 下的规则 5-7 违规）
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  console.log(`Usage: scripts/validate-skill-descriptions.mjs [--lenient]

Validate SKILL.md frontmatter descriptions against two-sentence format rules.
Checks: sentence count, imperative verb, "Use when" trigger, forbidden patterns.
  --lenient  Downgrade rule 5-7 failures to warnings (default: strict)`);
  process.exit(0);
}

const lenient = args.includes("--lenient");
const strict = !lenient;

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

// 祈使动词白名单（镜像 src/skill-description-imperatives.ts）
const IMPERATIVE_WHITELIST = [
  "Abort", "Audit", "Build", "Capture", "Decide", "Decompose",
  "Diagnose", "Execute", "Fix", "Grill", "Orchestrate", "Plan",
  "Refactor", "Restart", "Resume", "Review", "Ship", "Specify",
  "Test", "Verify",
];

// ---------------------------------------------------------------------------
// Frontmatter 解析（镜像 src/frontmatter.ts）
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
// Two-sentence helpers（镜像 src/skill-description.ts 扩展）
// ---------------------------------------------------------------------------

function splitSentences(text) {
  if (text === "") return [""];
  return text.split(/[。.]/);
}

function countSentences(text) {
  if (text.trim() === "") return 0;
  const parts = splitSentences(text);
  const nonEmpty = parts.filter((s) => s.trim() !== "");
  return nonEmpty.length === 0 ? 1 : nonEmpty.length;
}

function startsWithImperative(sentence, whitelist) {
  if (sentence === "") return false;
  const trimmed = sentence.trimStart();
  if (trimmed === "") return false;
  const firstWord = trimmed.split(/\s+/)[0] ?? "";
  return whitelist.includes(firstWord);
}

function secondSentenceStartsWithUseWhen(sentences) {
  if (sentences.length < 2) return false;
  const nonEmpty = sentences.filter((s) => s.trim() !== "");
  if (nonEmpty.length < 2) return false;
  const second = nonEmpty[1].trimStart();
  return /^use\s+when/i.test(second);
}

// ---------------------------------------------------------------------------
// 核心校验
// ---------------------------------------------------------------------------

function validateDescription(filePath, content) {
  const fm = parseFrontmatter(content);
  const description = fm === null ? "" : (extractStringField(fm.raw, "description") ?? "");
  const isDeprecated = fm !== null && /^deprecated:\s*true\s*$/m.test(fm.raw);
  const length = description.length;
  const errors = [];
  const warnings = [];

  // Deprecated SKILLs use "DEPRECATED — use X instead." format and are exempt
  // from two-sentence imperative rules. They still must have a non-empty
  // description and no forbidden marketing patterns.
  if (isDeprecated) {
    if (fm === null) {
      errors.push("缺少 frontmatter");
    } else if (description === "") {
      errors.push("description 字段缺失或为空");
    }
    if (length > MAX_LENGTH) {
      errors.push(`description 超长：${length} > ${MAX_LENGTH}`);
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
      hasUseWhen: false,
      hasForbiddenPatterns: hitReasons,
      sentenceCount: countSentences(description),
      firstSentenceStartsWithImperative: false,
      secondSentenceStartsWithUseWhen: false,
      valid: errors.length === 0,
      warnings: [],
      errors,
      deprecated: true,
    };
  }

  // --- 原有规则（始终 enforced） ---

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

  // --- 新增规则（两句话格式） ---

  let sentenceCount = 0;
  let firstSentenceStartsWithImperative = false;
  let secondStart = false;

  if (description !== "") {
    const sentences = splitSentences(description);
    sentenceCount = countSentences(description);
    firstSentenceStartsWithImperative = startsWithImperative(sentences[0] ?? "", IMPERATIVE_WHITELIST);
    secondStart = secondSentenceStartsWithUseWhen(sentences);

    if (sentenceCount !== 2) {
      const msg = `description 需要 2 句话，当前 ${sentenceCount} 句`;
      if (strict) errors.push(msg); else warnings.push(msg);
    }
    if (!firstSentenceStartsWithImperative) {
      const msg = "description 首句未以祈使动词开头";
      if (strict) errors.push(msg); else warnings.push(msg);
    }
    if (!secondStart) {
      const msg = 'description 第二句未以 "Use when" 开头';
      if (strict) errors.push(msg); else warnings.push(msg);
    }
  }

  return {
    filePath,
    description,
    length,
    hasUseWhen,
    hasForbiddenPatterns: hitReasons,
    sentenceCount,
    firstSentenceStartsWithImperative,
    secondSentenceStartsWithUseWhen: secondStart,
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

// ---------------------------------------------------------------------------
// 文件扫描：skills/tinkerman-*/SKILL.md
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

  console.log("SKILL Description Check" + (strict ? " [STRICT]" : ""));
  console.log("==========================" + (strict ? "========" : ""));

  let failed = 0;
  let warned = 0;
  for (const r of results) {
    const rel = r.filePath.slice(rootDir.length + 1);
    if (r.valid && r.warnings.length === 0) {
      console.log(`✓ ${rel}  (len=${r.length}, sentences=${r.sentenceCount})`);
    } else if (r.valid && r.warnings.length > 0) {
      warned++;
      console.log(`⚠ ${rel}  (len=${r.length}, sentences=${r.sentenceCount})`);
      for (const w of r.warnings) {
        console.log(`    [warning] ${w}`);
      }
    } else {
      failed++;
      console.log(`✗ ${rel}  (len=${r.length}, sentences=${r.sentenceCount})`);
      for (const err of r.errors) {
        console.log(`    - ${err}`);
      }
      for (const w of r.warnings) {
        console.log(`    [warning] ${w}`);
      }
    }
  }

  console.log("");
  console.log(`Summary: ${results.length - failed - warned}/${results.length} passed, ${warned} warnings, ${failed} failed`);

  if (failed > 0) {
    console.log("");
    console.log(`FAIL: ${failed} skill description(s) violate the spec.`);
    process.exit(1);
  }
  if (warned > 0 && lenient) {
    console.log("");
    console.log(`NOTE: ${warned} skill(s) have two-sentence format warnings. Run with --strict to enforce.`);
  }
  console.log("All skill descriptions valid ✓");
  process.exit(0);
}

main();
