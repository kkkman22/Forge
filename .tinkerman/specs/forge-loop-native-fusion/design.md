---
feature: forge-loop-native-fusion
layout: design
created: 2026-06-01
---

# Design Document: Forge Loop 原生融合

## Overview

将 forge-loop 从独立子系统（CLI + SDK driver + Desktop App）重构为基于 Claude Code 原生调度工具（ScheduleWakeup / CronCreate）的轻量 skill。调度委托给平台，Forge 只保留决策逻辑（阶段流转、质量门禁、Git 事务）。

**核心变更**：~2000 行核心代码 → ~300 行 skill instructions + 1 个状态 JSON schema。

## 架构

### 旧架构 vs 新架构

```
旧架构（删除）:
  用户终端
    → forge-loop CLI (独立进程)
      → CliSubprocessDriver (子进程管理)
        → Claude Code API (SDK)
          → /forge phases (子进程内)
    维护: CLI + SDK + 子进程管理 + Desktop App + npm 包

新架构（融合）:
  用户在 Claude Code 内: /forge loop "做X"
    → Forge dispatcher (fork dispatch)
      → loop skill (instructions.md)
        → 读取 .tinkerman/progress/loop-{id}.json
        → 执行 /forge {phase} (Skill tool)
        → 质量门禁 + Git 事务
        → ScheduleWakeup / CronCreate (调度下次)
    维护: 1 个 skill 文件 + 状态 JSON schema
```

### 每次迭代的决策流程

```
ScheduleWakeup 触发 → prompt: "/forge loop continue {id}"
  │
  ├─ 1. 读取 loop state (.tinkerman/progress/loop-{id}.json)
  │
  ├─ 2. 质量门禁检查
  │     ├─ consecutiveFailures >= 3? → halted + rollback
  │     ├─ stopWhen 满足? → complete + 总结
  │     └─ phase == complete/halted? → 输出状态 + 终止
  │
  ├─ 3. 执行当前阶段
  │     ├─ 调用 Skill(forge, args: "{phase} {goal}")
  │     ├─ 等待阶段完成
  │     └─ 收集结果（成功/失败 + 摘要）
  │
  ├─ 4. 后处理
  │     ├─ 成功: consecutiveFailures=0 + git commit + 记录 lastSuccessCommit
  │     └─ 失败: consecutiveFailures++ + (>=3 则 rollback)
  │
  ├─ 5. 阶段流转
  │     ├─ 查流转表确定下一 phase
  │     └─ 更新 loop state
  │
  └─ 6. 调度下一次
        ├─ 根据 {结果, 失败次数, 阶段} 选择 delaySeconds
        └─ ScheduleWakeup(prompt: "/forge loop continue {id}", delaySeconds)
```

## Components

### C1: Loop State Schema

**文件**: `.tinkerman/progress/loop-{id}.json`

```jsonc
{
  // 身份
  "id": "abc12345",                    // 8 字符随机 ID
  "goal": "为用户 API 添加分页功能",     // 用户原始目标

  // 状态
  "phase": "build",                    // init|decide|spec|plan|build|review|test|ship|learn|complete|halted
  "consecutiveFailures": 0,            // 连续失败计数
  "totalIterations": 7,                // 总迭代次数
  "tier": "standard",                  // light|standard|full

  // Git 事务
  "lastSuccessCommit": "a1b2c3d",      // 最后成功提交的 hash
  "branch": "forge/loop-abc12345",     // loop 工作分支

  // 终止条件
  "stopWhen": null,                    // 用户声明的终止条件字符串

  // 调度
  "lastScheduledAt": "2026-06-01T10:30:00Z",
  "nextScheduledReason": "phase transition: build → review",

  // 诊断
  "createdAt": "2026-06-01T10:00:00Z",
  "phaseHistory": [
    {"phase": "plan", "startedAt": "...", "completedAt": "...", "result": "success"},
    {"phase": "build", "startedAt": "...", "completedAt": "...", "result": "success"}
  ],
  "lastReviewResult": null,            // {p0: N, p1: N} 或 null
  "haltReason": null                   // Three-strike 原因或 null
}
```

### C2: 阶段流转表

内嵌在 skill instructions.md 中的决策表，无独立代码模块：

```
// 由 tier 和当前 phase 决定下一 phase
function nextPhase(tier, currentPhase, lastReviewResult):
  switch (currentPhase):
    case "init":
      return tier == "light" ? "build"
           : tier == "standard" ? "plan"
           : "decide"
    case "decide": return "spec"
    case "spec":   return "plan"
    case "plan":   return "build"
    case "build":  return "review"
    case "review":
      if (lastReviewResult?.p0 > 0 || lastReviewResult?.p1 > 0)
        return "build"  // P0/P1 → 回到 build 修复
      return "test"
    case "test":   return "ship"
    case "ship":   return "learn"
    case "learn":  return "complete"
    default:       return "halted"
```

### C3: 调度策略表

内嵌在 skill instructions.md 中的 delay 选择逻辑：

```
function selectDelay(phase, consecutiveFailures, nextPhase):
  if (consecutiveFailures >= 2) return 300    // 5 min — 失败后退
  if (consecutiveFailures == 1) return 120    // 2 min — 谨慎重试
  if (nextPhase == "learn") return 120        // 2 min — learn 不急
  return 60                                   // 1 min — 正常推进
```

### C4: Git 事务工具函数

通过 skill instructions 中的 Bash 命令实现，无独立代码模块：

```
成功提交:
  git add -A
  git commit -m "feat(loop): {phase} complete — {goal摘要前50字符}"

回滚:
  if (lastSuccessCommit)
    git reset --hard {lastSuccessCommit}
  else
    git stash push -m "loop-{id}-emergency-stash"
```

### C5: Skill Instructions (`skills/forge/lib/loop/instructions.md`)

**职责**: 整个 loop 的决策大脑，单文件承载所有逻辑。

**结构**:

```markdown
---
description: "Forge autonomous loop: plan→build→review→test→ship on autopilot"
dispatch_mode: fork
allowed_tools: Read, Agent, Bash, Skill, Glob, Grep, CronCreate, CronList, CronDelete, ScheduleWakeup
---

# Forge Loop

## 1. 入口路由
  - /forge loop "<goal>"        → 初始化
  - /forge loop continue <id>   → 恢复迭代
  - /forge loop status          → 查看状态
  - /forge loop abort <id>      → 中止

  注：所有入口通过 dispatcher 标准格式，第一个 token `loop` 匹配 allowlist，剩余部分作为 args 传递。ScheduleWakeup/CronCreate 的 prompt 参数统一使用 `/forge loop continue {id}`。

## 2. 初始化流程
  [创建 loop state → 确定 tier → 创建分支 → 启动首阶段]

## 3. 迭代决策循环
  [读取 state → 门禁检查 → 执行阶段 → 后处理 → 流转 → 调度]

## 4. 阶段流转表
  [C2 的完整决策表]

## 5. 调度策略
  [C3 的 delay 选择逻辑]

## 6. Git 事务
  [C4 的提交/回滚命令]

## 7. 诊断与总结
  [输出格式、phase history 读取]

## 8. 错误处理
  [Three-strike、阶段失败分类、回滚触发条件]

## 9. 平台兼容
  [ScheduleWakeup 不可用时 fallback 到 CronCreate]
```

### C6: 决策流（与 dispatcher 的交互）

loop skill 作为 sub skill 通过 Forge dispatcher 的 fork 模式执行。关键交互点：

1. **初始化**：用户 `/forge loop "做X"` → dispatcher → fork dispatch → loop skill
2. **阶段执行**：loop skill 内部调用 `Skill(forge, args="build 做X")` → dispatcher → fork dispatch → build skill
3. **调度**：loop skill 直接调用 `ScheduleWakeup` 或 `CronCreate`，prompt 固定为 `/forge loop continue {id}`
4. **恢复**：ScheduleWakeup 触发 → Claude Code 执行 prompt → `/forge loop continue {id}` → dispatcher 匹配 `loop` → fork dispatch → loop skill → 读取 state → 继续

## 冲突分析总结

| 机制 | 冲突？ | 处理 |
|------|--------|------|
| Forge dispatcher (ADR-0004) | 无 | loop 通过 dispatcher fork dispatch 执行，标准路径 |
| ADR-0007 (loop 永久 Subagent) | 无 | 融合后仍通过 Agent tool fork，符合 ADR |
| §2.1 TDD Enforcement | 无 | loop 执行 /forge build 时，build skill 自身执行 TDD |
| §2.2 Pre-build Checks | 无 | Spec 锁定/Plan 批准仍由各阶段 skill 检查 |
| §2.3 Verification Iron Law | 无 | loop 在阶段成功后执行验证命令，失败则不计为成功 |
| §2.4 Three-strike | 增强 | loop 层面的 Three-strike 是阶段级，与 build 内部的 strike 独立且叠加 |
| §2.7 No Confirmation Between Steps | 无 | loop 自动推进阶段，天然不需要阶段间确认 |
| §3 Review Discipline | 无 | loop 执行 /forge review，review skill 自身用独立 subagent |
| §6 Session Boundaries | 增强 | loop state 通过文件系统跨会话，不依赖对话历史 |
| build-goal-replace-loop | 替代 | 旧 `persistent-loop.sh` 被 ScheduleWakeup 替代，build 内 /goal 驱动不变 |
| Workflow Fallback Ladder | 无 | loop skill 是普通 skill，走 L1 subagent-parallel 路径 |

## 退役计划

### 删除清单

| 路径 | 类型 | 说明 |
|------|------|------|
| `src/forge-loop-cli.ts` | 源码 | 44KB CLI 主文件 |
| `src/loop-types.ts` | 源码 | 旧类型定义 |
| `src/loop-error-controller.ts` | 源码 | 旧错误控制器 |
| `src/verify-loop.ts` | 源码 | 旧验证逻辑 |
| `src/retry-loop.ts` | 源码 | 旧重试逻辑 |
| `src/loop-index.ts` | 源码 | 旧统一导出 |
| `scripts/persistent-loop.sh` | 脚本 | 旧外部驱动 |
| Desktop App 相关目录 | 产物 | Tauri + Vue 3 前端 |
| `test/forge-loop-cli.test.ts` | 测试 | 旧 CLI 测试 |
| `test/verify-loop.test.ts` | 测试 | 旧验证测试 |
| `test/loop-integration.test.ts` | 测试 | 旧集成测试 |
| `test/loop-skill-integration.test.ts` | 测试 | 旧 skill 集成测试 |
| `test/loop-orchestrator.property.test.ts` | 测试 | 旧属性测试 |
| `test/retry-loop.test.ts` | 测试 | 旧重试测试 |
| `package.json` bin/exports 相关条目 | 配置 | forge-loop CLI 入口 |

### 保留清单

| 路径 | 说明 |
|------|------|
| `skills/forge/lib/loop/instructions.md` | 重写为新的融合方案 |
| `skills/forge/lib/loop/references/` | references 目录保留，内容按需更新 |
| `.tinkerman/progress/build-goal-replace-loop.md` | 历史记录保留 |

## 测试策略

### 单元测试（vitest）

| 测试文件 | 覆盖范围 |
|----------|---------|
| `test/loop/state-schema.test.ts` | loop state JSON schema 校验、字段完整性 |
| `test/loop/phase-transition.test.ts` | 阶段流转表正确性（所有 tier × 所有 phase 组合） |
| `test/loop/scheduling-strategy.test.ts` | delaySeconds 选择逻辑（失败次数 × 阶段组合） |
| `test/loop/three-strike.test.ts` | Three-strike 触发条件、Git 回滚逻辑 |
| `test/loop/stopwhen-evaluation.test.ts` | stopWhen 条件评估 |
| `test/loop/idempotent-resume.test.ts` | 幂等恢复（重复 continue 不重复执行已完成阶段） |

### 集成测试（manual / smoke）

| 场景 | 验证方式 |
|------|---------|
| `/forge loop "修复 lint 错误"` → Light tier → 自动 build → review → ship | Manual smoke test |
| Three-strike 触发 → Git 回滚 → phase=halted | Manual smoke test |
| 关闭终端 → `claude --resume` → `/forge loop continue {id}` | Manual smoke test |
| `/forge loop "做X" --stop-when "所有测试通过"` → 条件满足后自动终止 | Manual smoke test |
| Bedrock/Vertex 环境 → CronCreate fallback | Manual（需对应环境） |

### 契约测试

| 测试 | 断言 |
|------|------|
| `test/loop/dispatch-mode.test.ts` | loop skill frontmatter 含 `dispatch_mode: fork` |
| `test/loop/allowed-tools.test.ts` | `allowed_tools` 包含 `ScheduleWakeup, CronCreate, CronDelete, CronList` |
| `test/loop/no-legacy-imports.test.ts` | grep 仓库确认无 `forge-loop-cli`、`sdk-driver`、`CliSubprocessDriver` 引用 |
