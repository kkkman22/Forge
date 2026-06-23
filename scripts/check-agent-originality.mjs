#!/usr/bin/env node
// category: user-facing
/**
 * check-agent-originality.mjs — Agent 查重门禁。
 *
 * 移植自 agency-agents check-agent-originality.sh:
 *   8-gram shingle + Jaccard 相似度 + 实体中性化(agent name + 工具名)。
 *
 * 防止"换皮"重复 agent 进入库(如又一个长得像 quality-check 的 agent)。
 * 实体中性化后比对,确保换名不换内容的 agent 仍被检测。
 *
 * 默认阈值: WARN ≥ 20%, FAIL ≥ 40%
 *   (agency-agents 184-agent 库基线: 中位数 0%, 最差 1.5%)
 *
 * Exit 0 if all candidates below FAIL, exit 1 if any at/above FAIL.
 * 可经 ORIGINALITY_FAIL / ORIGINALITY_WARN 环境变量覆盖。
 *
 * 纯逻辑在 src/agent-originality.ts(17 测试覆盖),本 CLI 自包含算法
 * (与 check-bundle-sync.mjs 范式一致)。
 *
 * Usage:
 *   node scripts/check-agent-originality.mjs [files...]    # CI: 校验指定文件
 *   node scripts/check-agent-originality.mjs               # 审计: 全库两两比对
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");
const SHINGLE_K = 8;
const FAIL = parseFloat(process.env.ORIGINALITY_FAIL ?? "0.4");
const WARN = parseFloat(process.env.ORIGINALITY_WARN ?? "0.2");
const ENTITY_PLACEHOLDER = "__ent__";

function showHelp() {
  console.log(`Usage: node scripts/check-agent-originality.mjs [files...]

Agent 查重门禁(spec#2)。用 8-gram shingle + Jaccard 相似度 + 实体中性化
检测"换皮"重复 agent。作用于 agents/ 唯一源(ADR-0010)。

Modes:
  [files...]    CI 模式: 仅校验指定文件 vs 全库
  (no args)     审计模式: 全库两两比对

Exit 0 if all below FAIL, exit 1 if any at/above FAIL.
WARN(≥${(WARN * 100).toFixed(0)}%) 不阻断, FAIL(≥${(FAIL * 100).toFixed(0)}%) 阻断。
Override: ORIGINALITY_FAIL / ORIGINALITY_WARN (0-1)。

Options:
  --help, -h    Show this help message`);
}

// ── core (mirrors src/agent-originality.ts; tested there) ──
function stripFrontmatter(text) {
  if (!text.startsWith("---")) return text;
  const parts = text.split(/^---$/m);
  if (parts.length < 3) return text;
  return parts.slice(2).join("---");
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
}

function neutralizeEntities(text, entities) {
  if (entities.size === 0) return text;
  const escaped = [...entities].map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`\\b(${escaped.join("|")})\\b`, "gi");
  return text.replace(re, ENTITY_PLACEHOLDER);
}

function shingles(words, k = SHINGLE_K) {
  const result = new Set();
  if (words.length < k) return result;
  for (let i = 0; i <= words.length - k; i++) result.add(words.slice(i, i + k).join(" "));
  return result;
}

function jaccard(a, b) {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const item of small) if (large.has(item)) inter++;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function agentToShingles(text, entities) {
  return shingles(tokenize(neutralizeEntities(stripFrontmatter(text), entities)));
}

// 从 frontmatter 提取 name 和 tools,作为中性化实体
function extractEntities(allContents) {
  const entities = new Set();
  for (const content of allContents) {
    const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!fmMatch) continue;
    const fm = fmMatch[1];
    const nameMatch = fm.match(/^name:\s*(.+)$/m);
    if (nameMatch) entities.add(nameMatch[1].trim().replace(/^["']|["']$/g, "").toLowerCase());
    const toolsMatch = fm.match(/^tools:\s*(.+)$/m);
    if (toolsMatch) {
      for (const t of toolsMatch[1].split(",")) {
        const trimmed = t.trim().toLowerCase();
        if (trimmed) entities.add(trimmed);
      }
    }
  }
  return entities;
}

// ── main ──
function main() {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
    process.exit(0);
  }

  if (!existsSync(AGENTS_DIR)) {
    console.error(`✗ agents/ 不存在: ${AGENTS_DIR}`);
    process.exit(1);
  }

  // 收集库中所有 agent
  const allFiles = readdirSync(AGENTS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map((f) => join(AGENTS_DIR, f));
  const allContents = allFiles.map((f) => readFileSync(f, "utf8"));
  const entities = extractEntities(allContents);

  // 构建库 corpus: path → shingles
  const corpus = new Map();
  for (let i = 0; i < allFiles.length; i++) {
    corpus.set(allFiles[i], agentToShingles(allContents[i], entities));
  }

  // 确定候选
  const args = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  let candidates;
  if (args.length > 0) {
    candidates = args
      .map((a) => (a.startsWith("/") ? a : resolve(process.cwd(), a)))
      .filter((p) => existsSync(p));
  } else {
    candidates = allFiles; // 审计模式:全库
  }

  if (candidates.length === 0) {
    console.log("No agent files to check.");
    process.exit(0);
  }

  console.log(`Checking ${candidates.length} agent(s) against ${allFiles.length}-agent library...`);
  console.log(`Thresholds: WARN ≥ ${(WARN * 100).toFixed(0)}%, FAIL ≥ ${(FAIL * 100).toFixed(0)}%`);
  console.log("");

  let worst = 0;
  const fails = [];
  const warns = [];

  for (const cand of candidates) {
    const candSh = corpus.get(cand) || agentToShingles(readFileSync(cand, "utf8"), entities);
    let bestName = null;
    let bestScore = 0;

    for (const [other, otherSh] of corpus) {
      if (other === cand) continue;
      const s = jaccard(candSh, otherSh);
      if (s > bestScore) {
        bestScore = s;
        bestName = other;
      }
    }

    const pct = bestScore * 100;
    worst = Math.max(worst, pct);
    const rel = relative(ROOT, cand);
    const bestRel = bestName ? relative(ROOT, bestName) : null;

    let tag = "OK   ";
    if (pct >= FAIL * 100) {
      tag = "FAIL ";
      fails.push({ rel, bestRel, pct });
    } else if (pct >= WARN * 100) {
      tag = "WARN ";
      warns.push({ rel, bestRel, pct });
    }
    console.log(`  [${tag}] ${pct.toFixed(1).padStart(5)}%  ${rel}`);
    if (bestRel) console.log(`            closest: ${bestRel}`);
  }

  console.log("");
  if (fails.length > 0) {
    console.error(`FAILED: ${fails.length} agent(s) substantially duplicate existing content:`);
    for (const f of fails) {
      console.error(`  - ${f.rel}  ~${f.pct.toFixed(0)}% like  ${f.bestRel}`);
    }
    console.error("");
    console.error("A new agent should be genuinely new. 若是市场/平台本地化,请让正文");
    console.error("实质不同(不同平台、战术、示例),而非 find-replace 现有 agent。");
    process.exit(1);
  }

  if (warns.length > 0) {
    console.log(`${warns.length} warning(s) — review for overlap, but not blocking.`);
  }
  console.log(`PASSED (worst overlap ${worst.toFixed(1)}%)`);
  process.exit(0);
}

main();
