---
name: forge-debug
description: "Diagnose root causes through four-phase hypothesis verification with minimal-change repair. Use when user says debug this, reports a regression, or after three consecutive build failures trigger the three-strike reroute."
context: fork
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge debug — 调试引擎

> **触发方式**：`/forge build` 连续失败 3 次自动触发，或用户直接输入 `/forge debug`
> **职责**：结构化的四阶段根因分析，避免"试试改改"的低效调试方式
> **输出路径**：`.forge/debug/<topic>.md`

---

## 1. Overview

`/forge debug` 以 **Subagent 模式**启动四阶段调试流程，强制按照"调查 → 分析 → 验证 → 修复"的顺序推进。每个阶段有明确的准入和准出条件，阶段之间不可跳跃。

**核心原则**：先理解问题，再解决问题。没有完成根因调查就提出修复方案 = 在黑暗中开枪。

**铁律**：Phase 1 未完成 → 不能提出修复方案。这是不可协商的硬性约束。

---

**Not For**：
- 已知根因的简单修复
- 非代码问题（环境配置、权限等）

### §1.5 Pre-flight: Branch Gate

调用 `runBranchGate({ skill: "debug", mode, currentBranch, currentTask, pendingDeliveries, alreadyCheckedThisPhase, isCleanTree })`：
- `passed` / `skipped` → 继续后续 §
- `auto_fixed` → 输出 `✅ 已自动切换到 <newBranch>` 后继续
- `blocked` → 中止 skill，按 mode 输出对应提示
- `warned` → 输出警告但继续

默认严重度：warn。`--cross-branch` 时 `severityOverride: warn` 允许跨分支调试。

## 2. Four-Phase Process

### Phase 1 — Root Cause Investigation (Fix Proposals Prohibited)

完整理解问题：1. 完整阅读错误栈+日志 2. 稳定复现 3. 检查最近 Git 变更 4. 追踪数据流。**铁律**：Phase 1 未完成不能提出修复。产出：`.forge/debug/<topic>.md` (status: "investigating")。

### Phase 2 — Pattern Analysis

1. 对比正常代码 2. 搜索 `known-failures.md` 3. 搜索 `solutions/` 4. 模式匹配缩小假设。

### Phase 3 — Hypothesis Verification

每次单一假设 + 最小改动。同一假设连续 3 次失败 → 停止修复，质疑架构。

### Phase 4 — Fix Verification

RED（复现测试）→ GREEN（最小修复）→ 全量测试确认无新问题。→ TDD 规则详见 ../forge-build/references/tdd-rules.md。完成后 status: "resolved"。Interactive 提示 `/forge learn`；autonomous 跳过。

---

## 3. Red Flag Checklist

| Red Flag | Action |
|---------|--------|
| 修复引入两个新问题 | 回到 Phase 1 |
| 同一假设连续失败 3 次 | 停止修复，质疑架构 |
| 修复代码越来越复杂 | 考虑更高层架构变更 |
| 无法稳定复现 | 增加日志，收集数据 |
| 错误信息与逻辑不匹配 | 重新追踪数据流 |
| 测试通过但行为异常 | 补充更多测试场景 |

---

## 4. Execution Flow

1. **Phase 1**：根因调查（禁止提出修复方案）— 完整阅读错误 → 稳定复现 → 检查最近变更 → 追踪数据流
2. **Phase 2**：模式分析 — 对比正常代码 → 搜索历史踩坑 → 缩小假设范围
3. **Phase 3**：假设验证 — 单一假设 + 最小改动，3 次失败 → 停止修复，质疑架构
4. **Phase 4**：修复验证 — RED 回归测试 → GREEN 实施修复 → 确认无新问题
5. 修复完成后：status: "resolved"，提示 `/forge learn`

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我知道 bug 在哪直接修" | 你可能 70% 的时候是对的。另外 30% 会浪费数小时。先复现再修 |
| "这个失败的测试可能是测试本身的问题" | 验证这个假设。如果测试有问题就修测试，不要跳过它 |
| "在我机器上是好的" | 环境不同。检查 CI、检查配置、检查依赖版本 |

---

## 5. Edge Cases

无法复现 → 竞态/环境问题，增日志查并发 · Phase 1 提修复 → 🚫 禁止 · 所有假设失败 → 回 Phase 1 扩大范围 · 无 `.forge/` → forge init

---

## 6. Examples

```
$ /forge debug
━━━ Phase 1 ━━━  TypeError at export.ts:42 · 复现率100%(status=null) · 新增过滤未处理null · db.query→undefined
━━━ Phase 2 ━━━  匹配 null-parameter-handling.md (0.7) · 假设A: db.query(null)→undefined
━━━ Phase 3 ━━━  验证假设A: null检查 → ✅消失
━━━ Phase 4 ━━━  🔴 RED FAIL ✅ → 🟢 GREEN PASS ✅ → 42/42 ✅
✅ 根因: db.query未处理null · 修复: 查询层统一过滤null
```

## Gotchas
- **Hypothesis fixation**: First hypothesis seems right → stop investigating alternatives → test hypothesis, don't assume
- **Symptom vs cause**: Fix symptom, not root cause → bug recurs in different form → trace to root cause before fixing
- **Three-strike loop**: Same hypothesis tested 3 times → confirms approach is wrong → question architecture, not implementation
- **Context overflow**: Debug reads too many files → main context fills up → use subagent for exploration, return only findings
