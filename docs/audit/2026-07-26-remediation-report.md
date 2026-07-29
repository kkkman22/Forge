---
title: 2026-07-26 审计整改完成报告
category: reference
audience:
- maintainer
updated: 2026-07-29
owner: forge-maintainers
---

# 2026-07-26 审计整改完成报告

> 整改分支: `forge/audit-2026-07-26-remediation` | 基线: `origin/main` @ `69261fc5`
> 对应审计: [2026-07-26-project-audit-and-roadmap.md](./2026-07-26-project-audit-and-roadmap.md)

## 完成状态总览

| # | 级别 | 行动 | 状态 | 提交 |
|---|------|------|------|------|
| 1 | P1 | vitest env CLAUDE_PLUGIN_ROOT 隔离 | ✅ 完成 | `e56b8248` |
| 2 | P1 | madge --circular 门禁 + 破环 | ✅ 完成（11→0 环） | `7afb3bf9` |
| 3 | P1 | src/ process.exit 收敛 | ✅ 完成 | `f2ae84b4` |
| 4 | P2 | CI push `branches:[main]` | ✅ 已存在（批前完成） | — |
| 5 | P2 | check 并行 runner | ✅ 完成（27 步串行→4 组并行） | `9cdc1907` |
| 6 | P2 | docs/api gh-pages 发布 | ✅ 完成 | `abcea40c` |
| 7 | P2 | README.en.md + 双语策略 | ✅ 完成 | `57922dae` |
| 8 | P2 | 分支/worktree 扫除 | ✅ 完成（28→17 分支） | `61df1bb5` |
| 9 | P2 | god file 拆分 | ⏳ 边界就绪，独立紧随 PR | — |
| 10 | P3 | scripts execSync→execFileSync | ✅ 完成（审计点名 3 处） | `4627db77` |
| 11 | P3 | known-failures Tauri 清理 | ✅ 完成（4 条 archived） | `9cf6edbc` |
| 12 | P3 | README 7 命令速查 | ✅ 完成 | `9cf6edbc` |

**11/12 项完成。仅 god file 拆分（#9）作为独立紧随 PR**——拆分边界分析已完成（见下文），因属纯结构性重构且审计 roadmap 自身将其归入 v3.11，独立 PR 风险隔离更佳。

## 关键验收数据

- **madge 循环依赖**: 11 → **0**（`✔ No circular dependency found!`），门禁 `check-circular-deps.mjs` 白名单清零，任何新环阻断。
- **process.exit 库代码**: `src/index.ts` 可达的库代码 **0 处** process.exit（status-atomic 信号处理器移除，_runtime.run dead code 删除）。
- **vitest env 隔离**: `CLAUDE_PLUGIN_ROOT=/fake npx vitest run` **14/14 全绿**（修复前 13 failed）。
- **check 总耗时**: ~76s（4 组并行，468% CPU），达审计 v3.10 "≤2 分钟" 验收标准。
- **分支数**: 28 → 17（删 13 已合并，保留 8 unmerged + 7 worktree + main）。
- **`npm run check`**: 全绿（27 步等价覆盖，含新 madge 门禁）。

## #9 god file 拆分边界（就绪，紧随 PR）

精确拆分边界已完成分析（执行顺序按风险升序）：

| 文件 | 行数 | 子模块 | 留原文件 | 共享状态 | 风险 |
|------|------|--------|---------|---------|------|
| context-budget.ts | 797→~60 | classification/explore/review/test-output/git/subagent/budget-report | re-export barrel | 无（7 独立对） | 极低 |
| pua-engine.ts | 811→~50 | types/prompt-content/pressure-routing/failure-detection/pressure-prompt | re-export barrel | 顺序: types→content→其余 | 低（不在 barrel） |
| ship-gates.ts | 1028→~120 | review-gate/test-progress-gates/policy-artifact-gate/fallback-ladder/persist | types+runAllGates | runAllGates 回 import 4 gates | 低 |
| learn.ts | 831→~90 | glossary-writeback/episode-lifecycle/evolution-report | re-export preamble | toIsoDate 跨簇（peer import） | 中 |
| accept-driver.ts | 821→~150 | ui-runner/delegate-runners/report(+shared artifact) | RunnerContext/RUNNERS/runScenario | makeArtifact→shared artifact.ts | 中 |

**硬约束**: `src/index.ts` barrel 在 20/20（不可加新 export 行）；`barrel-file.test.ts` 锁定 152 value exports（re-export 保持）。模式：建 `foo/` 子目录，foo.ts 变 re-export barrel，importer 零改动（precedent: PR #141 plan.ts 拆分、P3-1 accept-driver 部分拆分）。

## 保持项（未改动，审计 §6）

类型纪律（as any 6 / 空 catch 0）、测试金字塔、writeStatusAtomic 单写入口、知识库台账、6 个钉版本运行时依赖——均维持。
