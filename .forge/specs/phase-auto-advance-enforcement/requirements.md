---
feature: phase-auto-advance-enforcement
status: locked
created: 2026-06-01
decision_ref: .forge/decisions/2026-06-01-phase-auto-advance-enforcement.md
---

# Requirements: Phase Auto-Advance Enforcement

## Problem Statement

AI 在 Forge 管道中完成一个阶段后，输出"✅ 阶段完成 → 自动进入"文字，但未实际调用 `Skill(skill="forge", args="next")`。此问题已发生两次，是系统性模式——长会话后 AI 丢失铁律约束，且无运行时机制检测或阻止此行为。

## Goals

1. 当 status.md 的 phase 字段发生过渡时，向 AI 上下文注入结构性提醒
2. 填补 CLAUDE.md §2.7 对 `shared/next-step-protocol.md` 的幽灵引用
3. 建立 phase 过渡的可观测性——每次过渡都被记录和提醒

## Non-Goals

- 不实现 PreToolUse 阻止机制（误报风险过高）
- 不修改 skill-scheduler.ts（纯函数设计不可侵犯）
- 不修改 Stop hook 为 exit 2（架构不支持 Stop 阻塞）
- 不尝试"让 AI 更听话"——只提供运行时信号

## Glossary

| Term | Definition |
|------|-----------|
| Phase transition | status.md 中 `phase` 字段从一个有效值变为另一个 |
| Ghost reference | CLAUDE.md 中引用但目标文件不存在的引用 |
| PostToolUse hook | 工具调用完成后触发的 hook，可输出诊断信息但不能阻止 |
| Atomic advance | 输出摘要 + 调用 Skill 在同一个 AI turn 内完成 |

## Functional Requirements

### FR-1: Phase Transition Detection

**When** status.md 被 Write 或 Edit 工具修改
**And** `phase` 字段的值从 `phase_A` 变为 `phase_B`（其中 `phase_B` ≠ "completed"）
**Then** hook 脚本向 stdout 输出结构性提醒消息

**When** status.md 被 Write 或 Edit 工具修改
**And** `phase` 字段未变化或变为 "completed"
**Then** hook 脚本无输出（静默退出）

### FR-2: Reminder Message Format

**When** FR-1 触发 phase 过渡提醒
**Then** 输出消息包含以下要素：
1. §2.7 铁律引用
2. 源 phase 和目标 phase 值
3. 明确的指令：`必须立即调用 Skill(skill="forge", args="<next>")`
4. 违规警示：不得输出过渡文字而不调用

### FR-3: Phase State Caching

**When** hook 脚本运行
**Then** 将当前 phase 值原子写入 `/tmp/forge-last-phase` 缓存文件
**And** 下次运行时从此文件读取上一 phase 值进行比对

### FR-4: Next-Step Protocol Document

**When** `shared/next-step-protocol.md` 被任何 skill 或 hook 引用
**Then** 文件存在且包含完整的自动推进协议（过渡映射表、原子动作要求、违规形态清单）

### FR-5: Hook Registration

**When** `.claude/settings.json` 被加载
**Then** PostToolUse hooks 中包含 phase-transition-guard 条目
**And** matcher 匹配 Write|Edit
**And** 条件性触发（仅当 status.md 被修改时）

## Acceptance Criteria

| ID | Criterion | Verify-By | Evidence |
|----|-----------|-----------|----------|
| AC-1 | Hook 脚本在 phase 从 "build" 变为 "review" 时输出提醒消息 | vitest | 测试用例调用脚本并验证 stdout 包含 §2.7 和 Skill 调用指令 |
| AC-2 | Hook 脚本在 phase 未变化时无输出 | vitest | 测试用例设置 last-phase=current-phase，验证 stdout 为空 |
| AC-3 | Hook 脚本在 phase 变为 "completed" 时无输出 | vitest | 测试用例设置 last-phase=ship → completed，验证 stdout 为空 |
| AC-4 | `/tmp/forge-last-phase` 文件在每次 hook 运行后被更新 | bash | 运行 hook 后检查文件 mtime 和内容 |
| AC-5 | `shared/next-step-protocol.md` 文件存在且包含过渡映射表 | bash | `test -f shared/next-step-protocol.md && grep -c '自动推进'` |
| AC-6 | settings.json 包含 phase-transition-guard hook 条目 | vitest | 解析 settings.json 验证 hook 存在且 matcher 正确 |
| AC-7 | Hook 脚本在 status.md 不存在时静默退出（exit 0） | vitest | 无 status.md 时运行脚本，验证 exit 0 且无输出 |
| AC-8 | Hook 脚本处理 status.md 无 phase 字段的情况（exit 0） | vitest | 空 frontmatter 时运行脚本，验证 exit 0 |

## Delta (Brownfield)

### New Files

| File | Description |
|------|-------------|
| `scripts/phase-transition-guard.sh` | PostToolUse hook 脚本 |
| `shared/next-step-protocol.md` | 自动推进协议文档 |
| `test/phase-transition-guard.test.ts` | Hook 脚本测试 |

### Modified Files

| File | Change |
|------|--------|
| `.claude/settings.json` | 添加 PostToolUse hook 条目 |

### Unchanged Files

| File | Reason |
|------|--------|
| `src/skill-scheduler.ts` | 纯函数设计不可侵犯 |
| `skills/forge/lib/*/instructions.md` | Skill 指令不修改 |
| `CLAUDE.md` | §2.7 引用已指向 shared/next-step-protocol.md |

## Anti-Drift

| Item | Signal |
|------|--------|
| Main objective | 防止 AI 阶段停滞（输出文字但不调用 Skill） |
| Non-objective proxy | 不要试图阻止所有 AI 行为偏差 |
| Verification role | spec → build 的真理源；review 按此验收 |
