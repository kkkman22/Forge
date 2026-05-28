---
topic: "skill-document-optimization"
status: "approved"
date: "2026-04-29"
spec_ref: ".kiro/specs/skill-document-optimization"
format: "lightweight"
---

## Objective

将 16 个 SKILL 文档从 ~320K 字符压缩至 ≤192K（40% 压缩率），通过六种策略实现：Canonical Example、Reference Directive、Failure Mode Table、Restatement 去重、流程图简化、规则蒸馏精简。不改变任何行为语义，所有 contract test 必须继续通过。

## Research Findings

### 来自知识库

- 令知识库为空，跳过历史经验搜索。与文档压缩无直接相关。

### 来自执行指标

- 历史 Plan 偏差率：高（>1.5）— 建议预估时间 ×1.5
- vitest 成功率 100%，biome 83%（均正常）

### 来自代码库分析

- 16 个 SKILL 目录，总计 319,831 字符
- Contract tests 分布：
  - `test/contract.test.ts` — 12 个固定 skill 目录检查 + forge-learn 规则蒸馏专项（四数据源 + 五阈值）
  - `test/contract.skills.test.ts` — 动态发现所有 skill 目录，检查 frontmatter（name, description）、## 标题、概述章节
- Contract 断言关键约束：
  - 每个 SKILL.md 必须有 `---` YAML frontmatter，含 `name` 和 `description`
  - 除 forge-router 外必须有 `disable-model-invocation: true`
  - 正文必须有 `##` 标题和概述/Instructions 章节
  - forge-learn 必须包含 Rule Distillation/规则蒸馏、四数据源引用、五阈值条件
- forge-loop、forge-refactor、forge-fix 不在 contract.test.ts 固定列表中，但在 contract.skills.test.ts 动态检查中

### 当前 SKILL 体积（降序）

| SKILL | 当前字符 | 目标 |
|-------|---------|------|
| forge-build | 58,409 | ≤29,000 |
| forge-learn | 41,218 | ≤21,000 |
| forge-plan | 32,172 | ≤19,000 |
| forge-spec | 29,882 | — |
| forge-review | 28,497 | ≤17,000 |
| forge-loop | 20,995 | — |
| forge-router | 16,219 | — |
| forge-refactor | 14,369 | — |
| forge-test | 13,835 | — |
| forge-decide | 13,797 | — |
| forge-ship | 12,912 | — |
| forge-debug | 12,385 | — |
| forge-fix | 11,108 | — |
| forge-resume | 7,654 | — |
| forge-abort | 3,594 | — |
| forge-status | 2,785 | — |
| **总计** | **319,831** | **≤192,000** |

## Design Reference Index

| Anchor | Summary |
|--------|---------|
| `design.md#strategy-1` | Canonical Example — 每种输出格式保留一个完整示例 |
| `design.md#strategy-2` | Reference Directive — CLAUDE.md 已有规则用引用替代重述 |
| `design.md#strategy-3` | Failure Mode Table — 三段式压缩为表格 |
| `design.md#strategy-4` | Restatement 去重 — §3.2 保留完整定义，§3.3 引用 |
| `design.md#strategy-5` | 流程图简化 — ASCII art 替换为编号步骤列表 |
| `design.md#strategy-6` | forge-learn 规则蒸馏精简 |
| `design.md#预估压缩效果` | 各 SKILL 压缩目标与策略映射 |
| `design.md#contract-test-兼容性` | 五项 contract test 断言清单 |

## File Mapping

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `skills/forge-build/SKILL.md` | MODIFY | TDD 引用化、Restatement 去重、模板去冗余、流程图简化、失败模式表格化 |
| `skills/forge-learn/SKILL.md` | MODIFY | 规则蒸馏精简、示例去冗余、流程图简化 |
| `skills/forge-plan/SKILL.md` | MODIFY | 模板去冗余、示例精简 |
| `skills/forge-review/SKILL.md` | MODIFY | 严重度引用化、示例去冗余、失败模式表格化、流程图简化 |
| `skills/forge-spec/SKILL.md` | MODIFY | 模板去冗余、示例精简、流程图简化 |
| `skills/forge-loop/SKILL.md` | MODIFY | 流程图简化、示例去冗余、重复规则引用化 |
| `skills/forge-router/SKILL.md` | MODIFY | 示例去冗余 |
| `skills/forge-refactor/SKILL.md` | MODIFY | 模板去冗余、流程图简化 |
| `skills/forge-test/SKILL.md` | MODIFY | 重复规则引用化（验证铁律）、示例精简 |
| `skills/forge-decide/SKILL.md` | MODIFY | 示例去冗余、流程图简化 |
| `skills/forge-ship/SKILL.md` | MODIFY | 模板去冗余 |
| `skills/forge-debug/SKILL.md` | MODIFY | 流程图简化、示例精简 |
| `skills/forge-fix/SKILL.md` | MODIFY | 模板去冗余 |
| `skills/forge-resume/SKILL.md` | MODIFY | 轻微精简 |
| `skills/forge-abort/SKILL.md` | MODIFY | 轻微精简 |

## Task Breakdown

### Task 1: 优化 forge-build SKILL.md（58K → ≤29K）

- **Goal**: 应用全部六种压缩策略，将最大的 SKILL 文档压缩 50%
- **File**: `skills/forge-build/SKILL.md`
- **Design Reference**: `design.md#预估压缩效果` — forge-build 是最大收益来源，TDD 引用化 + Restatement 去重 + 模板去冗余 + 流程图简化 + 失败模式表格化
- **Sub-tasks**:
  1. §2 前置检查拒绝输出去冗余（4 示例 → 1 + 3 行描述）
  2. §2.1 分支切换输出去冗余（4 示例 → 1 + 3 行描述）
  3. §4 TDD 铁律引用化（→ 遵循 CLAUDE.md §2.1，保留 Subagent TDD 补充）
  4. §6 执行纪律引用化（→ 遵循 CLAUDE.md §2.2-§2.4，保留 build 特有内容）
  5. §3.2 + §3.3 Restatement 去重（§3.2 完整，§3.3 引用）
  6. §8 流程图简化（~60 行 ASCII → ≤15 行步骤列表）
  7. §9 边界情况表格化
  8. 失败模式表格化（7 模式 → 表格 ≤20 行）
  9. §10 执行示例精简
  10. 上下文预算管理章节精简
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-build/SKILL.md`
- **Commit**: `docs(build): compress SKILL.md from 58K to ≤29K`

### Task 2: Checkpoint — 验证 forge-build 优化

- **Goal**: 确认 contract test 通过且字符数达标
- **File**: (无文件变更)
- **Design Reference**: `design.md#contract-test-兼容性` — frontmatter、disable-model-invocation、章节结构、概述/指令章节
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-build/SKILL.md | awk '$1 > 29000 {print "FAIL: " $1; exit 1} {print "PASS: " $1}'`
- **Commit**: (无提交，验证点)

### Task 3: 优化 forge-learn SKILL.md（41K → ≤21K）

- **Goal**: 压缩规则蒸馏章节和示例，达到 50% 压缩
- **File**: `skills/forge-learn/SKILL.md`
- **Design Reference**: `design.md#strategy-6` — 保留蒸馏算法伪代码、阈值表格、排除过滤器，压缩其余子章节
- **Sub-tasks**:
  1. §2 执行质量分析精简
  2. §6.5 规则蒸馏章节精简（10 子章节 → 保留伪代码 + 阈值表格 + 排除列表，其余压缩为 3-5 行）
  3. §5 知识文档格式精简
  4. §8 知识回流章节精简
  5. §9 流程图简化（~40 行 ASCII → ≤15 行步骤列表）
  6. §11 示例去冗余（3 示例 → 1 + 2 行描述）
  7. §9.1 任务归档精简
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-learn/SKILL.md`
- **Commit**: `docs(learn): compress SKILL.md from 41K to ≤21K`

### Task 4: Checkpoint — 验证 forge-learn 优化

- **Goal**: 确认 contract test 通过（特别是规则蒸馏四数据源 + 五阈值）且字符数达标
- **File**: (无文件变更)
- **Design Reference**: `design.md#contract-test-兼容性` — 规则蒸馏专项断言
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-learn/SKILL.md | awk '$1 > 21000 {print "FAIL: " $1; exit 1} {print "PASS: " $1}'`
- **Commit**: (无提交，验证点)

### Task 5: 优化 forge-plan SKILL.md（32K → ≤19K）

- **Goal**: 输出模板去冗余、流程图简化、重复规则引用化
- **File**: `skills/forge-plan/SKILL.md`
- **Design Reference**: `design.md#strategy-1` — 每种 Plan 输出格式保留一个 Canonical Example
- **Sub-tasks**:
  1. 输出模板去冗余（每种格式保留一个示例）
  2. 流程图替换为编号步骤列表
  3. 重复规则引用化（验证纪律、TDD 相关描述 → Reference Directive）
  4. 失败模式章节评估（如适用则表格化）
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-plan/SKILL.md`
- **Commit**: `docs(plan): compress SKILL.md from 32K to ≤19K`

### Task 6: Checkpoint — 验证 forge-plan 优化

- **Goal**: 确认 contract test 通过且字符数达标
- **File**: (无文件变更)
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-plan/SKILL.md | awk '$1 > 19000 {print "FAIL: " $1; exit 1} {print "PASS: " $1}'`
- **Commit**: (无提交，验证点)

### Task 7: 优化 forge-review SKILL.md（28K → ≤17K）

- **Goal**: 严重度引用化、示例去冗余、流程图简化、失败模式表格化
- **File**: `skills/forge-review/SKILL.md`
- **Design Reference**: `design.md#strategy-2` — 严重度分级 → 遵循 CLAUDE.md §3.3
- **Sub-tasks**:
  1. §4 严重度分级引用化（→ 遵循 CLAUDE.md §3.3）
  2. §8, §12, §13 示例去冗余（保留阻断+放行各 1 个）
  3. §10 流程图简化（~30 行 ASCII → ≤10 行步骤列表）
  4. §14 失败模式表格化（4 模式 → 表格 ≤10 行）
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-review/SKILL.md`
- **Commit**: `docs(review): compress SKILL.md from 28K to ≤17K`

### Task 8: Checkpoint — 验证 forge-review 优化

- **Goal**: 确认 contract test 通过且字符数达标
- **File**: (无文件变更)
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-review/SKILL.md | awk '$1 > 17000 {print "FAIL: " $1; exit 1} {print "PASS: " $1}'`
- **Commit**: (无提交，验证点)

### Task 9: 优化 forge-spec SKILL.md（29K）

- **Goal**: 模板去冗余、示例精简、流程图简化
- **File**: `skills/forge-spec/SKILL.md`
- **Design Reference**: `design.md#strategy-1` + `design.md#strategy-5`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts` + `wc -c skills/forge-spec/SKILL.md`
- **Commit**: `docs(spec): compress SKILL.md`

### Task 10: 优化 forge-loop SKILL.md（20K）

- **Goal**: 流程图简化、示例去冗余、重复规则引用化
- **File**: `skills/forge-loop/SKILL.md`
- **Design Reference**: `design.md#strategy-1` + `design.md#strategy-5`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(loop): compress SKILL.md`

### Task 11: 优化 forge-router SKILL.md（16K）

- **Goal**: 示例去冗余
- **File**: `skills/forge-router/SKILL.md`
- **Design Reference**: `design.md#strategy-1`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(router): compress SKILL.md`

### Task 12: 优化 forge-refactor SKILL.md（14K）

- **Goal**: 模板去冗余、流程图简化
- **File**: `skills/forge-refactor/SKILL.md`
- **Design Reference**: `design.md#strategy-1` + `design.md#strategy-5`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(refactor): compress SKILL.md`

### Task 13: 优化 forge-test SKILL.md（13K）

- **Goal**: 重复规则引用化（验证铁律）、示例精简
- **File**: `skills/forge-test/SKILL.md`
- **Design Reference**: `design.md#strategy-2`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(test): compress SKILL.md`

### Task 14: 优化 forge-decide SKILL.md（13K）

- **Goal**: 示例去冗余、流程图简化
- **File**: `skills/forge-decide/SKILL.md`
- **Design Reference**: `design.md#strategy-1` + `design.md#strategy-5`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(decide): compress SKILL.md`

### Task 15: 优化 forge-ship SKILL.md（12K）

- **Goal**: 模板去冗余
- **File**: `skills/forge-ship/SKILL.md`
- **Design Reference**: `design.md#strategy-1`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(ship): compress SKILL.md`

### Task 16: 优化 forge-debug SKILL.md（12K）

- **Goal**: 流程图简化、示例精简
- **File**: `skills/forge-debug/SKILL.md`
- **Design Reference**: `design.md#strategy-5`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(debug): compress SKILL.md`

### Task 17: 优化 forge-fix SKILL.md（11K）

- **Goal**: 模板去冗余
- **File**: `skills/forge-fix/SKILL.md`
- **Design Reference**: `design.md#strategy-1`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(fix): compress SKILL.md`

### Task 18: 优化 forge-resume SKILL.md（7K）

- **Goal**: 轻微精简
- **File**: `skills/forge-resume/SKILL.md`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(resume): compress SKILL.md`

### Task 19: 优化 forge-abort SKILL.md（3K）

- **Goal**: 轻微精简
- **File**: `skills/forge-abort/SKILL.md`
- **Verify**: `npx vitest run test/contract.test.ts test/contract.skills.test.ts`
- **Commit**: `docs(abort): compress SKILL.md`

### Task 20: 体积验证与全量 CI

- **Goal**: 确认总体积 ≤192K，全量 CI 通过
- **File**: (无文件变更)
- **Design Reference**: `design.md#预估压缩效果` — 各 SKILL 目标字符数
- **Verify**: `npm run check`
- **Commit**: (无提交，最终验证)

## Spec Coverage

| Spec 需求 | 覆盖任务 |
|-----------|---------|
| Req 1: 输出模板去冗余 | Task 1(§1,2,9), Task 3(§6), Task 5(§1), Task 7(§2), Task 9-19 |
| Req 2: 消除规则重复 | Task 1(§3,4), Task 5(§3), Task 7(§1), Task 13 |
| Req 3: 失败模式表格化 | Task 1(§8), Task 7(§4) |
| Req 4: Restatement 去重 | Task 1(§5) |
| Req 5: 流程图简化 | Task 1(§6), Task 3(§5), Task 5(§2), Task 7(§3), Task 9-16 |
| Req 6: 规则蒸馏精简 | Task 3(§2) |
| Req 7: 体积目标 | Task 2,4,6,8,20 |
| Req 8: 行为等价性 | Task 2,4,6,8,20 + 各 Task 的 contract test 验证 |
