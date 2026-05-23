# Review Report: forge-kiro-style-spec-workflow

**Date**: 2026-05-23
**Spec**: `.forge/specs/forge-kiro-style-spec-workflow/{requirements,design,tasks}.md`（15 个 Requirement / 11 个 Correctness Property / T-01~T-26 + T-04b + T-09.1~6 共 32 个任务）
**Source commits**: `bf188a9`（T-01 起）→ `bb72a5d`（T-01~T-26 综合提交，HEAD），共 26+ feat 提交
**Methodology**: 主 Agent 自检 + sub-agent 静态对照（实现 vs spec），不跑 npm test
**Result**: ❌ **failed — 不符合"完整落地"判定**

---

## 1. 覆盖度总览

| 维度 | 完成度 |
|---|---|
| 类型 / 解析器 / 渲染器（T-01~T-05） | ~80% |
| 单文件纯函数（Analyze / Variant / Brownfield / PBT 派生 / Wave closure） | ~65% |
| **Orchestration**（spec/plan/build/fix entry 串接 + tasks.md 单源 + wave 调度 + 三振） | **~15%** |
| 配置 / 迁移 / ADR / config 字段 | ~25% |
| **可观测性（events.jsonl）** | **0%**（7 类事件全 0 命中） |
| Correctness PBT | ~45%（5/11） |

| 维度 | 数量 |
|---|---|
| Requirements | 完整 5 / 部分 9 / 缺失 1（共 15） |
| Tasks | 完整 18 / 部分 9 / 严重断链 5（共 32） |

**估算实现完整度：~55–60%**。声称的 26+ 提交在数据契约层与单元测试层完成度尚可，但在 orchestration / observability / iron-law-linkage 三个对该需求至关重要的维度上系统性缺失。

---

## 2. Requirement-by-Requirement

| R | 状态 | 主要实现 | 主要测试 | 关键缺漏 |
|---|---|---|---|---|
| R1 三文件结构 | ⚠️ | spec-bundle.ts / spec-bundle-io.ts / spec-parser.ts / spec-render.ts | spec-bundle*.test.ts / spec-parser.test.ts / spec-render.test.ts | R1.4 feature/dir 一致性 P0 自检未做；R1.6 P2 迁移建议日志只返 `migrationHint` 无落盘 |
| R2 变体自动判定 | ⚠️ | spec-variant.ts / spec-variant-override.ts | spec-variant*.test.ts | **`spec_variant_resolved` 事件 0 命中**；`runRequirementsFirst/runDesignFirst/runQuickPlan` 编排函数缺失 |
| R3 Analyze 预检 | ⚠️ | spec-analyze.ts (ANL-01~05) | spec-analyze.test.ts | `.forge/findings/spec-analyze-<feature>.md` 落盘缺；自动推进到 design 路径缺；ANL-01 严重度（设计 P0 vs 实现 P1）不一致 |
| R4 tasks.md 单源 + Wave | ❌ | spec-plan-upgrade.ts / spec-wave.ts | spec-plan-upgrade.test.ts / spec-wave.test.ts | **`src/plan.ts` 没接入 upgradeTasksSeed**；**`src/build.ts` 没接入 parseWaves**；`scheduleWave` 函数不存在；429 降级阶梯（6→3→2→1）不存在；`/forge build <task-id>` skill 文档未提；P1 迁移建议未实现 |
| R5 Refine 自动检测 | ⚠️ | spec-refine.ts | spec-refine.test.ts | mtime 比较用 file mtime 而非 lockedAt；snapshot/diff 局部重生缺，整体清空；`refine_fallback_to_full_regen` 事件 0 命中；未接 spec skill 启动路径 |
| R6 互操作 | ✅ | conflict-classifier.ts / feature-dossier.ts / spec-review-router.ts | conflict-classifier.fixtures.test.ts / feature-dossier.test.ts / spec-review-router.test.ts | — |
| R7 自动迁移与回滚 | ❌ | spec-migration.ts | spec-migration.test.ts | **plans/<topic>.md 迁移完全没实现**；P0 Analyze 兜底回滚没实现；`spec_migration_failed` 事件 0 命中；experimental/enforced 模式分支缺；未接 spec skill 启动路径 |
| R8 单入口原则 | ⚠️ | skills/forge/lib/spec/instructions.md / spec-variant-override.ts | spec-variant-override.test.ts | `.forge/plans/` deprecated 标注缺；ADR 跨 feature 决策提示未机器化 |
| R9 Brownfield | ⚠️ | spec-brownfield.ts | spec-brownfield.test.ts（含 fc Property 8） | **5 项自检只实现 3 项**（Anti-drift 缺，Spec Leak 拆到他处）；`brownfield_mode_inferred` 事件 0 命中；migrateLegacySpec 不识别 Current State / Proposed Change / Reversibility |
| R10 外部 spec 导入 | ⚠️ | spec-import.ts (parseSpecArgs/parseExternalSpec/scoreImportedContent) | spec-import.test.ts | **`runImportMode` 完全未实现（grep 0 命中）**；五项自检 + Analyze 接入缺；`import_source` frontmatter 没有调用方填值；`spec_import_failed` 事件缺 |
| R11 Contract Gate + Spec Leak | ❌ | spec-validation.ts:validateContractGate/detectSpecLeak | spec-validation.test.ts | **`parseRequirementsMarkdown` 不抽取 verifyBy/evidence 字段（grep 0 命中）→ contract gate 必爆 P0**；`detectSpecLeak` 双实现冲突，lenient 未走 `loadBannedPatterns({ scope: "design" })` 派生；`[spec-leak] file:line` 输出格式未实现；与 scripts/check-spec-contract.sh 双轨 |
| R12 EARS 句式约束 | ❌ | spec-validation.ts:enforceEarsSyntax | spec-validation.test.ts | **enforceEarsSyntax 是恒等重写**：`当 ${text} 时 系统应当 ${text}` 第一次必匹配 EARS_FULL，3 次重试为死代码；renderRequirementsMarkdown 不调用 enforceEarsSyntax；`ears_enforcement_exhausted` 事件缺；Property 9 PBT 缺 |
| R13 默认变体兜底 | ⚠️ | spec-variant.ts:resolveSpecVariant(defaultVariant) | spec-variant.test.ts（区间 + auto-tied-fallback） | `.forge/config.md` 不含 `default_workflow_variant`；spec skill 启动时配置 → 函数注入链不存在；`invalid_default_variant_config` 事件缺 |
| R14 Bugfix 三文件 | ⚠️ | spec-bugfix.ts (BFX-01~06) / spec-bugfix-orchestration.ts / SpecKind / isBugfixBundle | spec-bugfix*.test.ts / spec-bundle.test.ts | **`detectSpecKind` 完全未实现（grep src+test 0 命中）**；**`/forge fix` skill 已 deprecated 走 build nature mode，未接 runBugfixOrchestration**；BugfixDesignDocument 三段缺失检查未实现；BFX-04 同 when 不同 shall 误报风险（test 自陈"tricky"）；historical .forge/proposals/<topic>.md 自动迁移缺；Property 10 PBT 缺 |
| R15 Unchanged → PBT + §2.4 | ❌ | spec-pbt-derivation.ts | spec-pbt-derivation.test.ts（含 Property 11 fc PBT） | **`triggerThreeStrikeReroute` / `fail_signature = sha1(...)` / `.forge/debug/<topic>.md` 写入 全部 grep 0 命中**；build.ts 现有 analyzeFixAttempts 是泛型 3 次失败，不基于 fail_signature，不触发 /forge debug；regression-test 失败 → reroute 链路不存在；`verified_by`/`verified_at` 门禁缺；ship 阻断 manual-pending 缺；Refine 不识别 bugfix.md |

---

## 3. Task 验证（按状态分组）

### 完整 (18)

T-01 / T-02 / T-04b / T-09.1 / T-09.2 / T-09.3 / T-09.6 / T-19（函数级）/ T-20 / T-21；以及部分单元覆盖到位的 T-04 / T-05 / T-06 / T-07 / T-09.5 / T-13 / T-17 / T-23（除 design 三段）。

### 部分 (9)

- T-03（缺 feature/dir 一致性自检）
- T-08（仅 spec.md 切分，plans 分支缺）
- T-10（文档到位、调用栈未提）
- T-12（解析器到位、配置缺、ADR 缺）
- 其余几项见 P0/P1 列表。

### 未实现/严重断链 (5)

- **T-09.4 plan 单源接入**：`src/plan.ts` 没接 `upgradeTasksSeed` / `loadSpecBundle`，`/forge plan` 仍按旧路径
- **T-11 / T-26 端到端集成**：`test/e2e/spec-kiro-style.test.ts` 几乎都是纯函数级测试，11.4 / 11.5 / 11.13 / 11.14 / 26.4 / 26.5 / 26.6 / 26.7 等真实 e2e 验收缺
- **T-14 import 模式**：`runImportMode` 缺
- **T-15 contract gate + spec leak**：contract gate 必爆 + leak 双实现 + lenient 派生缺
- **T-16 EARS 强制句式**：`enforceEarsSyntax` 恒等重写 + renderer 未调用
- **T-18 Wave 并行**：`scheduleWave` / 429 / `build.ts` 接入全缺
- **T-22 detectSpecKind**：0 命中
- **T-24 `/forge fix` 接入**：走 build nature mode，与三文件路径无桥接
- **T-25 PBT 派生 + §2.4 联动**：§2.4 联动全缺

---

## 4. Correctness Properties PBT

| # | 状态 | 测试位置 |
|---|---|---|
| P1 Bundle round-trip | ❌ 缺 PBT，仅单一用例 | spec-bundle-io.test.ts |
| P2 Layout 兼容 | ⚠️ 单元有，无 snapshot lock | spec-bundle-io.test.ts |
| P3 Frozen 单调 | ❌ 仅 fixture 表 | conflict-classifier.fixtures.test.ts |
| P4 Analyze 单调 | ❌ 0 fc.assert | — |
| P5 Variant 决定性 | ✅ | spec-variant.test.ts |
| P6 Wave 拓扑无环 | ❌ 缺 | spec-wave.test.ts 仅 closure PBT |
| P7 单任务闭包 | ✅ | spec-wave.test.ts |
| P8 Brownfield 单调 | ✅ | spec-brownfield.test.ts |
| P9 EARS 重写收敛 | ❌（且函数本身恒等映射） | — |
| P10 Bugfix 三段必备 | ❌ 仅单元 | spec-bugfix.test.ts |
| P11 Unchanged → PBT 计数 | ✅ | spec-pbt-derivation.test.ts |

---

## 5. P0 / P1 / P2 差距清单

### P0（阻断功能正确性，必修）

1. **T-22 `detectSpecKind` 未实现**：grep src+test 0 命中，bugfix 三文件入口断链
2. **T-24 `/forge fix` 未接 `runBugfixOrchestration`**：`skills/forge/lib/fix/instructions.md` deprecated 走 build nature mode，三文件 bugfix 流程没有真实入口
3. **T-15 / R11.1 `validateContractGate` 必爆 P0**：`src/spec-parser.ts` 不抽 `verifyBy` / `evidence`，loadSpecBundle → contract gate 永远 fail；与 `scripts/check-spec-contract.sh` + `contract-validator.ts` 双轨
4. **T-16 / R12 `enforceEarsSyntax` 恒等重写**：`当 ${text} 时 系统应当 ${text}` 永远匹配 EARS_FULL；renderer 不调用；3 次重试是死代码
5. **T-25 / R15 §2.4 三振重排联动全缺**：`triggerThreeStrikeReroute` / `fail_signature = sha1(test_name + first_line)` / `.forge/debug/<topic>.md` 写入 全部 grep 0 命中
6. **T-09.4 / R4.2 `/forge plan` 未接入 tasks.md 单源**：`src/plan.ts` 0 命中 `upgradeTasksSeed` / `loadSpecBundle`
7. **T-18 / R4.5 `/forge build` 未接入 wave 并行**：`src/build.ts` 0 命中 `parseWaves`；`scheduleWave` 函数不存在；HTTP 429 降级阶梯（6→3→2→1）不存在
8. **T-14 / R10 `runImportMode` 未实现**：grep 0 命中；五项自检 + Analyze 接入缺；`import_source` 没人填
9. **T-08 / R7.3 `migrateLegacySpec` 不处理 plans/**：源代码 0 命中 plans 处理
10. **T-08 / R7.4 迁移失败无 P0 Analyze 兜底回滚**：失败时新文件不删、spec.md 不还原
11. **T-15 / R11.3 `detectSpecLeak` 双实现 + lenient 未派生**：spec-validation.ts 用 5 条硬编码正则；`loadBannedPatterns({ scope: "design" })` 派生路径不存在；`[spec-leak] file:line` 格式未实现
12. **T-13 / R9.2 Anti-drift 自检缺**：`runBrownfieldSelfChecks` 仅实现 BF-01/02/03

### P1（影响测试覆盖度与可观测性，应修）

13. **7 类事件 grep 全仓 0 命中**：`spec_variant_resolved` / `brownfield_mode_inferred` / `refine_fallback_to_full_regen` / `spec_migration_failed` / `spec_import_failed` / `ears_enforcement_exhausted` / `invalid_default_variant_config`——可观测性彻底丢失
14. **PBT 缺失 6 条**：Property 1 / 3 / 4 / 6 / 9 / 10
15. **T-07 `detectSpecTriggers` 用 file mtime 而非 lockedAt + snapshot 缺**
16. **T-11 / T-26 e2e 大部分纯函数级**：`test/e2e/spec-kiro-style.test.ts` 没 fixture 跑真实 decide→spec→plan→build→ship；11.13 wave 并行 / 11.14 单任务 / 11.5 自动迁移 / 11.4 自动 Refine / 26.4 三振触发 / 26.5 manual 签名 / 26.6 Refine / 26.7 历史迁移 全缺
17. **T-12 `.forge/config.md` 缺 `spec_three_file_layout` + `default_workflow_variant`**：解析器在但配置文件没字段，配置 → resolveSpecVariant 注入链不存在
18. **T-12 ADR `2026-05-23-spec-three-file-layout.md` 未落档**
19. **T-23 / R14.7 BugfixDesignDocument 三段缺失检查未实现**
20. **R1.4 loadSpecBundle 不校验 frontmatter feature/dir 一致性**
21. **R15.4 / R15.7 `verified_by` / `verified_at` 门禁未实现**：类型有字段，无 ship 阻断逻辑
22. **T-15 验收 `scripts/check-spec-contract.sh` 仍读单文件 spec.md**：未改读 requirements.md

### P2（质量改进项）

23. BFX-04 同 when 不同 shall = 冲突 判定过严，test 自陈 "tricky"，可能误报
24. Living-doc generator 直接 regex 解 frontmatter，未走 `loadSpecBundle`
25. EARS 正则副本散在 `spec-bugfix.ts` / `spec-analyze.ts` / `spec-validation.ts`
26. dossier 折叠 实际是 `<br>` 拼接多文件路径，未做 entry-level merge

---

## 6. 总体判定

**不符合需求的"完整覆盖"。**

一句话总结：**单元函数像样，铁律链路没接通**。

具体来说：
- spec 写了"按 wave 串行、wave 内并行调度，并发上限 max_parallel_agents，HTTP 429 触发降级阶梯"——`build.ts` 完全没接。
- spec 写了"§2.4 三振重排联动 → 自动调用 `/forge debug` → 写诊断模板到 `.forge/debug/<topic>.md`"——三个关键函数 grep 0 命中。
- spec 写了"事件流 `spec_variant_resolved` / `brownfield_mode_inferred` / ..."——7 类事件全仓 0 命中。
- spec 写了"`/forge fix` 接入 `runBugfixOrchestration`"——`/forge fix` 仍是 deprecated 走 build nature mode。
- spec 写了"`contract_legacy` 旁路 + lenient design 词典派生"——contract gate 因 parser 不抽字段必爆 P0。
- spec 写了"`enforceEarsSyntax` 重试 3 次后由 ANL-01 兜底"——重写函数本身是恒等映射，3 次重试是死代码。

**Verdict**: ❌ failed — 必须先完成 P0 12 项才能进入 ship 门禁。

---

## 7. 推荐下一步

1. **不要急着合 PR**。建议单独立一个"接线工作"sprint，覆盖 P0 12 项 + P1 中事件流（13）与 e2e 真实 fixture（16）两条。
2. P2 可放后续，不阻断本轮 ship。
3. 接线工作完成后，重跑本评审作为 Round 2。

**门禁结论**：按 §3.3 P0/P1 Must Fix 铁律，存在 P0 → ship 阻断。
