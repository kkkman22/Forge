---
description: "Use when user runs `/tinkerman continue` — advance the current task to its next workflow phase without memorizing the phase sequence"
updated: 2026-08-11

dispatch_mode: inline
allowed_tools:
  - Read
  - Bash
---

## Current Context

Phase: !`grep '^phase:' .tinkerman/status.md 2>/dev/null || echo "no status"`
Tier: !`grep '^tier:' .tinkerman/status.md 2>/dev/null || echo "no tier"`
Task: !`grep '^current_task:' .tinkerman/status.md 2>/dev/null || echo "no task"`
Package: !`grep '^current_package:' .tinkerman/status.md 2>/dev/null || echo "no package"`
Review result: !`grep '^review_result:' .tinkerman/status.md 2>/dev/null || echo "none"`

# /tinkerman continue — 阶段推进器

> **触发方式**：用户输入 `/tinkerman continue`
> **职责**：读取 `.tinkerman/status.md` 当前 phase/tier，按工作流转换表推进到下一个合法 phase，调用对应子 skill
> **与 §2.7 No Confirmation Between Steps 的关系**：continue 是阶段推进的**程序化入口**，让用户无需记忆命令序列（plan→build→review→test→ship）。它把铁律从"靠各 skill 自觉触发下一个"升级为"单一入口显式推进"。
> **与 `/tinkerman loop` 的区别**：loop 是无人值守后台自主模式（批量推进直到终止）；continue 是交互式逐步推进（用户每次敲一下走一步）。两者共用同一套转换逻辑（`getNextPhase`）。

---

## 1. 推进流程

### Step 1: 读取状态

读取 `.tinkerman/status.md`（或 `.tinkerman/status/<task>.md` 多任务模式），提取字段：
- `phase` — 当前阶段
- `tier` — light / standard / full
- `work_nature` — feature / refactor / bugfix（影响序列）
- `current_package` — 当前包（多包推进时附加 `--package`）
- `review_result` — review 阶段的结果（passed / failed-p0 / failed-p1）
- `testPassed` — test 阶段是否通过

### Step 2: 终态检查

- `phase` 为 `completed` / `shipped` / `halted` → 输出 `✅ 任务已完成（phase=<phase>）`，**不推进**，退出。
- status.md 不存在或无 `current_task` → 输出 `ℹ 无 active task。请用 /tinkerman <任务描述> 开始，或 /tinkerman resume 恢复中断的任务。`，退出。

### Step 3: 门控检查（核心增量价值 — 程序化强制 §2.7 铁律）

对照 `getNextPhase` 的转换语义（`src/loop/phase-transitions.ts`），在推进前强制门控：

| 当前 phase | 门控条件 | 不满足时行为 |
|-----------|---------|------------|
| `review` | status.md 有 `review_result` 且非 `not-run` | **拒绝推进**：输出 `🚫 review 未完成。请先运行 /tinkerman review。` |
| `review`（结果为 failed-p0/p1） | — | **路由回 build**（recovery loop）：输出 `↩ review 失败（P0/P1 阻断），回 build 修复。` → 进入 build 子 skill |
| `test` | status.md 有 `testPassed: true` | **拒绝推进**：输出 `🚫 test 未通过。请先运行 /tinkerman test。` |
| `test`（未通过） | — | **路由回 build**：输出 `↩ test 未通过，回 build 修复。` → 进入 build 子 skill |
| 其他 phase | — | 直接进 Step 4 |

> 这把 §2.7 铁律的"review/test 必须有 pass 结果才推进"从"靠 skill 自觉"升级为"continue 命令程序化强制"。

### Step 4: 计算下一 phase

按 `getNextPhase(phase, tier, reviewResult)` 的表查找（对齐 `src/workflow-graph.ts` 的 DEFAULT_WORKFLOW_GRAPH SSOT）：

**Light tier** 序列：`build → review → completed`
**Standard tier** 序列：`plan → build → review → test → ship → completed`
**Full tier** 序列：`decide → spec → plan → build → review → test → ship → learn → completed`

review 结果分派（`REVIEW_DISPATCH`）：
- `passed` → 前进到 test
- `failed-p0` → 回 build
- `failed-p1` → 回 build

### Step 5: 生成调用参数并推进

按 `buildNextForgeArgs` 语义生成参数（含 `--package` 装饰当 `current_package` 存在）：

```
next_args = nextPhase
if nextPhase in [build, review, test] and current_package exists:
    next_args = f"{nextPhase} --package {current_package}"
```

输出推进提示后调用：

```
→ 推进到 <nextPhase>（tier=<tier>）
Skill(skill="forge", args="<next_args>")
```

## 2. 输出格式

成功推进：
```
→ continue: <currentPhase> → <nextPhase>（tier=<tier>）
<调用 Skill(forge, args=...)>
```

拒绝推进：
```
🚫 continue: <reason>
建议：<下一步命令>
```

终态/无任务：
```
ℹ continue: <reason>
```

## 3. 约束

- **不取代 loop**：continue 是 within-task 逐步推进；loop 是自主批量模式。
- **不绕过门禁**：Spec/Plan/Branch gate 由各子 skill 自己检查，continue 只负责"定位下一步 + 分发"。
- **不实现跨任务 continue**：跨任务恢复由 `/tinkerman resume` 负责。
- **转换表是 SSOT**：continue 是 `getNextPhase` 的消费者，不发明新转换。若 status.md 的 phase/tier 组合在表中无定义，输出错误并提示用户检查 status.md。
