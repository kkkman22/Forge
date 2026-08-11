---
feature: project-charter
layout: tasks
created: 2026-06-04
spec_ref: ".forge/specs/project-charter/requirements.md"
---

# Implementation Plan: Project Charter

## Overview

本 spec 分 4 个实施阶段。核心是 charter 文件格式 + `/forge charter` 命令 + 下游 skill 的 grounding read 集成。

**总文件变更**：新增 2 个，修改 7 个，删除 0 个
**预估工时**：Standard tier 约 1.5–2 天
**风险等级**：低（纯增量，不修改现有行为）

---

## Phase 1: Charter 格式与命令

- [ ] 1.1 创建 charter 模板
  - [ ] 在 `templates/` 或 `.forge/templates/` 创建 `charter-template.md`
  - [ ] 包含所有必选章节（核心问题、架构边界、技术选型基线、不可变量、变更日志）
  - [ ] 包含可选章节（约定与偏好、已知未来变化、排除范围）
  - [ ] 每个章节含填写指引注释
  **Verify-By**: `test -f templates/charter-template.md` && `wc -l` ≤ 80（模板本身应比最终产出更短）
  **关联需求**: R1.1–R1.6

- [ ] 1.2 创建 `/forge charter` skill
  - [ ] 创建 `skills/forge-charter/SKILL.md`（或作为 forge skill 的子路由）
  - [ ] 定义 4 个子命令：`init` / `update` / `check` / `show`
  - [ ] `init`：扫描项目结构推断技术选型 → 扫描 ADR 提取已做决策 → 交互式问答 → 生成 charter
  - [ ] `update`：读取现有 charter → 检测不一致 → 逐章节审视 → 保留不变部分
  - [ ] `check`：读取 invariants → grep/glob 检查违规 → 输出合规报告
  - [ ] `show`：直接输出 charter 内容
  **Verify-By**: SKILL.md 存在且包含 4 个子命令定义
  **关联需求**: R2.1–R2.5

- [ ] 1.3 修改 router 增加 charter 子命令
  - [ ] 在 `skills/forge/SKILL.md` 或 router 中增加 `charter` 路由
  - [ ] 映射到 `forge-charter` skill
  **Verify-By**: `/forge charter` 命令能被识别
  **关联需求**: R2.1

- [ ] 1.4 手动验证：创建一个 charter
  - [ ] 运行 `/forge charter init`
  - [ ] 确认交互式问答流程
  - [ ] 确认 `.forge/charter.md` 生成且格式正确
  - [ ] 确认 frontmatter 字段完整
  - [ ] 运行 `/forge charter show` 确认输出
  **Verify-By**: `.forge/charter.md` 存在且 `grep "INV-" .forge/charter.md` 有输出
  **关联需求**: R1, R2

---

## Phase 2: Grounding Read 集成

- [ ] 2.1 修改 decide skill/agent 增加 charter grounding
  - [ ] 在 decide 执行前检查 `.forge/charter.md` 是否存在且 `status: active`
  - [ ] 提取摘要：核心问题 + 架构边界 + invariants（ID + 标题）
  - [ ] 注入到每个 reviewer 的上下文中作为约束条件
  - [ ] 检测 charter drift：新决策与 invariant 矛盾时显式标注
  - [ ] 提供三选一：(A) 修改 charter (B) 修改决策 (C) 标记例外
  **Verify-By**: decide agent 定义中包含 charter grounding 逻辑
  **关联需求**: R3.1, R3.4

- [ ] 2.2 修改 spec skill 增加 charter 合规性
  - [ ] spec 生成时读取 charter
  - [ ] 在 spec 文档中增加"Charter 合规性"章节
  - [ ] 每个需求标注对应的 invariant ID
  **Verify-By**: spec skill 中包含 charter 合规性检查逻辑
  **关联需求**: R3.2

- [ ] 2.3 修改 plan skill 增加 charter boundary 自检
  - [ ] plan 的 self-check 阶段增加 charter boundary 检查
  - [ ] 验证 plan 中的文件变更不违反 charter boundaries
  **Verify-By**: plan skill 中包含 charter boundary 检查
  **关联需求**: R3.3

- [ ] 2.4 处理 charter 不存在的降级场景
  - [ ] 所有 grounding read 点：charter 不存在 → 正常执行 + 标注 `ℹ No active charter`
  - [ ] charter status=draft → 不注入 grounding，提示用户激活
  **Verify-By**: charter 不存在时 decide/spec/plan 正常执行
  **关联需求**: R3.5

- [ ] 2.5 手动验证：charter grounding 端到端
  - [ ] 创建 charter
  - [ ] 运行 `/forge decide` 确认 charter 被读取
  - [ ] 运行 `/forge spec` 确认合规性章节出现
  - [ ] 尝试一个与 charter 矛盾的决策，确认 drift 检测工作
  **Verify-By**: decide 输出包含 charter 约束引用；spec 输出包含合规性章节
  **关联需求**: R3

---

## Phase 3: Review 集成与生命周期

- [ ] 3.1 修改 spec-check 增加 charter compliance
  - [ ] spec-check 在 charter 存在时增加"Charter Compliance"检查维度
  - [ ] invariant 违规报告为 P1，标注 invariant ID
  - [ ] charter 不存在时跳过
  **Verify-By**: spec-check agent 中包含 charter compliance 检查逻辑
  **关联需求**: R4.1–R4.4

- [ ] 3.2 实现 charter 版本管理
  - [ ] 定义语义化版本规则：major（删除/修改 invariant）、minor（新增）、patch（描述修正）
  - [ ] `/forge charter update` 自动计算版本号
  - [ ] major bump 时扫描 specs/ 和 decisions/ 产出影响报告
  **Verify-By**: charter update 能正确计算版本号
  **关联需求**: R5.1–R5.3

- [ ] 3.3 实现 charter 废弃流程
  - [ ] `status: deprecated` 时下游 skill 停止读取
  - [ ] 文件保留作为历史参考
  **Verify-By**: deprecated charter 不被 decide/spec/plan 读取
  **关联需求**: R5.4

- [ ] 3.4 修改 `/forge learn` 增加 charter 关联
  - [ ] 知识提取时检查 charter 相关性
  - [ ] 涉及 boundary/invariant 的知识文档标注 `charter_refs`
  **Verify-By**: learn 产出的知识文档 frontmatter 含 charter_refs（如相关）
  **关联需求**: R5.5

- [ ] 3.5 手动验证：review + lifecycle
  - [ ] 运行 `/forge review` 确认 charter compliance finding 出现
  - [ ] 修改 charter 的 invariant → 确认版本号变更
  - [ ] 标记 charter 为 deprecated → 确认下游不再读取
  **Verify-By**: review 输出包含 charter compliance；charter 版本正确变更
  **关联需求**: R4, R5

---

## Phase 4: Init 集成与文档

- [ ] 4.1 修改 init 流程增加 charter 选项
  - [ ] init 完成后询问是否创建 charter
  - [ ] 精简版 init：只问 3 个问题（核心问题、技术选型、1–3 条 invariants）
  - [ ] 生成的 charter status=draft
  **Verify-By**: `/forge init` 包含 charter 选项
  **关联需求**: R6.1–R6.4

- [ ] 4.2 更新 CLAUDE.md
  - [ ] §2 增加 charter 说明：什么是 charter、何时创建、如何影响下游
  - [ ] 确保 CLAUDE.md 行数增量 ≤ 10 行（charter 的详细文档在 charter 自身）
  **Verify-By**: `wc -l CLAUDE.md` 增量 ≤ 10
  **关联需求**: 全局

- [ ] 4.3 Contract test
  - [ ] 断言 `templates/charter-template.md` 存在
  - [ ] 断言 charter skill 包含 4 个子命令
  - [ ] 断言 spec-check agent 包含 charter compliance 关键词
  - [ ] 断言 decide agent 包含 charter grounding 关键词
  **Verify-By**: `npx vitest run test/contract.test.ts` 绿
  **关联需求**: 全局

- [ ] 4.4 最终验证
  - [ ] `npx vitest run` 全部绿
  - [ ] `npm run check` 通过
  - [ ] 端到端：init → charter init → decide → spec → plan → review → learn，确认 charter 在全流程中起作用
  **Verify-By**: 所有验证通过
  **关联需求**: 全局

---

## 任务依赖关系

```
Phase 1 (Charter 格式与命令)
  1.1 → 1.2 → 1.3 → 1.4
                        ↓
Phase 2 (Grounding Read)
  2.1 → 2.2 → 2.3 → 2.4 → 2.5
                               ↓
Phase 3 (Review + 生命周期)
  3.1 → 3.2 → 3.3 → 3.4 → 3.5
                               ↓
Phase 4 (Init + 文档)
  4.1 → 4.2 → 4.3 → 4.4
```

Phase 1 和 Phase 2 可以与 `ce-inspired-review-enhancement` spec 并行开发（charter 的 grounding read 不依赖 review 的置信度系统）。Phase 3 的 spec-check 集成最好在 review enhancement spec 落地后再做（利用 confidence 给 charter compliance finding 打分）。
