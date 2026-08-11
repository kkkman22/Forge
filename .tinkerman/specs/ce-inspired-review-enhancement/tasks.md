---
feature: ce-inspired-review-enhancement
layout: tasks
created: 2026-06-04
spec_ref: ".tinkerman/specs/ce-inspired-review-enhancement/requirements.md"
---

# Implementation Plan: CE-Inspired Review Enhancement

## Overview

本 spec 分 5 个实施阶段，每个阶段内的任务按依赖关系排序。阶段之间有明确的 gate（验证命令 + contract test）。

**总文件变更**：新增 3 个，修改 8 个，删除 0 个
**预估工时**：Standard tier 约 2–3 天
**风险等级**：中（核心 review 流程变更，但有充分的回滚路径）

---

## Phase 1: 置信度锚定 + Model 分层

基础设施层——为现有 3 个 reviewer 增加 confidence 和 model 声明。

- [ ] 1.1 修改 `.claude/agents/spec-check.md`
  - [ ] 增加 `model: inherit` frontmatter 声明
  - [ ] 在 agent body 增加"Confidence Calibration"章节（5 级锚定指南）
  - [ ] 在 output format 中增加 `confidence` 字段要求
  - [ ] 在 output format 中增加 `autofix_class` 和 `owner` 字段要求
  **Verify-By**: `grep -c "confidence" .claude/agents/spec-check.md` ≥ 5
  **关联需求**: R1, R4

- [ ] 1.2 修改 `.claude/agents/quality-check.md`
  - [ ] 增加 `model: sonnet` frontmatter 声明
  - [ ] 增加"Confidence Calibration"章节（高阈值指南，anchor≤50 默认抑制）
  - [ ] 增加 `confidence` / `autofix_class` / `owner` 字段要求
  **Verify-By**: `grep "model: sonnet" .claude/agents/quality-check.md` 有输出
  **关联需求**: R1, R4

- [ ] 1.3 修改 `.claude/agents/security-check.md`
  - [ ] 增加 `model: inherit` frontmatter 声明
  - [ ] 增加"Confidence Calibration"章节（低阈值指南，P0 at anchor 50 保留）
  - [ ] 增加 `confidence` / `autofix_class` / `owner` 字段要求
  **Verify-By**: `grep "P0.*50" .claude/agents/security-check.md` 有输出（低阈值说明）
  **关联需求**: R1, R4

- [ ] 1.4 修改 `.claude/agents/forge-review.md` 的 merge 阶段
  - [ ] 定义 `Confidence_Anchor` 枚举说明（0, 25, 50, 75, 100）
  - [ ] 实现 confidence gate 逻辑：confidence < 75 抑制，P0@50+ 例外
  - [ ] 在 report format 中增加 `[severity|confidence]` 标签
  - [ ] 为 finding 增加 `suppressed` 和 `suppression_reason` 字段处理
  **Verify-By**: `grep "confidence" .claude/agents/forge-review.md` ≥ 10 处
  **关联需求**: R1.1–R1.7

- [ ] 1.5 Contract test: 验证 agent frontmatter
  - [ ] 断言 `spec-check.md` 含 `model: inherit`
  - [ ] 断言 `quality-check.md` 含 `model: sonnet`
  - [ ] 断言 `security-check.md` 含 `model: inherit`
  - [ ] 断言所有 3 个 agent 含 confidence calibration 章节
  **Verify-By**: `npx vitest run test/contract.test.ts` 绿
  **关联需求**: R1, R4

- [ ] 1.6 在 `.tinkerman/config.md` 增加 review 配置项
  - [ ] `review_force_model`（可选，覆盖所有 reviewer 的 model 设置）
  - [ ] `review_confidence_threshold`（默认 75，可调整）
  - [ ] `review_enable_adversarial`（默认 true）
  - [ ] `review_enable_validation`（默认 true，仅 Full tier）
  **Verify-By**: `grep "review_" .tinkerman/config.md` ≥ 4 处
  **关联需求**: R4.6, R3.6

---

## Phase 2: 跨 Reviewer 协议提升 + 稳定编号

增强 merge 阶段的去重和交叉验证能力。

- [ ] 2.1 在 `forge-review.md` 实现 finding 去重算法
  - [ ] 定义 `normalize(file)` 函数：strip `./`，trim whitespace
  - [ ] 定义 `normalize(title)` 函数：lowercase，strip punctuation，collapse whitespace
  - [ ] 定义 `line_bucket(line, ±3)` 函数：line±3 范围内视为同一位置
  - [ ] 实现去重匹配：`normalize(file) + line_bucket + normalize(title)` 一致则为同一 finding
  **Verify-By**: forge-review.md 中有去重算法描述
  **关联需求**: R2.1, R2.4

- [ ] 2.2 实现 Cross_Reviewer_Promotion
  - [ ] 当 2+ reviewer 报告同一问题，confidence 提升一档（50→75, 75→100）
  - [ ] severity 取最保守值（P0 > P1 > P2 > P3）
  - [ ] 报告中标注 `↑ cross-validated by N reviewers`
  - [ ] 合并所有 reviewer 的 evidence 数组
  **Verify-By**: forge-review.md 中有 cross-reviewer promotion 逻辑
  **关联需求**: R2.2, R2.3, R2.5

- [ ] 2.3 实现稳定 Finding ID
  - [ ] 按 severity 降序 → confidence 降序 → file 字典序 → line 升序排序
  - [ ] 分配 `R-NNN` 格式 ID
  - [ ] re-review 时保留上一轮 ID，新增从 max+1 开始
  **Verify-By**: forge-review.md 中有 stable ID 规则
  **关联需求**: R8.1–R8.5

- [ ] 2.4 修改 report format 模板
  - [ ] 每行显示 `[severity|confidence] R-NNN: title`
  - [ ] cross-validated findings 标注 `↑` 符号
  - [ ] suppressed findings 单独列表（标题行 + suppression reason）
  **Verify-By**: forge-review.md report 模板中包含新格式
  **关联需求**: R1.7, R2.2, R8.1

- [ ] 2.5 手动验证：跑一次 `/forge review`（Full tier）
  - [ ] 确认 report 输出包含 `[severity|confidence]` 标签
  - [ ] 确认 finding 有 `R-NNN` 编号
  - [ ] 确认 confidence gate 过滤了低置信度 finding
  **Verify-By**: `/forge review` 输出符合新格式
  **关联需求**: R1, R2, R8

---

## Phase 3: 对抗性审查 Agent

新增第四层 reviewer。

- [ ] 3.1 创建 `.claude/agents/adversarial-check.md`
  - [ ] frontmatter: `name: adversarial-check`, `model: sonnet`, `tools: Read, Grep, Glob, Bash`
  - [ ] 定义四种审查技术：假设违反、组合失败、级联构造、滥用案例
  - [ ] 定义深度校准规则：Quick(<50行)、Standard(50-199)、Deep(200+)
  - [ ] 定义"不覆盖"范围（与 spec-check / security-check / quality-check 的边界）
  - [ ] 定义 confidence 校准指南（参照 design.md §5）
  - [ ] 定义 output format（JSON with `{reviewer, findings[], residual_risks[], testing_gaps[]}`）
  - [ ] 大部分 finding 默认 `autofix_class: advisory` + `owner: human`
  **Verify-By**: `wc -l .claude/agents/adversarial-check.md` ≥ 80 行
  **关联需求**: R3.1–R3.7

- [ ] 3.2 修改 `forge-review.md` 的 dispatch 阶段
  - [ ] Full tier: adversarial-check 始终启用
  - [ ] Standard tier: diff ≥ 50 lines 或高风险领域时启用
  - [ ] Light tier: 不启用
  - [ ] 高风险领域关键词：auth, payment, data mutation, external API, webhook, migration
  **Verify-By**: forge-review.md dispatch 阶段提及 adversarial-check 的条件
  **关联需求**: R3.6

- [ ] 3.3 修改 `CLAUDE.md` §3.2 Review 表格
  - [ ] 增加 adversarial-check 行：描述、启用条件、model
  **Verify-By**: `grep "adversarial" CLAUDE.md` 有输出
  **关联需求**: R3.1

- [ ] 3.4 Contract test: adversarial-check
  - [ ] 断言 `.claude/agents/adversarial-check.md` 存在
  - [ ] 断言含 `model: sonnet`
  - [ ] 断言含四种技术关键词（assumption, composition, cascade, abuse）
  - [ ] 断言含深度校准规则（Quick, Standard, Deep）
  **Verify-By**: `npx vitest run test/contract.test.ts` 绿
  **关联需求**: R3

- [ ] 3.5 手动验证：跑一次 `/forge review`（Full tier + 50+ line diff）
  - [ ] 确认 adversarial-check 被调度
  - [ ] 确认其 finding 在 report 中出现
  - [ ] 确认 finding 的 autofix_class 多为 advisory
  **Verify-By**: review 输出包含 adversarial findings
  **关联需求**: R3

---

## Phase 4: 独立验证通道 + Autofix 路由

增强 review 的可信度和自动化能力。

- [ ] 4.1 创建 `.claude/agents/validation-pass.md`
  - [ ] frontmatter: `name: validation-pass`, `model: sonnet`, `tools: Read, Grep, Glob`
  - [ ] 定义验证行为：接收 finding 信息但不接收 reviewer identity
  - [ ] 输出 `{confirmed, reason, adjusted_confidence}`
  - [ ] 强调"无承诺效应"——不偏向确认或否定原 finding
  **Verify-By**: `wc -l .claude/agents/validation-pass.md` ≥ 40 行
  **关联需求**: R5.1–R5.7

- [ ] 4.2 在 `forge-review.md` 实现 Validation Pass
  - [ ] merge 阶段后，为每个存活 finding 分配独立 validation sub-agent
  - [ ] validation agent 不接收原 reviewer identity
  - [ ] P0 not confirmed → 降级为 P1
  - [ ] P1 not confirmed → 降级为 P2
  - [ ] 降级标注 `↓ validation: <reason>`
  - [ ] 结果记录到 `.tinkerman/progress/<slug>-review-validation.jsonl`
  **Verify-By**: forge-review.md 中有 validation pass 逻辑
  **关联需求**: R5.1–R5.8

- [ ] 4.3 实现 Validation Pass 的 tier 条件
  - [ ] Full tier: 默认启用
  - [ ] Standard / Light tier: 跳过
  - [ ] 可通过 `--no-validation` flag 手动跳过
  **Verify-By**: forge-review.md 中有 tier 条件判断
  **关联需求**: R5.2

- [ ] 4.4 在 `forge-review.md` 实现 Autofix 路由
  - [ ] 定义四级路由：safe_auto / gated_auto / manual / advisory
  - [ ] autofix 模式：自动应用 safe_auto，逐个确认 gated_auto
  - [ ] autofix 后运行 `ci_check_command` 验证
  - [ ] 验证失败 → git checkout 回滚，报告回滚的 finding
  **Verify-By**: forge-review.md 中有 autofix 路由逻辑
  **关联需求**: R9.1–R9.7

- [ ] 4.5 修改 `skills/forge-review/SKILL.md`
  - [ ] 增加 `--autofix` 参数说明
  - [ ] 增加 `--no-validation` 参数说明
  - [ ] 增加 `--compact-safe` 参数说明
  **Verify-By**: SKILL.md 中包含新参数
  **关联需求**: R9, R5

- [ ] 4.6 Contract test: validation-pass + autofix
  - [ ] 断言 `validation-pass.md` 存在且含 `model: sonnet`
  - [ ] 断言 forge-review.md 包含 validation pass 和 autofix 逻辑描述
  **Verify-By**: `npx vitest run test/contract.test.ts` 绿
  **关联需求**: R5, R9

---

## Phase 5: 双轨知识系统 + 重叠检测 + Compact-Safe

增强 `/forge learn` 和 review 的鲁棒性。

- [ ] 5.1 修改 `skills/forge-learn/SKILL.md` 增加双轨模板
  - [ ] 定义 Bug 轨模板（problem / symptoms / what_didnt_work / solution / why_this_works / prevention）
  - [ ] 定义知识轨模板（context / guidance / why_this_matters / when_to_apply / examples）
  - [ ] 定义轨道自动选择逻辑（debug 触发 → bug 轨，架构决策 → 知识轨，默认 → 知识轨）
  - [ ] 定义 frontmatter 新增字段（`track`, `problem_type`, `changelog`）
  **Verify-By**: SKILL.md 中包含双轨模板和选择逻辑
  **关联需求**: R6.1–R6.5

- [ ] 5.2 实现 Overlap_Detection 逻辑
  - [ ] 定义 5 维度评分：problem_statement / root_cause / solution_approach / referenced_files / prevention_rules
  - [ ] 每维度评级 High / Moderate / Low
  - [ ] 3+ High → 更新现有文档
  - [ ] 1-2 High → 提示用户选择
  - [ ] 0 High → 创建新文档
  - [ ] 知识库满（20 个）时的处理逻辑
  **Verify-By**: SKILL.md 中包含 overlap detection 逻辑
  **关联需求**: R7.1–R7.8

- [ ] 5.3 实现 Compact-Safe Review 模式
  - [ ] 在 `forge-review.md` 增加 context 检测逻辑
  - [ ] 超阈值时：跳过 validation pass + 跳过 quality/adversarial + 简化去重
  - [ ] 报告开头标注 `⚠ Compact-safe mode — partial review`
  **Verify-By**: forge-review.md 中有 compact-safe 逻辑
  **关联需求**: R10.1–R10.4

- [ ] 5.4 创建 `.tinkerman/docs/living/review-confidence-guide.md`
  - [ ] 置信度系统概述
  - [ ] 每个 reviewer 的校准指南摘要
  - [ ] 配置选项说明（threshold / force_model / enable_*）
  - [ ] CE 参考链接
  **Verify-By**: 文件存在且 ≥50 行
  **关联需求**: R1

- [ ] 5.5 Contract test: knowledge system
  - [ ] 断言 forge-learn SKILL.md 包含双轨模板关键词
  - [ ] 断言包含 overlap detection 关键词
  - [ ] 断言 forge-review.md 包含 compact-safe 逻辑
  **Verify-By**: `npx vitest run test/contract.test.ts` 绿
  **关联需求**: R6, R7, R10

- [ ] 5.6 更新 `CLAUDE.md`
  - [ ] §3.2 Review 表格增加 adversarial-check 行
  - [ ] §4 Knowledge 增加 track 和 overlap 字段说明
  - [ ] 确保 CLAUDE.md 行数不增加超过 15 行
  **Verify-By**: `wc -l CLAUDE.md` 增量 ≤ 15
  **关联需求**: R3.3

- [ ] 5.7 最终验证
  - [ ] `npx vitest run` 全部绿
  - [ ] `npm run check` 通过
  - [ ] 手动跑 `/forge review`（Full tier）确认新 pipeline 完整运行
  - [ ] 手动跑 `/forge learn`（bug 场景）确认 Bug 轨模板输出
  - [ ] 手动跑 `/forge learn`（架构场景）确认知识轨模板输出
  **Verify-By**: 所有验证通过
  **关联需求**: All

---

## 任务依赖关系

```
Phase 1 (置信度 + Model 分层)
  1.1 → 1.2 → 1.3 → 1.4 → 1.5 → 1.6
                                    ↓
Phase 2 (跨 Reviewer 提升 + 稳定 ID)
  2.1 → 2.2 → 2.3 → 2.4 → 2.5
                              ↓
Phase 3 (对抗性 Agent)
  3.1 → 3.2 → 3.3 → 3.4 → 3.5
                              ↓
Phase 4 (验证通道 + Autofix)
  4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6
                                     ↓
Phase 5 (知识系统 + Compact-Safe + 文档)
  5.1 → 5.2 → 5.3 → 5.4 → 5.5 → 5.6 → 5.7
```

每个 Phase 内部顺序执行，Phase 之间必须通过 gate 验证才能进入下一个。Phase 3 和 Phase 4 的部分任务（3.1 和 4.1）可以与 Phase 2 并行准备（agent 定义文件是独立的），但 dispatch 集成（3.2）和 validation 集成（4.2）依赖 Phase 2 的 merge 阶段基础设施。
