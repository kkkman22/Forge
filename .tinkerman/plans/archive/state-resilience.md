---
status: approved
created: "2026-05-01"
source: ".kiro/specs/state-resilience"
---

# Plan: State Resilience

> 来源: `.kiro/specs/state-resilience/` (requirements + design + tasks)

## Objective

为 Forge 状态系统增加三层防御：宽容解析（缺失字段用默认值）、降级执行（前置文件缺失时保守处理）、状态自愈（从文件系统重建不一致状态）。

## 关键发现

### 现有代码分析

1. **state.ts (580L)**: 使用 `parseFrontmatter()` + `extractStringField()` 做行级解析，无结构化 StatusFile 解析函数。`parseStatusEntries()` 解析多任务格式但不处理单字段缺失。
2. **skill-scheduler.ts (312L)**: `determineNextSkill()` 对 `hasIncompleteTasks` 用 truthy 检查 (`if (hasIncompleteTasks)`)。当 `undefined` 时为 falsy → **错误地推进到 review 阶段**（应留在 build）。同样问题存在于 refactor-apply 和 fix-apply 阶段。
3. **review.ts (458L)**: 只有 findings 处理管道（filter → dedupe → cross-validate），无 review report frontmatter 解析器。
4. **config-store.ts (226L)**: 有 `extractConfigLang()` 和 `parseLogConfig()`，但无全局 config 默认值表。
5. **status-resolver.ts (115L)**: 纯路径解析 + slugify，无状态推断逻辑。
6. **frontmatter.ts (155L)**: 提供 `parseFrontmatter()`、`extractStringField()`、`extractNumericField()`、`extractListField()` — 这些是构建宽容解析的基础工具。

### 核心问题

- `hasIncompleteTasks === undefined` 在 build 阶段被当作"完成"处理 → 需改为保守假设"未完成"
- 无统一的 frontmatter 字段默认值机制 → 需要默认值表 + 宽容解析函数
- 无状态推断能力 → 需要从 .tinkerman/ 文件结构推断当前阶段

## Implementation Plan

### Task 1: 默认值表定义 + StatusFile 宽容解析 (state.ts)

**文件**: `src/state.ts`

**改动**:
1. 新增 `StatusFields` 接口（结构化的 StatusFile 字段）
2. 新增 `STATUS_DEFAULTS` 常量（如 design.md 定义）
3. 新增 `parseStatusFileGraceful(content: string | undefined): { parsed: StatusFields, warnings: string[] }`
   - `undefined` → 全部默认值
   - 缺失 frontmatter → 全部默认值 + warning
   - 部分字段缺失 → 缺失字段用默认值 + warning
   - 完整输入 → 与现有 `extractStringField` 行为一致
4. 新增 `REVIEW_REPORT_DEFAULTS` 常量（result: "incomplete", p0_count: 0 等）
5. 新增 `ReviewReportFields` 接口
6. 新增 `parseReviewReportGraceful(content: string | undefined): { parsed: ReviewReportFields, warnings: string[] }`

**测试**: `test/state-resilience.property.test.ts` + `test/state-resilience.test.ts`
- Property 1: 任意字段子集 → 结果对象包含全部字段
- Property 4: 完整有效输入 → 与逐字段 extractStringField 结果一致
- 单元测试: 全缺失、部分缺失、完整、畸形 YAML

### Task 2: Config 宽容解析 (config-store.ts)

**文件**: `src/config-store.ts`

**改动**:
1. 新增 `ConfigFields` 接口
2. 新增 `CONFIG_DEFAULTS` 常量
3. 新增 `parseConfigGraceful(content: string | undefined): { parsed: ConfigFields, warnings: string[] }`
4. 复用现有 `parseFrontmatter()` + `extractStringField()` / `extractNumericField()` / `extractListField()`

**测试**: `test/config-store-resilience.test.ts`
- 全缺失、部分缺失、完整 config

### Task 3: Skill Scheduler 降级执行 (skill-scheduler.ts)

**文件**: `src/skill-scheduler.ts`

**改动**:
1. `determineNextSkill()` 中修复 `hasIncompleteTasks === undefined` 的处理：
   - build 阶段: `if (hasIncompleteTasks !== false)` → 留在 build
   - build-light 阶段: 同上
   - refactor-apply 阶段: 同上
   - fix-apply 阶段: 同上
2. `reviewResult === undefined` 已正确处理（留在 review）
3. `testPassed === undefined` 已正确处理（留在 test）
4. 添加注释说明保守原则

**测试**: `test/skill-scheduler-resilience.property.test.ts`
- Property 2: 任意 undefined 可选字段 → 结果阶段不晚于当前阶段
- 单元测试: 每个 undefined 字段组合

### Task 4: 状态自愈 (status-resolver.ts)

**文件**: `src/status-resolver.ts`

**改动**:
1. 新增 `ReconstructedState` 接口
2. 新增 `reconstructStateFromGit(forgeFiles: string[]): ReconstructedState`
3. 推断逻辑: reviews/ → review, progress/ → build, plans/ → plan, 无文件 → router
4. 纯函数，无副作用

**测试**: `test/status-resolver.property.test.ts`（扩展现有文件）
- Property 3: 包含 reviews/ → 推断阶段至少 "review"
- 单元测试: 各种文件组合

### Task 5: Resume 集成 (resume.ts)

**文件**: `src/resume.ts`

**改动**:
1. 新增 `reconstructIfMissing()` 辅助函数
2. 当 StatusFile 缺失或不一致时，调用 `reconstructStateFromGit()`
3. 重建结果仅输出给用户确认，不自动写入磁盘

**测试**: 扩展 `test/resume.property.test.ts`

### Task 6: SKILL.md 更新 (forge-resume)

**文件**: `skills/forge-resume/SKILL.md`

**改动**:
1. 更新文档提及状态重建作为 StatusFile 缺失时的回退方案

### Task 7: 回归验证

1. `npm run check` — 全量测试通过
2. 验证正常流程行为不变（宽容解析仅在缺失/畸形数据时激活）
3. 验证 scheduler 行为对完整输入不变

## 依赖关系

```
Task 1 (state.ts) ← 无依赖
Task 2 (config-store.ts) ← 无依赖
Task 3 (skill-scheduler.ts) ← 无依赖
Task 4 (status-resolver.ts) ← 无依赖
Task 5 (resume.ts) ← 依赖 Task 4
Task 6 (SKILL.md) ← 依赖 Task 4
Task 7 (回归) ← 依赖 Task 1-6
```

Task 1-4 可并行开发。

## 不做什么

- 不改变正常流程行为（容错只在异常情况下触发）
- 不自动修复磁盘上的状态文件（只重建内存中的状态）
- 不降低质量标准（降级模式输出警告，不跳过门禁）
- 不修改 SKILL.md 的执行逻辑或流程
