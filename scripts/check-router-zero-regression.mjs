#!/usr/bin/env node
// category: internal-only
/**
 * check-router-zero-regression.mjs — R1-6 CI guard.
 *
 * Runs classifyTask on ≥20 golden task descriptions (without intent keywords)
 * and compares the output against a baseline snapshot. Any field difference
 * = non-zero exit, ensuring zero-regression when intent signals are added.
 *
 * Exit codes:
 *   0: all outputs match baseline
 *   1: regression detected
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Golden descriptions — no intent keywords, covering diverse scenarios
const GOLDEN_DESCRIPTIONS = [
  { desc: "为用户 API 添加分页功能", signals: { filesAffected: 3, linesChanged: 50, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "backend", projectPhase: "iteration" },
  { desc: "修复登录页面按钮颜色不对", signals: { filesAffected: 1, linesChanged: 5, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "light", taskType: "frontend", projectPhase: "bugfix" },
  { desc: "搭建新的通知系统", signals: { filesAffected: 10, linesChanged: 500, hasExistingSpec: false, hasNewService: true, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: true, hasClearRequirements: false }, tier: "full", taskType: "backend", projectPhase: "greenfield" },
  { desc: "添加用户认证模块", signals: { filesAffected: 5, linesChanged: 200, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: true, isVagueRequirement: false, hasClearRequirements: true }, tier: "full", taskType: "backend", projectPhase: "iteration" },
  { desc: "重构数据管道", signals: { filesAffected: 8, linesChanged: 300, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "data", projectPhase: "refactor" },
  { desc: "更新 README 文档", signals: { filesAffected: 1, linesChanged: 15, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "light", taskType: "docs", projectPhase: "iteration" },
  { desc: "优化数据库查询性能", signals: { filesAffected: 4, linesChanged: 80, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "data", projectPhase: "refactor" },
  { desc: "配置 CI/CD 流水线", signals: { filesAffected: 2, linesChanged: 40, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "infra", projectPhase: "greenfield" },
  { desc: "修复前后端接口不一致问题", signals: { filesAffected: 3, linesChanged: 30, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "fullstack", projectPhase: "bugfix" },
  { desc: "添加单元测试覆盖率报告", signals: { filesAffected: 2, linesChanged: 25, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "light", taskType: "backend", projectPhase: "iteration" },
  { desc: "迁移到新的数据库引擎", signals: { filesAffected: 6, linesChanged: 400, hasExistingSpec: false, hasNewService: false, hasNewDatabase: true, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "full", taskType: "data", projectPhase: "refactor" },
  { desc: "添加暗色模式支持", signals: { filesAffected: 4, linesChanged: 60, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "frontend", projectPhase: "iteration" },
  { desc: "创建新的 API 端点", signals: { filesAffected: 2, linesChanged: 35, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "backend", projectPhase: "iteration" },
  { desc: "修复内存泄漏", signals: { filesAffected: 1, linesChanged: 10, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "light", taskType: "backend", projectPhase: "bugfix" },
  { desc: "优化前端打包体积", signals: { filesAffected: 3, linesChanged: 45, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "frontend", projectPhase: "refactor" },
  { desc: "添加日志中间件", signals: { filesAffected: 2, linesChanged: 20, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "backend", projectPhase: "iteration" },
  { desc: "重写错误处理模块", signals: { filesAffected: 5, linesChanged: 150, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "backend", projectPhase: "refactor" },
  { desc: "添加国际化支持", signals: { filesAffected: 6, linesChanged: 100, hasExistingSpec: true, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "frontend", projectPhase: "iteration" },
  { desc: "配置 Docker 部署", signals: { filesAffected: 3, linesChanged: 55, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "standard", taskType: "infra", projectPhase: "greenfield" },
  { desc: "清理废弃代码", signals: { filesAffected: 4, linesChanged: 15, hasExistingSpec: false, hasNewService: false, hasNewDatabase: false, hasAuthChanges: false, isVagueRequirement: false, hasClearRequirements: true }, tier: "light", taskType: "backend", projectPhase: "refactor" },
];

const SNAPSHOT_PATH = resolve(ROOT, "test/fixtures/router-zero-regression-snapshot.json");

function main() {
  // Dynamic import for ESM module
  const { classifyTask } = await import("../src/router.js");

  // Generate current outputs
  const results = GOLDEN_DESCRIPTIONS.map((g, i) => {
    const result = classifyTask(
      g.signals,
      undefined,
      undefined,
      g.taskType,
      g.projectPhase,
      "feature",
      g.desc,
    );
    return {
      index: i,
      desc: g.desc,
      tier: result.tier,
      reason: result.reason,
      commandSequence: result.commandSequence,
      taskType: result.taskType,
      projectPhase: result.projectPhase,
      work_nature: result.work_nature,
      hintsCount: result.hints.length,
      hintTags: result.hints.map((h) => h.tag),
      assumptionsCount: result.assumptions.length,
    };
  });

  if (!existsSync(SNAPSHOT_PATH)) {
    // First run: generate baseline
    writeFileSync(SNAPSHOT_PATH, JSON.stringify(results, null, 2) + "\n");
    console.log(`📸 Generated baseline snapshot (${results.length} cases)`);
    console.log("   Review and commit the snapshot file.");
    process.exit(0);
  }

  // Compare against baseline
  const baseline = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf-8"));
  let regressions = 0;

  for (let i = 0; i < Math.max(results.length, baseline.length); i++) {
    const cur = results[i];
    const base = baseline[i];
    if (!cur || !base) {
      console.error(`❌ Case count mismatch: current=${results.length}, baseline=${baseline.length}`);
      regressions++;
      continue;
    }

    for (const key of Object.keys(base)) {
      if (JSON.stringify(cur[key]) !== JSON.stringify(base[key])) {
        console.error(`❌ Case ${i} (${cur.desc}): ${key} differs`);
        console.error(`   Expected: ${JSON.stringify(base[key])}`);
        console.error(`   Actual:   ${JSON.stringify(cur[key])}`);
        regressions++;
      }
    }
  }

  if (regressions > 0) {
    console.error(`\n❌ ${regressions} regression(s) detected`);
    process.exit(1);
  }

  console.log(`✅ Zero regression: all ${results.length} golden cases match baseline`);
}

main().catch((e) => {
  console.error("❌ Script error:", e.message);
  process.exit(1);
});
