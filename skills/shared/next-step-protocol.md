---
updated: 2026-08-11
---
# Next Step Protocol

完成当前阶段后，**必须立即自动调用下一阶段**，不得停下来等待用户确认。

## 阶段切换时的 P0/P1 持久化

在 decide→spec、plan→build、build→review 的切换点，以及 build 内部 wave 之间切换时，执行：

1. 收集当前 context 中的 P0/P1 findings（来自 review/decide 的输出）
2. 调用 `serializePendingFindings(findings, taskName)` 序列化为 markdown table
3. `Write` 到 `.forge/progress/<taskName>-pending-findings.md`
4. 写入失败 → 跳过持久化，继续推进（不阻断）
5. 无 P0/P1 findings → 跳过此步骤

## Context Compact 策略

**Claude Code 平台行为**：
- CLI 自动 compact 阈值：~95%（硬编码，不可配置）
- VS Code 扩展自动 compact 阈值：~65%
- AI 无法程序化触发 compact 或读取 context 使用率
- Skill 执行不阻断自动 compact（平台后台自动处理）
- `/compact` 命令可在 skill 执行中使用但可能打断状态

**Forge 策略：持久化优先，建议性 compact**

Forge 不尝试自动触发 compact（技术上不可行）。而是：
1. **持久化保护**（已实现）：在阶段切换和 wave 间将 P0/P1 写入 `.forge/progress/<task>-pending-findings.md`，确保 compact 后可恢复
2. **建议性输出**：wave/阶段完成时，若 AI 观察到 context 较高（对话轮次多、subagent 输出多），输出建议：
   ```
   📊 Wave N 完成 | 建议执行 /compact 再继续（P0/P1 已持久化）
   ```
3. **用户决策**：用户自行决定是否 /compact。不自动阻断流程。
4. **Compact 后恢复**：通过 `/tinkerman resume` 从 `.forge/progress/` 和 `.forge/knowledge/sessions/` 读取状态

**Inter-phase 持久化点**：

| 切换点 | 持久化动作 |
|--------|-----------|
| decide 确认 → spec | 持久化 P0/P1 findings |
| plan 批准 → build | 持久化 P0/P1 findings |
| build wave 完成 | 持久化 P0/P1 findings |
| build 完成 → review | 持久化 P0/P1 findings |

## 规则

1. **禁止**使用 AskUserQuestion 询问是否继续下一步
2. **禁止**纯文本输出"是否继续？"等确认提示
3. **禁止**完成阶段后静默 idle（无输出、等待用户输入）— 这与显式询问"是否继续"**同罪**。静默 ≠ 安全停顿，它是更隐蔽的阻断（R5）
4. 成功完成时：输出一行摘要，然后**立即调用** `Skill(skill="forge", args="<next>")` 执行下一阶段
5. 失败/阻断时：输出问题清单，**停止**，等待用户决定
6. 用户传入 `--no-advance` 参数时，不自动推进，仅输出摘要
7. **禁止**使用 AskUserQuestion 询问 context 预算相关决策（是否 /clear、是否 /compact、是否继续）。context 预算检查仅输出建议文字（如 `📊 建议执行 /compact 再继续`），由用户自行决定。只有累积 Read >150 KB 时才强制停止并输出 `⛔ MUST /clear + /tinkerman resume`

## 需要用户决策的阶段

以下阶段需要用户做出选择，**必须主动询问用户**（使用 AskUserQuestion 或结构化选项），而非等待用户猜测下一步：

| 阶段 | 需要用户决策的时机 | 询问方式 |
|------|------------------|---------|
| decide | 决策文档生成后，确认方向 | 提供 3 选项：确认/修改/否决 |
| spec | 草案生成后，确认锁定 | 提供选项：确认锁定/修改/拒绝 |
| plan | 计划生成后，批准执行 | 提供选项：批准/修改/拒绝 |
| ship | 门禁通过后，选择交付方式 | 提供 4 选项：Merge/PR/Keep/Discard |

**关键区别**：
- **需要用户决策** = 主动提供选项让用户选择（AskUserQuestion）
- **自动推进** = 用户做出选择后，立即执行下一阶段，不再二次确认

**示例**：plan 阶段 → 用户批准 → 输出 `✅ plan 完成 → 自动进入 build` → 立即调用 build。中间不再问"确定要开始 build 吗？"

## 各阶段下一步映射

| 当前阶段 | 成功时下一步 | 失败/阻断时 |
|---------|-----------|-----------|
| /tinkerman decide | 自动调用 /tinkerman spec | 输出问题，停止 |
| /tinkerman spec | 自动调用 /tinkerman plan | 输出问题，停止 |
| /tinkerman plan | 自动调用 /tinkerman build | 输出问题，停止 |
| /tinkerman build | 自动调用 /tinkerman review | 输出问题，停止 |
| /tinkerman build-light | 自动调用 /tinkerman review | 输出问题，停止 |
| /tinkerman review (通过) | 自动调用 /tinkerman test（标准/全量）或 /tinkerman ship（轻量） | 输出报告 → gated_auto 询问 → 修复 → re-review |
| /tinkerman review (未通过，P0/P1) | 输出报告+清单 → 立即 gated_auto 询问（AskUserQuestion）→ 确认后自动修复 → re-review | 阻断性错误、Three-strike |
| /tinkerman test | 自动调用 /tinkerman ship | 输出失败详情，停止 |
| /tinkerman ship | 自动调用 /tinkerman learn（全量）或标记完成（标准） | 输出阻断原因，停止 |

## 摘要格式

成功时输出一行摘要后立即调用下一阶段：

```
✅ <阶段> 完成 → 自动进入 <下一阶段>
```

示例：

```
✅ build 完成 → 自动进入 review
```

```
✅ review 通过 → 自动进入 test
```

## 调用方式

```
Skill(skill="forge", args="<next>")
```

**不得**使用 `Skill(skill="forge-<next>")`，所有子命令必须通过 forge 统一入口路由。

## 阶段内部任务间推进

本协议不仅适用于阶段之间，也适用于**阶段内部的任务之间**。例如 build 阶段有多个任务时，完成一个任务后必须立即开始下一个，不得停下来列出剩余任务并询问"是否继续"。唯一允许停下来的情况：阻断性错误、Three-strike 触发、需要用户提供信息。

## 三种违规形态（都必须杜绝）

SKILL 执行流的最后一条指令必须是 auto-advance 调用或明确的用户确认点（decide / spec 阶段）。以下三种形态同等违规：

| 形态 | 举例 | 判定 |
|------|------|------|
| 显式询问 | "是否继续进入 review？" | ❌ 违规 |
| 工作量承诺 | "接下来要做 15 个任务，是否继续？" | ❌ 违规 |
| **隐式 idle** | 阶段完成后静默等待（无输出、无调用） | **❌ 违规（等同于显式询问）** |

如果不确定下一步是什么，检查 `.forge/status.md` 的 `phase` 字段和本文件的"阶段下一步映射"表。
