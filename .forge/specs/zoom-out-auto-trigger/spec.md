---
status: locked
created: "2026-05-14"
topic: zoom-out-auto-trigger
---

# Spec: zoom-out 自动触发机制

## 概述

将 `/forge zoom-out` 从纯被动（用户主动触发）升级为可自动触发的"视角重置"机制。当 debug 阶段反复失败或 decide 阶段多轮无定论时，系统自动触发 zoom-out，将全局视角注入后续阶段上下文，打破局部锁定。

## 动机

反复 debug 失败或 decide 僵持，本质上都是"视野被锁死在局部"的信号。zoom-out 的三段式输出（整体位置 / 当前职责 / 与邻居的边界）恰好能打破这种局部锁定——根因可能不在当前模块，决策的约束可能来自上游。

当前 zoom-out 只能由用户主动触发，但用户往往在深陷局部时意识不到需要退后一步。自动触发填补了这个盲区。

## 核心设计原则

- **无副作用保证**：zoom-out 本身只读、不落盘（除 pause/resume 标记），自动触发不改变这一性质
- **频率限制**：同一会话内每个触发场景最多自动触发 1 次，避免循环
- **输出注入**：自动触发时 zoom-out 输出不仅展示给用户，还注入后续阶段的上下文
- **中文提示**：interactive 模式下的提示使用中文表达

## 触发场景

### 场景 1：debug/fix 阶段反复失败

| 条件 | 值 |
|------|-----|
| 触发点 | forge-fix 日志调试 2 轮失败，即将回到 analyze 阶段前 |
| 前置条件 | 本会话未因此场景自动触发过 zoom-out |
| 行为 | 自动执行 zoom-out → 输出注入 re-analyze 上下文 |

### 场景 2：decide 阶段多轮无定论

| 条件 | 值 |
|------|-----|
| 触发点 | Subagent 评估 ≥ 2 轮且 consensus_score 低于阈值，或用户连续 3 次表达犹豫（"再想想"/"不确定"/"都行"） |
| 前置条件 | 本会话未因此场景自动触发过 zoom-out |
| 行为 | 自动执行 zoom-out → 输出注入下一轮 Subagent prompt 作为 system context |

## 双模式行为

| 模式 | 行为 |
|------|------|
| autonomous | 直接触发 zoom-out，输出注入后续上下文，无需确认 |
| interactive | 提示用户：`「当前讨论似乎陷入局部，建议先退后一步看看整体位置。是否继续？」`，用户确认后触发 |

## 输出注入规则

自动触发的 zoom-out 输出（三段式 Markdown）作为额外上下文注入后续阶段：

- **debug/fix 场景**：注入 re-analyze 的 prompt 前缀，标注 `[自动视角重置]`
- **decide 场景**：注入下一轮 Subagent 的 system context，标注 `[全局位置参考]`

注入格式：

```markdown
---
[自动视角重置] 以下是当前任务在系统中的位置概览，供重新分析时参考：

## 整体位置
<zoom-out 输出>

## 当前职责
<zoom-out 输出>

## 与邻居的边界
<zoom-out 输出>
---
```

## 频率限制机制

- 使用会话级计数器 `autoZoomOutTriggered: { debug: boolean, decide: boolean }`
- 每个场景独立计数，互不影响
- 会话结束时自动清零（不持久化）
- 用户主动触发的 zoom-out 不计入自动触发计数

## 文件影响

- 修改: `src/zoom-out.ts` — 新增 `shouldAutoTriggerZoomOut(context)` 纯函数，判定是否满足自动触发条件
- 修改: `skills/forge-fix/SKILL.md` — 日志调试升级机制中增加自动 zoom-out 触发点
- 修改: `skills/forge-decide/SKILL.md` — 多轮无定论时增加自动 zoom-out 触发点（如有独立 SKILL.md）
- 新增: `test/zoom-out-auto-trigger.property.test.ts` — 属性测试

## 边界与约束

- zoom-out 自身逻辑不变（三段式、≤5 行/段、只读 explore subagent）
- 不影响三次失败路由到 debug 的现有机制（zoom-out 在路由前触发，不替代路由）
- 不影响用户主动触发 zoom-out 的现有路径
- 自动触发的 zoom-out 同样遵守 `zoom_out_paused` / `original_phase` 暂停恢复协议

## 验收标准

1. debug/fix 日志调试 2 轮失败后，自动触发 zoom-out 并将输出注入 re-analyze 上下文
2. decide 多轮无定论时，自动触发 zoom-out 并将输出注入下一轮 Subagent prompt
3. 同一会话同一场景不重复自动触发
4. interactive 模式下提示使用中文，用户可拒绝
5. autonomous 模式下无需确认直接触发
6. 自动触发不破坏现有 zoom-out 的暂停/恢复机制
7. 用户主动触发不受自动触发频率限制影响
