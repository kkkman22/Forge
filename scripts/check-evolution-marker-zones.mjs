#!/usr/bin/env node
// category: internal-only
// ============================================================================
// check-evolution-marker-zones.mjs — Evolution 标记位置合法性校验
//
// Evolution 标记（HTML 注释形式 `<!-- Evolution: ... -->`）只允许出现在
// `.tinkerman/reviews/**`、`.tinkerman/progress/**`、`.tinkerman/findings/**` 这三类受保
// 护区文件中。本脚本扫描冻结区 / 只读区文件，禁止标记泄漏：
//
//   1. `skills/**/*.md`（SKILL 冻结区 + references/）
//   2. `.tinkerman/config.md`（项目根配置）
//   3. 任何 frontmatter `status: locked` 的 spec 文件：
//        - `.kiro/specs/*/requirements.md | design.md | tasks.md`
//        - `.tinkerman/specs/*/spec.md`
//
// 用法：
//   node scripts/check-evolution-marker-zones.mjs
//
// 退出码：
//   0  所有冻结区 / 锁定文件均未出现 Evolution 标记
//   1  至少一处违规，报告文件 + 行号
//
// 与 src/evolution-marker.ts 的 MARKER_REGEX 保持一致；这里用简化版本只匹配
// 注释开头即可（标记只可能以 `<!-- Evolution:` 起始）。
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// 常量
// ---------------------------------------------------------------------------

/** 匹配 Evolution 标记行的起始；大小写敏感，空白容忍。 */
const MARKER_PATTERN = /<!--\s*Evolution:/;

// ---------------------------------------------------------------------------
// frontmatter 解析（只抽取 status 字段，避开 YAML 依赖）
// ---------------------------------------------------------------------------

/**
 * 返回 frontmatter 块中的 `status` 值，找不到时返回空字符串。
 * 接受 `status: locked`、`status: "locked"`、`status: 'locked'` 等变体。
 */
function extractStatus(content) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) return "";
  const afterFirst = trimmed.slice(3);
  const closeIndex = afterFirst.indexOf("\n---");
  if (closeIndex === -1) return "";
  const block = afterFirst.slice(0, closeIndex);
  const match = block.match(/^status:\s*"?'?([a-zA-Z_]+)'?"?\s*$/m);
  return match ? match[1].trim() : "";
}

// ---------------------------------------------------------------------------
// 文件扫描 helpers
// ---------------------------------------------------------------------------

/** 递归枚举给定目录下符合 filter 的文件，目录缺失时返回空数组。 */
function walkFiles(dir, filter) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkFiles(full, filter));
    } else if (entry.isFile() && filter(full)) {
      results.push(full);
    }
  }
  return results;
}

/** 查询路径是否存在（文件或目录），捕获异常返回 false。 */
function existsSafe(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// 集合构建
// ---------------------------------------------------------------------------

function collectFrozenFiles(rootDir) {
  const out = [];

  // 1. skills/**/*.md —— 整个 skills 目录都是冻结区
  const skillsDir = join(rootDir, "skills");
  out.push(...walkFiles(skillsDir, (p) => p.endsWith(".md")));

  // 2. .tinkerman/config.md —— 项目根配置
  const configPath = join(rootDir, ".tinkerman", "config.md");
  if (existsSafe(configPath)) out.push(configPath);

  // 3. 锁定的 spec 文件：frontmatter status: locked
  const lockedCandidates = [
    ...walkFiles(join(rootDir, ".kiro", "specs"), (p) =>
      /\/(requirements|design|tasks)\.md$/.test(p),
    ),
    ...walkFiles(join(rootDir, ".tinkerman", "specs"), (p) => p.endsWith("/spec.md")),
  ];
  for (const candidate of lockedCandidates) {
    let content;
    try {
      content = readFileSync(candidate, "utf8");
    } catch {
      continue;
    }
    if (extractStatus(content) === "locked") {
      out.push(candidate);
    }
  }

  return out.sort();
}

// ---------------------------------------------------------------------------
// 扫描 + 报告
// ---------------------------------------------------------------------------

function scanFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }
  const hits = [];
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (MARKER_PATTERN.test(lines[i])) {
      hits.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const rootDir = resolve(__dirname, "..");

  const files = collectFrozenFiles(rootDir);

  console.log("Evolution Marker Zone Check");
  console.log("===========================");

  let violations = 0;
  for (const file of files) {
    const hits = scanFile(file);
    if (hits.length === 0) continue;
    violations += hits.length;
    const rel = file.slice(rootDir.length + 1);
    console.log(`✗ ${rel}`);
    for (const hit of hits) {
      console.log(`    line ${hit.line}: ${hit.text}`);
    }
  }

  console.log("");
  if (violations === 0) {
    console.log(`Scanned ${files.length} frozen / locked file(s). No Evolution markers found ✓`);
    process.exit(0);
  }

  console.log(
    `FAIL: found ${violations} Evolution marker(s) in frozen / locked files. ` +
      `Move them to .tinkerman/reviews/**, .tinkerman/progress/**, or .tinkerman/findings/**.`,
  );
  process.exit(1);
}

main();
