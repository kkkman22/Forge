---
topic: "forge-slimming-plan"
status: "approved"
date: "2026-05-13"
spec_ref: ".kiro/specs/forge-slimming-plan"
format: "lightweight"
---

# Plan: Forge Slimming Plan

## Objective

三层瘦身：T1 清理冗余文档/归档已交付 spec → T2 委托重叠命令基础层给 Claude Code 官方原语 → T3 Skill 归位 + Pack 条件注册，主包 skill 从 29 降到 ~20。全程不动 `src/` 核心引擎。

## Design Reference Index

| Ref | Section | Summary |
|-----|---------|---------|
| design.md#1 | Native_Command Delegation_Adapter | 版本探测 + 标准路径/遗留路径 + per-session Deprecation_Notice |
| design.md#2 | Pack_Conditional_Skill | 构建时扫描 pack.yaml → 条件注册 forge-mutate |
| design.md#3 | 命令数量单一事实源 | SST=commands/forge.md → {FORGE_COMMAND_COUNT} 占位符 + --verify-count |
| design.md#4 | 归档工作流 | audit-archive-candidates.mjs + shipped/active/ambiguous 三分类 |
| design.md#5 | 评估报告工作流 | Integration_Evaluation_Report 模板 + metrics-recorder.mjs + aggregate-metrics.mjs |
| design.md#6 | 边界澄清机制 | Gate skill "Use when" 契约 + validate-gate-boundary.mjs |
| design.md#7 | 回归保护 | CI smoke matrix + frozen-zone invariants + deps-diff |
| design.md#Correctness Properties | P1-P6 | 6 条 PBT 属性覆盖 |

## File Mapping

### CREATE

| File | Purpose |
|------|---------|
| `skills/shared/native-command-matrix.md` | 命令委托版本矩阵表 |
| `scripts/audit-archive-candidates.mjs` | R3 归档审计判定+执行 |
| `scripts/metrics-recorder.mjs` | R14/R16 使用率 ndjson 采集 |
| `scripts/aggregate-metrics.mjs` | R14/R16 使用率聚合报告 |
| `scripts/validate-gate-boundary.mjs` | R15 gate 边界契约校验 |
| `scripts/check-frozen-zone-invariants.mjs` | R23 frozen-zone 不变量 CI |
| `.tinkerman/audit-keep.md` | R5 显式保留清单 |
| `.tinkerman/decisions/TEMPLATE-integration-evaluation.md` | R14 评估报告模板 |
| `tests/slimming/command-count.pbt.test.ts` | P1 命令数 SST |
| `tests/slimming/archive-classify.pbt.test.ts` | P2 归档分类 |
| `tests/slimming/delegation-adapter.pbt.test.ts` | P3 委托适配器 |
| `tests/slimming/pack-conditional.pbt.test.ts` | P4 Pack 条件注册 |
| `tests/slimming/syntax-compat.pbt.test.ts` | P5 语法兼容 |
| `tests/slimming/archive-structure.pbt.test.ts` | P6 归档结构 |

### MODIFY

| File | Purpose |
|------|---------|
| `skills/forge-recap/SKILL.md` | R6 委托 /compact + /context |
| `skills/forge-resume/SKILL.md` | R7 委托 /resume + Checkpointing |
| `skills/forge-abort/SKILL.md` | R8 精简为归档+重置 |
| `skills/forge-learn/SKILL.md` | R9 去重 Auto_Memory 覆盖 |
| `skills/forge-review/SKILL.md` | R10 --delegate-quality + --delegate-security |
| `skills/forge-accept/SKILL.md` | R15 "Use when" 边界段 |
| `skills/forge-verify/SKILL.md` | R15 "Use when" 边界段 |
| `skills/forge-ship/SKILL.md` | R15 "Use when" 边界段 |
| `skills/forge-mutate/SKILL.md` | R13 pack_conditional frontmatter |
| `scripts/gen-plugin-commands.mjs` | R13 pack 条件过滤逻辑 |
| `commands/forge.md` | R2/R18 子命令表 + forge-mutate 注释 |
| `README.md` | R2/R11/R15/R18 命令数+Loop 定位+Gate 对比 |
| `docs/reference-commands.md` | R2/R18 命令列表同步 |
| `docs/reference-advanced.md` | R11 Forge Loop 定位刷新 |
| `ROADMAP.md` | R4 v2.3 observability 状态同步 |
| `.claude-plugin/plugin.json` | R14 metrics UserPromptSubmit hook |
| `CHANGELOG.md` | 瘦身版本条目 |

## Dependency Graph

```
Sprint 1 (T1):
  T1 → T2 → T3
  T4, T5 independent

Sprint 2 (T2):
  T6 (shared infra) → T7, T8, T9, T10, T11
  T12 (loop docs) independent
  T13 (deprecation mechanism) → depends on T6

Sprint 3 (T3):
  T14 (pack conditional) → T15 (gate boundary)
  T16 (metrics pipeline) independent
  T17+T18 (deferred, blocked 14d on T16)
  T19+T20 (skill count + alignment) depends on T14, T15

PBT + CI:
  T21 (P1+P2+P6) → after T2, T3
  T22 (P3+P5) → after T6
  T23 (P4) → after T14
  T24 (CI) → after all PBT
```

## Task Breakdown

### Sprint 1: T1 — Immediate Cleanup

#### Task 1: R1+R5 — teams/ 验证 + 显式保留清单

- **Goal**: 确认 teams/ 已清理（已验证：目录不存在）；扫描 skills/、docs/、scripts/、.claude/ 残留引用；创建 .tinkerman/audit-keep.md 记录显式保留项
- **Files**: `.tinkerman/audit-keep.md` CREATE, 全仓库 grep 残留引用
- **Design Reference**: design.md 不直接覆盖（T1 零代码层）
- **Property**: N/A
- **Depends On**: (none)
- **Verify**: `grep -r 'teams/' skills/ docs/ scripts/ .claude/ --include='*.md' --include='*.ts' --include='*.mjs' | grep -v 'forge-decide-teams'` 无输出；`.tinkerman/audit-keep.md` 存在且含 forge-decide-teams + forge-loop-signals
- **Commit**: `chore(slimming): verify teams/ cleanup and create audit-keep.md (R1+R5)`

#### Task 2: R2 — 命令数量单一事实源

- **Goal**: 枚举 commands/forge.md 子命令表获取真实数量 N；在 gen-plugin-commands.mjs 新增 --stamp-count 和 --verify-count 子模式；更新 plugin.json.description、marketplace.json.description、README.md、docs/reference-commands.md、docs/quick-start.md 中的命令数声明
- **Files**: `scripts/gen-plugin-commands.mjs` MODIFY, `commands/forge.md` MODIFY (如需), `README.md` MODIFY, `docs/reference-commands.md` MODIFY, `docs/quick-start.md` MODIFY
- **Design Reference**: design.md#3 — 命令数量单一事实源占位符机制 + CI diff 校验
- **Property**: Property 1 (命令数量 SST 一致性)
- **Depends On**: Task 1
- **Verify**: `node scripts/gen-plugin-commands.mjs --verify-count` exit 0
- **Commit**: `feat(slimming): command count single source of truth with --verify-count (R2)`

#### Task 3: R3 — 归档审计脚本 + 执行

- **Goal**: 实现 audit-archive-candidates.mjs 判定 shipped/active/ambiguous；执行审计移动 shipped 项到 .tinkerman/archive/；生成 .tinkerman/archive/.audit-YYYY-MM-DD.md；更新 docs/、README.md、.tinkerman/features/ 交叉引用
- **Files**: `scripts/audit-archive-candidates.mjs` CREATE, `.tinkerman/archive/.audit-2026-05-13.md` CREATE, 交叉引用文件 MODIFY
- **Design Reference**: design.md#4 — 归档工作流（判定逻辑 + 审计日志格式 + 交叉引用更新）
- **Property**: Property 2 (归档分类正确性) + Property 6 (归档保持原目录结构)
- **Depends On**: Task 1
- **Verify**: `node scripts/audit-archive-candidates.mjs --dry-run` 输出审计表；`.tinkerman/archive/.audit-2026-05-13.md` 存在
- **Commit**: `feat(slimming): archive audit script and execute shipped cleanup (R3)`

#### Task 4: R4 — ROADMAP v2.3 observability 状态同步

- **Goal**: 扫描 docs/、README.md、CHANGELOG.md、.tinkerman/features/ 中 v2.3 observability 条目；将 pending 标记更新为 shipped；不修改 ROADMAP.md 本身
- **Files**: 相关文档 MODIFY（扫描后确定）
- **Design Reference**: design.md 不直接覆盖（T1 文档层）
- **Property**: N/A
- **Depends On**: (none)
- **Verify**: `grep -rn '⏳\|待完成\|TODO.*v2.3\|planned.*observability' docs/ README.md CHANGELOG.md .tinkerman/features/` 无匹配
- **Commit**: `docs(slimming): sync v2.3 observability status across documentation (R4)`

### Sprint 2: T2 — Contraction

#### Task 5: R6-R10 共享委托基础设施

- **Goal**: 创建 skills/shared/native-command-matrix.md（命令委托矩阵表+最低版本）；为所有 T2 受影响 skill 提供共享版本探测片段模板
- **Files**: `skills/shared/native-command-matrix.md` CREATE
- **Design Reference**: design.md#1.3 — 版本探测 + 最低版本声明集中管理
- **Property**: Property 3 (Delegation_Adapter 统一行为契约) 的前置条件
- **Depends On**: Sprint 1 complete
- **Verify**: 文件存在且包含所有 5 个受委托命令的矩阵行（recap/resume/abort/learn/review）
- **Commit**: `feat(slimming): native command delegation matrix and shared infrastructure (R6-R10 prep)`

#### Task 6: R6 — forge-recap 委托 /compact + /context

- **Goal**: SKILL.md 添加 Delegation_Adapter 流程：探测 Claude Code 版本 → 调用 /compact 然后 /context → 附加 Forge 结构化摘要（Spec 阶段、frozen file 列表、未完成 progress 项）；低版本 fallback + per-session Deprecation_Notice
- **Files**: `skills/forge-recap/SKILL.md` MODIFY
- **Design Reference**: design.md#1.2 — Delegation_Adapter 流程图 + design.md#1.5 — Deprecation_Notice 去重
- **Property**: Property 3 (路径选择确定性 + Notice 去重)
- **Depends On**: Task 5
- **Verify**: SKILL.md 包含 "Delegation_Adapter" 段 + "Native_Command: /compact + /context" + Deprecation_Notice 流程
- **Commit**: `feat(slimming): delegate forge-recap base to /compact + /context (R6)`

#### Task 7: R7 — forge-resume 委托 /resume + Checkpointing

- **Goal**: SKILL.md 添加委托流程：调用 /resume 恢复会话 → Five_Question_Recovery prompt 作为差异化上层；保留 --from-pr 完整行为不变；低版本 fallback + Deprecation_Notice
- **Files**: `skills/forge-resume/SKILL.md` MODIFY
- **Design Reference**: design.md#1.2 + R7 Acceptance Criteria
- **Property**: Property 3
- **Depends On**: Task 5
- **Verify**: SKILL.md 含 "Native_Command: /resume" + "Five_Question_Recovery: unchanged" + "--from-pr: preserved"
- **Commit**: `feat(slimming): delegate forge-resume base to /resume + Checkpointing (R7)`

#### Task 8: R8 — forge-abort 精简为归档 + 重置

- **Goal**: SKILL.md 重写：仅保留 (a) 归档 status.md 到 .tinkerman/archive/ (b) 重置 Forge-local 工作状态；删除会话级 abort 逻辑；保留 Forge Loop worktree 清理不动；Deprecation_Notice
- **Files**: `skills/forge-abort/SKILL.md` MODIFY
- **Design Reference**: design.md#1.2 + R8 Acceptance Criteria
- **Property**: Property 3
- **Depends On**: Task 5
- **Verify**: SKILL.md 职责段仅含归档+重置两项；无会话级 abort 描述
- **Commit**: `feat(slimming): narrow forge-abort to archive + reset only (R8)`

#### Task 9: R9 — forge-learn 去重 Auto_Memory

- **Goal**: SKILL.md 重写内容分类：移除 Auto_Memory 已覆盖的类别（build commands、debugging notes、routine repl）；保留跨项目 ADR、五维度结构化沉淀、--from-chats；低版本 fallback
- **Files**: `skills/forge-learn/SKILL.md` MODIFY
- **Design Reference**: design.md#1.2 + R9 Acceptance Criteria
- **Property**: Property 3
- **Depends On**: Task 5
- **Verify**: SKILL.md 含 "Auto_Memory boundary" 段 + "retained categories" 不含 build commands / debugging notes
- **Commit**: `feat(slimming): deduplicate forge-learn with Auto_Memory boundary (R9)`

#### Task 10: R10 — forge-review 可选委托安全/质量层

- **Goal**: SKILL.md 添加 --delegate-quality 和 --delegate-security flags（默认 auto-detect）；委托成功后合并 findings + source tagging；Spec_Alignment_Review 始终运行；输出 schema 扩展 sources[] + merged_summary
- **Files**: `skills/forge-review/SKILL.md` MODIFY
- **Design Reference**: design.md#1.6 — Spec_Alignment_Review 在 delegated findings 之上的合并 + design.md#1.2
- **Property**: Property 3 (Review 合并 source tag) + Property 5 (schema backward compat)
- **Depends On**: Task 5
- **Verify**: SKILL.md 含 "--delegate-quality" + "--delegate-security" + "source tagging" + "Spec_Alignment_Review: always" + schema 示例
- **Commit**: `feat(slimming): add --delegate-quality/security flags to forge-review (R10)`

#### Task 11: R11 — Forge Loop 文档定位刷新

- **Goal**: README.md、docs/reference-advanced.md、ROADMAP.md、forge-loop npm README 中将 "autonomous execution" 改为 "autonomous execution with engineering discipline"；添加与 /goal 和 /loop 的对比段（Git 事务、熔断器、质量门禁、Spec 对齐）
- **Files**: `README.md` MODIFY, `docs/reference-advanced.md` MODIFY, `ROADMAP.md` MODIFY
- **Design Reference**: design.md 不直接覆盖（T2 文档层）+ R11 Acceptance Criteria
- **Property**: N/A
- **Depends On**: (none, 可与 Task 5-10 并行)
- **Verify**: `grep -n 'autonomous execution' README.md docs/reference-advanced.md` 输出都含 "with engineering discipline"
- **Commit**: `docs(slimming): reposition Forge Loop with engineering discipline qualifier (R11)`

#### Task 12: R12 — 向后兼容 + Deprecation_Notice 机制

- **Goal**: 实现 per-session Deprecation_Notice 去重机制（.tinkerman/.deprecation-notice/<sid>/<cmd>.lock）；验证 /forge control-cli 和 /forge control-ui 行为不变；确保所有 T2 命令在低版本 fallback 到遗留行为
- **Files**: Deprecation_Notice 实现（SKILL.md 内 Bash 片段或 scripts/ helper）
- **Design Reference**: design.md#1.5 — 一次性 Deprecation_Notice 去重方案
- **Property**: Property 3 (Notice per-session 去重) + Property 5 (语法向后兼容)
- **Depends On**: Task 5
- **Verify**: SKILL.md 中每个 T2 命令都含 fallback 路径描述 + Deprecation_Notice 流程
- **Commit**: `feat(slimming): per-session deprecation notice mechanism + backward compat (R12)`

### Sprint 3: T3 — Skill Relocation

#### Task 13: R13 — Pack 条件注册机制

- **Goal**: gen-plugin-commands.mjs 新增 filterConditionalSkills 逻辑：读取 packs/*/pack.yaml 的 feature_flags → 检查 SKILL.md frontmatter 的 pack_conditional.required_flag → 条件注册；forge-mutate SKILL.md 添加 pack_conditional frontmatter；运行时短路检查；.tinkerman/audit/pack-conditional-skipped.log 审计
- **Files**: `scripts/gen-plugin-commands.mjs` MODIFY, `skills/forge-mutate/SKILL.md` MODIFY, `commands/forge.md` MODIFY (forge-mutate 条件注释)
- **Design Reference**: design.md#2 — Pack_Conditional_Skill 注册数据流 + design.md#2.5 SKILL.md frontmatter 新字段
- **Property**: Property 4 (Pack_Conditional_Skill 注册单调一致性)
- **Depends On**: Task 2 (命令数 SST)
- **Verify**: `node scripts/gen-plugin-commands.mjs` 在无 pack 启用时 forge-mutate 不出现在 commands/；启用 pms pack 时出现
- **Commit**: `feat(slimming): pack-conditional skill registration for forge-mutate (R13)`

#### Task 14: R15 — Gate skill 边界澄清

- **Goal**: forge-accept/verify/ship SKILL.md 各添加 "Use when ..." 首段；README.md 添加 Gate Skills 对比表（触发时机、主要责任、典型输出、下游接续）；三段 "Use when" 互斥且编辑距离足够
- **Files**: `skills/forge-accept/SKILL.md` MODIFY, `skills/forge-verify/SKILL.md` MODIFY, `skills/forge-ship/SKILL.md` MODIFY, `README.md` MODIFY
- **Design Reference**: design.md#6 — "Use when..." 唯一性契约 + README 对比表结构
- **Property**: N/A (契约测试在 Task 15)
- **Depends On**: (none)
- **Verify**: 三个 SKILL.md 首段含 "Use when" 且描述互不重叠
- **Commit**: `docs(slimming): clarify gate skill boundaries with Use-when paragraphs (R15)`

#### Task 15: R15b — Gate 边界契约校验脚本

- **Goal**: 实现 validate-gate-boundary.mjs：读取三个 gate skill SKILL.md → 提取首段 → 断言存在性 + Jaccard similarity < 0.5 + 触发时机关键词互斥
- **Files**: `scripts/validate-gate-boundary.mjs` CREATE
- **Design Reference**: design.md#6.2 — 契约测试逻辑
- **Property**: N/A
- **Depends On**: Task 14
- **Verify**: `node scripts/validate-gate-boundary.mjs` exit 0
- **Commit**: `feat(slimming): gate boundary contract validator script (R15b)`

#### Task 16: R14/R16 — 使用率度量管线

- **Goal**: 实现 metrics-recorder.mjs（UserPromptSubmit hook 调用，写 .tinkerman/.metrics/<YYYY-MM>.ndjson）；aggregate-metrics.mjs（--window 14d 生成聚合报告）；.claude-plugin/plugin.json 添加 metrics UserPromptSubmit hook；创建评估报告模板 TEMPLATE-integration-evaluation.md
- **Files**: `scripts/metrics-recorder.mjs` CREATE, `scripts/aggregate-metrics.mjs` CREATE, `.claude-plugin/plugin.json` MODIFY, `.tinkerman/decisions/TEMPLATE-integration-evaluation.md` CREATE
- **Design Reference**: design.md#5 — Usage_Metrics 采集管线 + 评估报告模板
- **Property**: N/A (metrics 本身不直接对应 PBT)
- **Depends On**: (none, 可与 Sprint 2 并行)
- **Verify**: `echo '{"ts":"2026-05-13T10:00:00Z","skill":"forge-grill","source":"manual"}' | node scripts/metrics-recorder.mjs` 写入 ndjson；`node scripts/aggregate-metrics.mjs --window 14d` 输出报告
- **Commit**: `feat(slimming): usage metrics pipeline and evaluation report template (R14/R16 prep)`

#### Task 17: [BLOCKED 14d] R14 — forge-maintenance 合并评估报告

- **Goal**: 14 天 metrics 窗口闭合后，基于 aggregate-metrics.mjs 输出生成 forge-refactor/fix/fix-conflicts 合并评估报告；go/no-go 决策
- **Files**: `.tinkerman/decisions/<ISO-date>-forge-maintenance-evaluation.md` CREATE
- **Design Reference**: design.md#5.1 + design.md#5.3
- **Property**: N/A
- **Depends On**: Task 16 + 14 天度量窗口
- **Verify**: 报告存在且含 go/no-go 决策
- **Commit**: `docs(slimming): forge-maintenance merge evaluation report (R14)`

#### Task 18: [BLOCKED 14d] R16 — grill/zoom-out 使用率评估报告

- **Goal**: 14 天 metrics 窗口闭合后，基于数据生成 grill/zoom-out 使用率评估；决定 keep standalone 或 merge
- **Files**: `.tinkerman/decisions/<ISO-date>-grill-zoomout-usage.md` CREATE
- **Design Reference**: design.md#5.3
- **Property**: N/A
- **Depends On**: Task 16 + 14 天度量窗口
- **Verify**: 报告存在且含 keep/merge 决策
- **Commit**: `docs(slimming): grill/zoom-out usage evaluation report (R16)`

#### Task 19: R17+R18 — Skill 数量目标 + 文档对齐

- **Goal**: 验证主包 skill 数量落在 18-22 范围；更新 plugin.json.description、marketplace.json.description、README.md、docs/reference-commands.md、docs/quick-start.md 的命令集和数量；gen-plugin-commands.mjs --verify-count 通过；CHANGELOG 条目
- **Files**: `README.md` MODIFY, `docs/reference-commands.md` MODIFY, `docs/quick-start.md` MODIFY, `CHANGELOG.md` MODIFY, `commands/forge.md` MODIFY
- **Design Reference**: design.md#3 — 命令数量 SST + design.md#2.6 三种分发通道处理
- **Property**: Property 1 (命令数量一致性) + Property 5 (schema compat)
- **Depends On**: Task 13, Task 14, [Task 17, Task 18 的决策结果]
- **Verify**: `node scripts/gen-plugin-commands.mjs --verify-count` exit 0；`ls skills/forge-*/SKILL.md | wc -l` 在 18-22 范围
- **Commit**: `feat(slimming): skill count target verification and doc alignment (R17+R18)`

### Verification: PBT + CI

#### Task 20: P1+P2+P6 — 命令数 SST + 归档分类 + 归档结构 PBT

- **Goal**: 实现 3 个 PBT 测试文件：command-count.pbt.test.ts (随机生成子命令表 → stamp → 解析比对)；archive-classify.pbt.test.ts (随机 evidence 四元组 → classify 输出 + audit round-trip)；archive-structure.pbt.test.ts (随机目录树 → archive → 递归对比)
- **Files**: `tests/slimming/command-count.pbt.test.ts` CREATE, `tests/slimming/archive-classify.pbt.test.ts` CREATE, `tests/slimming/archive-structure.pbt.test.ts` CREATE
- **Design Reference**: design.md#Correctness Properties — Property 1, Property 2, Property 6
- **Property**: P1, P2, P6
- **Depends On**: Task 2, Task 3
- **Verify**: `npx vitest run tests/slimming/command-count tests/slimming/archive-classify tests/slimming/archive-structure` 全部通过
- **Commit**: `test(slimming): PBT for command count SST, archive classify, archive structure (P1+P2+P6)`

#### Task 21: P3+P5 — 委托适配器 + 语法兼容 PBT

- **Goal**: delegation-adapter.pbt.test.ts (随机 command×version×session-sequence×exit-code → 断言 5 个子不变量)；syntax-compat.pbt.test.ts (随机 pre-slimming 合法调用 → post-slimming 接受；review data → pre-slimming schema 可解析)
- **Files**: `tests/slimming/delegation-adapter.pbt.test.ts` CREATE, `tests/slimming/syntax-compat.pbt.test.ts` CREATE
- **Design Reference**: design.md#Correctness Properties — Property 3, Property 5
- **Property**: P3, P5
- **Depends On**: Task 5, Task 12
- **Verify**: `npx vitest run tests/slimming/delegation-adapter tests/slimming/syntax-compat` 全部通过
- **Commit**: `test(slimming): PBT for delegation adapter and syntax compat (P3+P5)`

#### Task 22: P4 — Pack 条件注册 PBT

- **Goal**: pack-conditional.pbt.test.ts (随机 pack 集合 P + skill frontmatter K → shouldRegister 三处输出一致)
- **Files**: `tests/slimming/pack-conditional.pbt.test.ts` CREATE
- **Design Reference**: design.md#Correctness Properties — Property 4
- **Property**: P4
- **Depends On**: Task 13
- **Verify**: `npx vitest run tests/slimming/pack-conditional` 通过
- **Commit**: `test(slimming): PBT for pack conditional registration (P4)`

#### Task 23: CI 回归保护扩展

- **Goal**: 扩展 CI：(1) smoke-channels.yml 三通道 matrix (channel × pack)；(2) check-frozen-zone-invariants.mjs (src/ 零 diff 验证)；(3) deps-diff job (dependencies 零新增)；(4) gen-plugin-commands --verify-count 在 CI 中调用
- **Files**: `.github/workflows/ci.yml` MODIFY, `scripts/check-frozen-zone-invariants.mjs` CREATE
- **Design Reference**: design.md#7 — 回归保护（CI smoke + frozen-zone + deps-diff）
- **Property**: N/A
- **Depends On**: Task 20, Task 21, Task 22
- **Verify**: CI workflow 语法合法（`actionlint` 或等效验证）
- **Commit**: `ci(slimming): extend CI with smoke matrix, frozen-zone, deps-diff (R19-R24)`

## Spec Coverage

| Requirement | Covering Tasks | Notes |
|-------------|---------------|-------|
| R1 | Task 1 | teams/ 已清理，验证+日志 |
| R2 | Task 2, Task 20 (P1) | 命令数 SST + PBT |
| R3 | Task 3, Task 20 (P2+P6) | 归档脚本+执行+PBT |
| R4 | Task 4 | 文档状态同步 |
| R5 | Task 1 | 显式保留清单 |
| R6 | Task 6 | forge-recap 委托 |
| R7 | Task 7 | forge-resume 委托 |
| R8 | Task 8 | forge-abort 精简 |
| R9 | Task 9 | forge-learn 去重 |
| R10 | Task 10 | forge-review 委托 |
| R11 | Task 11 | Loop 文档定位 |
| R12 | Task 12 | 向后兼容+Deprecation |
| R13 | Task 13 | Pack 条件注册 |
| R14 | Task 16 (pipeline), Task 17 (evaluation, BLOCKED) | 评估报告需 14 天窗口 |
| R15 | Task 14, Task 15 | Gate 边界+校验脚本 |
| R16 | Task 16 (pipeline), Task 18 (evaluation, BLOCKED) | 评估报告需 14 天窗口 |
| R17 | Task 19 | Skill 数量目标 |
| R18 | Task 19 | 文档对齐 |
| R19 | Task 12, Task 21 (P5) | 向后兼容贯穿 T2 |
| R20 | Task 23 | 三通道 CI smoke |
| R21 | Task 23 (frozen-zone CI) | src/ 零 diff 验证 |
| R22 | Task 20-22 | 6 条 PBT 属性覆盖 |
| R23 | Task 23 (frozen-zone invariants) | 不变量检查脚本 |
| R24 | Task 23 (deps-diff) | 依赖 diff CI job |
| R25 | 全 plan | 边界约束，非独立任务 |
