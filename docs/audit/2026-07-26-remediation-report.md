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
| 9 | P2 | god file 拆分 | ✅ 完成（5 个文件 800-1028→47-262 行） | `a8ca38d1`+ |
| 10 | P3 | scripts execSync→execFileSync | ✅ 完成（审计点名 3 处） | `4627db77` |
| 11 | P3 | known-failures Tauri 清理 | ✅ 完成（4 条 archived） | `9cf6edbc` |
| 12 | P3 | README 7 命令速查 | ✅ 完成 | `9cf6edbc` |

**12/12 项全部完成。** god file 拆分（#9）沿 `plan/`+`learn/`+`accept/`+`context-budget/` 先例完成，5 个文件全部降至 < 500 行，公共 API 零变化。

## 关键验收数据

- **madge 循环依赖**: 11 → **0**（`✔ No circular dependency found!`），门禁 `check-circular-deps.mjs` 白名单清零，任何新环阻断。
- **process.exit 库代码**: `src/index.ts` 可达的库代码 **0 处** process.exit（status-atomic 信号处理器移除，_runtime.run dead code 删除）。
- **vitest env 隔离**: `CLAUDE_PLUGIN_ROOT=/fake npx vitest run` **14/14 全绿**（修复前 13 failed）。
- **check 总耗时**: ~76s（4 组并行，468% CPU），达审计 v3.10 "≤2 分钟" 验收标准。
- **分支数**: 28 → 17（删 13 已合并，保留 8 unmerged + 7 worktree + main）。
- **`npm run check`**: 全绿（27 步等价覆盖，含新 madge 门禁）。

## #9 god file 拆分（已完成，5/5）

5 个 god file 全部沿 `plan/`+`learn/`+`accept/` 先例拆分，建 `foo/` 子目录 + re-export barrel，importer 零改动，公共 API 零变化：

| 文件 | 拆分前→后 | 子模块 | 共享状态处理 |
|------|-----------|--------|-------------|
| context-budget.ts | 797→64 | classification/explore/review/test-output/git/subagent/budget-report | 无（7 独立 serialize/deserialize 对） |
| pua-engine.ts | 811→47 | types/prompt-content/pressure-routing/failure-detection/pressure-prompt | types.ts leaf；pressure-prompt→prompt-content→types |
| ship-gates.ts | 1028→234 | types/review-gate/test-progress-gates/policy-artifact-gate/fallback-ladder/persist | types.ts leaf（GateName/GateResult/ShipGateReport/SkipGateOptions） |
| learn.ts | 831→102 | glossary-writeback/episode-lifecycle/evolution-report（+既有 validation/feedback-analysis） | toIsoDate 置 glossary-writeback，episode-lifecycle peer import |
| accept-driver.ts | 821→188 | artifact(leaf)/ui-runner/delegate-runners/report（+既有 contract-fresh/pyramid/http-probe） | makeArtifact+RunnerContext/Runner → artifact.ts leaf |

**关键经验**：拆分中 ship-gates 首次出现 barrel↔submodule 环（submodule 回 import barrel 的类型）——修复方式是把共享类型提到 `<name>/types.ts` leaf，后续 learn/accept 拆分预先应用此模式（toIsoDate→peer import、makeArtifact→artifact leaf），全程 0 新环。

**硬约束保持**：`src/index.ts` barrel 仍 20/20；`barrel-file.test.ts` 152 value exports 锁定通过；`check-public-api.mjs` 全绿。

## 保持项（未改动，审计 §6）

类型纪律（as any 6 / 空 catch 0）、测试金字塔、writeStatusAtomic 单写入口、知识库台账、6 个钉版本运行时依赖——均维持。
