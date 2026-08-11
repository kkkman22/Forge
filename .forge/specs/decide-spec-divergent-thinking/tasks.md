---
feature: decide-spec-divergent-thinking
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/decide-spec-divergent-thinking/requirements.md"
---

# Implementation Plan: Decide/Spec Divergent Thinking

## Overview

本 spec 是 3 个 CE-inspired spec 中最小的——只修改 4 个文件，不新增任何文件。核心是在 `/forge decide` 和 `/forge spec` 的开头各加一个简短的交互门控。

**总文件变更**：新增 0 个，修改 4 个，删除 0 个
**预估工时**：Light tier 约 0.5–1 天
**风险等级**：极低（纯增量，跳过时与现有行为完全一致）

---

## Phase 1: `/forge decide` Reframing Gate

- [ ] 1.1 修改 decide agent/skill 增加 Reframing Gate
  - [ ] 在 5 视角分析前插入 Reframing Gate 阶段
  - [ ] 实现问题选择算法：
    - 方案级决策 → "你确定这是正确的问题吗？"
    - 大范围变更 → "有什么隐藏约束？"
    - 高成本选项 → "你愿意承受多大代价？"
  - [ ] 使用 `AskUserQuestion` 提问，每题提供 `跳过，直接分析` 选项
  - [ ] 最多 3 个问题，按优先级选择
  - [ ] Light tier: 完全跳过
  - [ ] Standard tier: 默认启用，`--no-reframe` 可跳过
  - [ ] Full tier: 强制启用
  - [ ] 用户回答注入到 reviewer 上下文
  **Verify-By**: decide agent/skill 中包含 Reframing Gate 逻辑
  **关联需求**: R1.1–R1.6, R3.1–R3.3

- [ ] 1.2 修改 router 支持 `--no-reframe` flag
  - [ ] `/forge decide --no-reframe <topic>` 传递 skip-reframe 信号到 decide agent
  - [ ] 同样适用于 `/forge spec --no-reframe <topic>`
  **Verify-By**: `grep "no-reframe" skills/forge/SKILL.md` 有输出
  **关联需求**: R3.2

- [ ] 1.3 手动验证：Reframing Gate
  - [ ] `/forge decide "是否引入 Redis 做缓存层"` → 确认提问出现
  - [ ] 回答问题 → 确认回答被注入到分析上下文
  - [ ] 选择"跳过" → 确认直接进入分析
  - [ ] `/forge decide --no-reframe "..."` → 确认跳过 Gate
  **Verify-By**: 上述 4 个场景行为正确
  **关联需求**: R1

---

## Phase 2: `/forge spec` Clarification Gate

- [ ] 2.1 修改 spec skill 增加 Clarification Gate
  - [ ] 在正式需求编写前插入 Clarification Gate 阶段
  - [ ] 实现问题选择算法：
    - 功能特性类 → "核心用户价值是什么？"
    - charter 不存在或无排除范围 → "什么情况下不该工作？"
    - 外部交互 → "依赖准备好了吗？"
    - 兜底 → "成功标准？"或"替代方案？"
  - [ ] 使用 `AskUserQuestion` 提问，每题提供 `跳过` 选项
  - [ ] 最多 5 个问题，不重复已覆盖维度
  - [ ] 读取 charter（如果存在）避免重复提问
  - [ ] 用户回答整合到需求文档中
  - [ ] Light tier: 完全跳过
  - [ ] Standard tier: 默认启用
  - [ ] Full tier: 强制启用
  **Verify-By**: spec skill 中包含 Clarification Gate 逻辑
  **关联需求**: R2.1–R2.7

- [ ] 2.2 手动验证：Clarification Gate
  - [ ] `/forge spec "用户数据导出功能"` → 确认提问出现
  - [ ] 回答"合规需求" → 确认需求文档包含合规相关需求
  - [ ] 选择全部跳过 → 确认与当前行为一致
  **Verify-By**: 上述 3 个场景行为正确
  **关联需求**: R2

---

## Phase 3: 反馈回路 + 文档

- [ ] 3.1 实现 reframing 日志
  - [ ] Gate 执行后记录到 `.forge/progress/<slug>-reframing.jsonl`
  - [ ] 记录字段：timestamp, skill, questions_asked, questions_answered, questions_skipped, outcome_changed
  - [ ] `outcome_changed` 在 decide/spec 完成后由 AI 回填
  **Verify-By**: reframing 日志文件在 Gate 执行后存在且格式正确
  **关联需求**: R4.1–R4.3

- [ ] 3.2 更新 CLAUDE.md
  - [ ] §2 增加 Reframing/Clarification Gate 说明（≤5 行）
  - [ ] 说明：Full tier 强制、Standard 默认、Light 跳过
  **Verify-By**: `wc -l CLAUDE.md` 增量 ≤ 5
  **关联需求**: 全局

- [ ] 3.3 最终验证
  - [ ] `npx vitest run` 绿
  - [ ] `npm run check` 通过
  - [ ] 完整流程验证：decide（有重构）→ spec（有澄清）→ 确认两个 Gate 都工作
  **Verify-By**: 所有验证通过
  **关联需求**: 全局

---

## 任务依赖关系

```
Phase 1 (Decide Reframing Gate)
  1.1 → 1.2 → 1.3
                  ↓
Phase 2 (Spec Clarification Gate)
  2.1 → 2.2
           ↓
Phase 3 (反馈回路 + 文档)
  3.1 → 3.2 → 3.3
```

Phase 1 和 Phase 2 可以并行（decide 和 spec 的修改互不依赖）。Phase 3 依赖两个 Gate 都完成。
