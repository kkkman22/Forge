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

// P1-3: thin shell. The pure logic (shingle/jaccard/neutralize/extract*) lives
// in src/agent-originality.ts (17 tests). This CLI imports the compiled dist so
// there is exactly one implementation; the prior self-contained mirror had
// drifted risk (tests covered src, CI ran the mirror).
import {
  DEFAULT_FAIL_THRESHOLD,
  DEFAULT_WARN_THRESHOLD,
  agentToShingles,
  extractNameEntities,
  extractToolEntities,
  jaccard,
} from "../dist/src/agent-originality.js";

const ROOT = resolve(import.meta.dirname, "..");
const AGENTS_DIR = join(ROOT, "agents");
const FAIL = parseFloat(process.env.ORIGINALITY_FAIL ?? String(DEFAULT_FAIL_THRESHOLD));
const WARN = parseFloat(process.env.ORIGINALITY_WARN ?? String(DEFAULT_WARN_THRESHOLD));

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

// ── adapter: merge name + tool entities (ts exposes two extractors) ──
function extractEntities(allContents) {
  // ts extractors take a Map<path, content>; the CLI has an array. Wrap it.
  const map = new Map();
  for (let i = 0; i < allContents.length; i++) map.set(`agent-${i}.md`, allContents[i]);
  return new Set([...extractNameEntities(map), ...extractToolEntities(map)]);
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
    .filter((f) => f.endsWith(".md") && f !== "README.md")
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
