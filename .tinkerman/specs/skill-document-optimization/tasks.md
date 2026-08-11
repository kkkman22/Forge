---
feature: skill-document-optimization
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/skill-document-optimization/requirements.md"
---

# Implementation Plan: SKILL Document Optimization

## Overview

将 16 个 SKILL 文档从 ~320K 字符压缩至 ≤192K 字符（40% 压缩率），按文件大小降序逐个优化。每个文件应用六种压缩策略的适用子集：Canonical Example、Reference Directive、Failure Mode Table、Restatement 去重、流程图简化、规则蒸馏精简。

每个文件优化后运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts` 验证 contract test 通过。最终运行 `npm run check` 全量验证。

## Tasks

- [x] 1. 优化 forge-build SKILL.md（58K → ≤29K）
  - [x] 1.1 前置检查拒绝输出去冗余（§2）
    - 保留"Spec 未锁定"作为 Canonical Example
    - 将"Plan 未批准"、"目录不完整"、"多项不通过"替换为一行差异描述
    - 保留 Autonomous 模式 JSON 输出（仅一个示例）
    - _Requirements: 1.1_

  - [x] 1.2 分支切换输出去冗余（§2.1）
    - 保留"分支切换"作为 Canonical Example
    - 将"分支创建"、"分支冲突"、"切换失败"替换为一行差异描述
    - _Requirements: 1.2_

  - [x] 1.3 TDD 铁律章节引用化（§4）
    - 将 §4 整体替换为 Reference Directive：`→ 遵循 CLAUDE.md §2.1 TDD 强制`
    - 仅保留 Build 阶段补充内容：Subagent 内 TDD 执行方式、违规处理的 build 特定行为
    - 删除 §4.2-§4.5 的完整展开（Good/Bad 示例、反合理化表格）
    - _Requirements: 2.1_

  - [x] 1.4 执行纪律章节引用化（§6）
    - 将 §6.1（先测试后代码）、§6.3（P5 证据链）、§6.4（不要说应该可以）、§6.5（三次换路）替换为 Reference Directive
    - 保留 §6.0（反漂移护栏）和状态文件保护（build 特有内容）
    - 保留 §6.2（原子提交）的一句话描述 + Plan commit message 引用
    - 保留 §6.6（输出简洁性）的一句话引用
    - _Requirements: 2.2, 2.3_

  - [x] 1.5 Restatement 机制去重（§3.2 + §3.3）
    - §3.2 保留 Restatement 完整定义（计数器、Checkpoint 步骤、摘要格式、异常触发）
    - §3.3 全量路径中的 Restatement 描述替换为：`Restatement 机制与 §3.2 完全相同，阶段二开始时初始化计数器。`
    - 删除 §3.3 中重复的摘要格式和异常触发描述
    - _Requirements: 4.1, 4.2_

  - [x] 1.6 流程图简化（§8）
    - 将完整流程图（~60 行 ASCII art）替换为 ≤15 行编号步骤列表
    - 将失败升级流程图替换为 3 行描述
    - _Requirements: 5.1_

  - [x] 1.7 边界情况精简（§9）
    - 将 6 个边界场景合并为一个表格（场景 | 处理方式），每场景一行
    - 删除重复的输出示例（已在 §2 有 Canonical Example）
    - _Requirements: 5.2_

  - [x] 1.8 失败模式表格化
    - 将 7 个失败模式从三段式展开压缩为表格格式（# | 失败模式 | 错误行为 | 正确做法）
    - 总行数 ≤20 行（含表头）
    - _Requirements: 3.1_

  - [x] 1.9 执行示例精简（§10）
    - 保留示例 1（标准路径执行）的精简版，删除示例 2（连续失败升级，已在 §5 有描述）
    - _Requirements: 1.1_

  - [x] 1.10 上下文预算管理章节精简
    - 保留分类与裁剪策略表格
    - 压缩裁剪执行时机为简短列表
    - 删除 Restatement 预算状态行的重复描述（已在 §3.2 Restatement 中定义）
    - _Requirements: 1.1_

- [x] 2. Checkpoint — 验证 forge-build 优化
  - 运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
  - 确认 forge-build SKILL.md 字符数 ≤29,000
  - 确认 YAML frontmatter 未变
  - _Requirements: 7.2, 8.1, 8.2, 8.3_

- [x] 3. 优化 forge-learn SKILL.md（41K → ≤21K）
  - [x] 3.1 执行质量分析精简（§2）
    - 保留四维度评估表格和分析输出格式
    - 压缩 §2.4（改进信号驱动）为 3 行描述
    - 压缩 §2.5（指标持久化）为表格 + 一个输出示例
    - _Requirements: 1.4_

  - [x] 3.2 规则蒸馏章节精简（§6.5）
    - 保留蒸馏算法伪代码（§6.5.2）
    - 保留阈值条件表格（§6.5.4）和排除过滤器列表（§6.5.5）
    - 压缩 §6.5.3（转换过程）为表格 + 一个示例
    - 压缩 §6.5.6（冲突检测）为 3 行规则
    - 压缩 §6.5.7（容量管理）为 value 公式 + 3 行规则
    - 压缩 §6.5.8（陈旧检测）为 2 行规则
    - 压缩 §6.5.9（提案展示）为一个示例 + 3 行审批规则
    - 压缩 §6.5.10（写入与变更日志）为一个 changelog 示例
    - _Requirements: 6.1, 6.2, 6.3_

  - [x] 3.3 知识文档格式精简（§5）
    - 保留 YAML frontmatter 格式和置信度评分规则表格
    - 压缩知识库分层架构描述为简表
    - 删除正文结构的完整示例（保留字段列表）
    - _Requirements: 1.4_

  - [x] 3.4 知识回流章节精简（§8）
    - 保留三阶段回流表格（Plan/Build/Debug）
    - 压缩每阶段的详细步骤为 2-3 行
    - 删除 Subagent 指令中的完整知识注入示例（保留格式说明）
    - _Requirements: 1.4_

  - [x] 3.5 流程图简化（§9）
    - 将 ~40 行 ASCII 流程图替换为 ≤15 行编号步骤列表
    - _Requirements: 5.3_

  - [x] 3.6 示例去冗余（§11）
    - 保留示例 1（正常知识沉淀）的精简版
    - 将示例 2（高重叠合并）和示例 3（知识库维护）替换为一行描述
    - _Requirements: 1.4_

  - [x] 3.7 任务归档精简（§9.1）
    - 保留归档内容表格和规则列表
    - 删除归档输出示例（格式可从表格推导）
    - _Requirements: 1.4_

- [x] 4. Checkpoint — 验证 forge-learn 优化
  - 运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
  - 确认 forge-learn SKILL.md 字符数 ≤21,000
  - 确认规则蒸馏相关的 contract test 通过（Rule Distillation 标题、四数据源、五阈值）
  - _Requirements: 7.3, 8.1, 8.5_

- [x] 5. 优化 forge-plan SKILL.md（32K → ≤19K）
  - [x] 5.1 输出模板去冗余
    - 每种 Plan 输出格式保留一个 Canonical Example
    - 压缩 Self-Check 清单的详细示例
    - _Requirements: 1.5_

  - [x] 5.2 流程图和示例精简
    - 将流程图替换为编号步骤列表
    - 精简执行示例
    - _Requirements: 5.1_

  - [x] 5.3 重复规则引用化
    - 将与 CLAUDE.md 重复的验证纪律、TDD 相关描述替换为 Reference Directive
    - _Requirements: 2.5_

- [x] 6. Checkpoint — 验证 forge-plan 优化
  - 运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
  - 确认 forge-plan SKILL.md 字符数 ≤19,000
  - _Requirements: 7.5, 8.1, 8.2_

- [x] 7. 优化 forge-review SKILL.md（28K → ≤17K）
  - [x] 7.1 严重度分级引用化（§4）
    - 替换为 Reference Directive：`→ 遵循 CLAUDE.md §3.3`
    - 仅保留评审阶段特有的分级原则（2-3 行）
    - _Requirements: 2.4_

  - [x] 7.2 示例和门禁输出去冗余（§8, §12, §13）
    - §8 门禁输出：保留阻断和放行各一个示例
    - §12 删除与 §8 重复的示例
    - §13 前置检查：保留一个拒绝示例 + 一行变体描述
    - _Requirements: 1.3_

  - [x] 7.3 流程图简化（§10）
    - 将 ~30 行 ASCII 流程图替换为 ≤10 行编号步骤列表
    - _Requirements: 5.4_

  - [x] 7.4 失败模式表格化（§14）
    - 将 4 个失败模式从三段式压缩为表格，总行数 ≤10 行
    - _Requirements: 3.2_

- [x] 8. Checkpoint — 验证 forge-review 优化
  - 运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
  - 确认 forge-review SKILL.md 字符数 ≤17,000
  - _Requirements: 7.4, 8.1, 8.4_

- [x] 9. 优化其余 12 个 SKILL 文档
  - [x] 9.1 forge-loop（21K）— 流程图简化、示例去冗余、重复规则引用化
  - [x] 9.2 forge-router（16K）— 示例去冗余
  - [x] 9.3 forge-refactor（14K）— 模板去冗余、流程图简化
  - [x] 9.4 forge-test（14K）— 重复规则引用化（验证铁律）、示例精简
  - [x] 9.5 forge-decide（14K）— 示例去冗余、流程图简化
  - [x] 9.6 forge-ship（13K）— 模板去冗余
  - [x] 9.7 forge-debug（12K）— 流程图简化、示例精简
  - [x] 9.8 forge-fix（11K）— 模板去冗余
  - [x] 9.9 forge-resume（8K）— 轻微精简
  - [x] 9.10 forge-abort（4K）— 轻微精简（已较小）
  - [x] 9.11 forge-status（3K）— 不优化（已足够小）
  - [x] 9.12 forge-spec（30K）— 模板去冗余、示例精简、流程图简化
  - _Requirements: 1.5, 2.5, 3.3, 5.1_

- [x] 10. Checkpoint — 验证所有 SKILL 优化
  - 运行 `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
  - 确认所有 contract test 通过
  - _Requirements: 7.6, 8.1, 8.2_

- [x] 11. 体积验证与最终检查
  - [x] 11.1 验证总体积目标
    - 运行 `wc -c skills/*/SKILL.md` 确认总字符数 ≤192,000
    - 确认 forge-build ≤29,000、forge-learn ≤21,000、forge-review ≤17,000、forge-plan ≤19,000
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 11.2 行为等价性抽查
    - 确认 forge-build 包含关键行为指令：TDD、Closure-First 探针、原子提交、P5 证据链、三次换路、Subagent 状态协议
    - 确认 forge-review 包含：三层评审、置信度 0.8、去重 ±3 行、跨评审者 +0.10、质量门 6 项
    - 确认 forge-learn 包含：五维度提取、四维度分析、知识库不变量、知识回流、规则蒸馏
    - _Requirements: 8.3, 8.4, 8.5_

  - [x] 11.3 全量 CI 验证
    - 运行 `npm run check` 确认完整 CI 套件通过
    - _Requirements: 7.6_

## Notes

- 优化顺序按文件大小降序，最大收益优先
- 每个大文件优化后有独立 checkpoint，确保增量验证
- 不修改 CLAUDE.md（Constitution immutable）
- 不修改 YAML frontmatter（name、description、disable-model-invocation）
- 不改变行为语义，只改变表达方式（引用化、表格化、去冗余）
- forge-status（3K）已足够小，不需要优化
- Task 9.12 forge-spec 虽然排在"其余 12 个"中，但体积 30K 较大，应重点关注模板去冗余和示例精简
