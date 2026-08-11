#!/usr/bin/env node
// category: user-facing
// ============================================================================
// validate-skill-length.mjs — SKILL.md 行数校验器（Progressive Disclosure）
//
// 扫描 skills/ 下所有 forge-*/SKILL.md 与 skills/shared/*.md，校验：
//   - 每个主 SKILL.md 的 effective line count（排除空行）≤ 150
//   - skills/shared/** 下的文件豁免（跨 skill 共享引用，Requirements 5.5）
//
// 规则镜像自 src/skill-length.ts，内联实现以避免依赖 dist/ 构建。
//
// 用法：
//   node scripts/validate-skill-length.mjs
//
// 退出码：
//   0  所有非豁免 SKILL.md ≤ 150 行
//   1  至少一个非豁免文件超标
// ============================================================================

import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log(`Usage: scripts/validate-skill-length.mjs

Validate SKILL.md effective line count (non-blank lines) against 150-line budget.
Scans skills/tinkerman-*/SKILL.md. skills/shared/ files are exempt.`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 常量（镜像 src/skill-length.ts）
// ---------------------------------------------------------------------------

const DEFAULT_LIMIT = 150;

// ---------------------------------------------------------------------------
// 纯函数（镜像 src/skill-length.ts）
// ---------------------------------------------------------------------------

function countEffectiveLines(content) {
  if (content === "") return 0;
  const lines = content.split("\n");
  let count = 0;
  for (const line of lines) {
    if (line.trim() !== "") count++;
  }
  return count;
}

function countRawLines(content) {
  if (content === "") return 0;
  const lines = content.split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") return lines.length - 1;
  return lines.length;
}

function isInSharedDir(filePath) {
  const normalised = filePath.replace(/\\/g, "/");
  return normalised.split("/").includes("shared");
}

function checkSkillLength(filePath, content, limit = DEFAULT_LIMIT) {
  const lineCount = countRawLines(content);
  const effectiveLineCount = countEffectiveLines(content);
  const exempt = isInSharedDir(filePath);
  const valid = exempt || effectiveLineCount <= limit;
  return { filePath, lineCount, effectiveLineCount, limit, exempt, valid };
}

// ---------------------------------------------------------------------------
// 文件枚举：skills/tinkerman-*/SKILL.md + skills/shared/*.md
// ---------------------------------------------------------------------------

function listSkillMdFiles(skillsDir) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(skillsDir);
  } catch {
    return results;
  }

  for (const name of entries) {
    const full = join(skillsDir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    if (name === "shared") {
      // skills/shared/*.md（浅扫）
      let sharedEntries;
      try {
        sharedEntries = readdirSync(full);
      } catch {
        continue;
      }
      for (const f of sharedEntries) {
        if (!f.endsWith(".md")) continue;
        const fp = join(full, f);
        try {
          if (statSync(fp).isFile()) results.push(fp);
        } catch {
          // ignore
        }
      }
      continue;
    }

    if (!name.startsWith("forge-")) continue;

    const skillPath = join(full, "SKILL.md");
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

  const paths = listSkillMdFiles(skillsDir);
  const results = paths.map((p) => checkSkillLength(p, readFileSync(p, "utf8"), DEFAULT_LIMIT));

  console.log("SKILL Length Check (Progressive Disclosure)");
  console.log("===========================================");
  console.log(`Limit: ${DEFAULT_LIMIT} effective (non-empty) lines`);
  console.log("");

  let failed = 0;
  for (const r of results) {
    const rel = r.filePath.slice(rootDir.length + sep.length);
    const marker = r.valid ? (r.exempt ? "○" : "✓") : "✗";
    const tag = r.exempt ? "  (exempt: shared/)" : "";
    const budget = `effective=${r.effectiveLineCount} raw=${r.lineCount}`;
    if (r.valid) {
      console.log(`${marker} ${rel}  ${budget}${tag}`);
    } else {
      failed++;
      const over = r.effectiveLineCount - r.limit;
      console.log(`${marker} ${rel}  ${budget}  (OVER by ${over})`);
    }
  }

  console.log("");
  console.log(
    `Summary: ${results.length - failed}/${results.length} within budget, ${failed} over`,
  );

  if (failed > 0) {
    console.log("");
    console.log(`FAIL: ${failed} SKILL.md file(s) exceed the ${DEFAULT_LIMIT}-line budget.`);
    console.log("Move detailed content under <skill>/references/*.md.");
    process.exit(1);
  }
  console.log("All SKILL.md files within budget ✓");
  process.exit(0);
}

main();
