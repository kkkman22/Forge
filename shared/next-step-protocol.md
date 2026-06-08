---
description: "Phase auto-advance protocol — 阶段间自动推进的运行时协议"
---

# Next-Step Protocol: Phase Auto-Advance

> 本文档是 CLAUDE.md §2.7 的具体化，定义阶段间自动推进的完整协议。
> 被 hook 提醒消息和 skill instructions 引用。

---

## 1. 原子动作要求

阶段完成后，以下两个动作**必须在同一个 AI turn 内完成**，不得拆分：

```
1. 输出一行摘要：✅ <阶段> 完成 → 自动进入 <下一阶段>
2. 立即调用：Skill(skill="forge", args="<next>")
```

**等价表述**：输出摘要 + 调用 Skill 是一个原子操作。中间不得插入任何其他动作（读文件、写文件、询问用户）。

---

## 2. 阶段过渡映射表

### 标准路径（Standard）

| 完成阶段 | 下一阶段 | 调用 |
|---------|---------|------|
| plan | build | `Skill(skill="forge", args="build")` |
| build | review | `Skill(skill="forge", args="review")` |
| review (通过) | test | `Skill(skill="forge", args="test")` |
| test (通过) | ship | `Skill(skill="forge", args="ship")` |
| ship | 完成 | 更新 status.md phase → completed |

### 全量路径（Full）

在标准路径基础上增加：

| 完成阶段 | 下一阶段 | 调用 |
|---------|---------|------|
| decide (用户确认) | spec | `Skill(skill="forge", args="spec")` |
| spec (用户锁定) | plan | `Skill(skill="forge", args="plan")` |
| ship (用户选择) | learn | `Skill(skill="forge", args="learn")` |
| learn | 完成 | 更新 status.md phase → completed |

### 轻量路径（Light）

| 完成阶段 | 下一阶段 | 调用 |
|---------|---------|------|
| build | review | `Skill(skill="forge", args="review")` |
| review (通过) | ship | `Skill(skill="forge", args="ship")` |

### 需要用户决策的阶段

| 阶段 | 决策方式 |
|------|---------|
| decide | AskUserQuestion: 确认方向/修改/否决 |
| spec | AskUserQuestion: 确认锁定/修改/拒绝 |
| plan | AskUserQuestion: 批准/修改/拒绝 |
| ship | AskUserQuestion: Merge/PR/Keep/Discard |
| package split | AskUserQuestion: 按建议拆分/调整边界/保留但生成执行包 |
| package-boundary resume | AskUserQuestion: 继续当前包/重新选择活跃包/暂停恢复 |

用户做出选择后，**立即**自动推进到下一阶段，不再二次确认。

---

## 3. 三种违规形态（铁律）

| 形态 | 举例 | 判定 |
|------|------|------|
| **显式询问** | "是否继续进入 review？" | ❌ 违规 |
| **工作量承诺** | "接下来要做 15 个任务，是否继续？" | ❌ 违规 |
| **隐式 idle** | 阶段完成后静默等待（无输出、无调用） | ❌ 违规（等同于显式询问） |

---

## 4. 失败时行为

| 失败阶段 | 停止行为 |
|---------|---------|
| review (未通过) | 输出问题清单 → 停止，提示：`修复后运行 /forge review` |
| test (未通过) | 输出失败详情 → 停止，提示：`修复后运行 /forge test` |
| 任何阶段出错 | 输出错误信息 → 停止，等待用户指示 |

失败时不调用下一阶段。用户决定如何处理后，手动或自动恢复。

---

## 5. 运行时强制

本协议通过 PostToolUse hook (`scripts/phase-transition-guard.sh`) 在运行时监控：

- 当 `.forge/status.md` 的 `phase` 字段发生过渡时
- hook 向 AI 上下文注入结构性提醒
- 提醒包含明确的 Skill 调用指令

hook 遵循 fail-open 设计：错误时不阻断工作流，仅提醒。
