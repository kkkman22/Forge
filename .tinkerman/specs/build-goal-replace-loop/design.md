---
feature: build-goal-replace-loop
layout: design
created: 2026-05-30
---

# Design Document: Build /goal 替代 persistent-loop + CI sandbox

## Overview

用 Claude Code 的 `/goal` 命令替代 `persistent-loop.sh` 的 build 内 TDD 循环职责。persistent-loop.sh 缩减为仅负责 phase transition。同时在 CI 中添加 sandbox 安全配置。

**变更范围**：
- 修改 `skills/forge/lib/build/instructions.md`（/goal 循环逻辑）
- 修改 `skills/forge/lib/loop/instructions.md`（更新循环说明）
- 修改 `.tinkerman/config.md`（新增 `build.use_goal: true`）
- 修改 `.github/workflows/ci.yml`（sandbox 配置）
- 可选修改 `scripts/persistent-loop.sh`（移除 TDD 循环部分，保留 phase transition）

**不涉及**：`/goal` 命令本身（Claude Code 内置）、phase transition 的检测逻辑。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│              /forge build                                │
└──────────────────────────┬──────────────────────────────┘
                           │
               ┌───────────▼────────────┐
               │  build.use_goal?        │
               │  true → /goal 模式      │
               │  false → persistent-loop│
               └───────────┬────────────┘
                           │ (use_goal=true)
               ┌───────────▼────────────────────┐
               │ /goal: "所有 task 完成 + check 通过"│
               │                                  │
               │  每次迭代:                        │
               │  1. 读取下一个未完成 task          │
               │  2. RED → 写失败测试              │
               │  3. GREEN → 最小实现               │
               │  4. REFACTOR → 清理                │
               │  5. 标记 task 完成                  │
               │  6. 检查 Three-Strike              │
               │                                  │
               │  Live: elapsed/turns/tokens        │
               └──────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│          Stop hook: persistent-loop.sh                    │
│                                                          │
│  职责缩减（移除 TDD 循环部分）：                           │
│  - 检测 .tinkerman/status.md 的 phase                        │
│  - phase=plan 完成 → 自动 /forge build                   │
│  - phase=build 完成 → 自动 /forge review                 │
│  - phase=review 完成 → 自动 /forge test                  │
│  - phase=test 完成 → 自动 /forge ship                    │
│  - phase=build 且未完成 → 不触发（/goal 正在处理）        │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### Component 1: build/instructions.md 修改

**当前行为**：build instructions 引导 agent 逐个完成 task，依赖 Stop hook 的 persistent-loop.sh 自动重新触发。

**新行为**：

```markdown
## Build 执行流程（/goal 模式）

当 `build.use_goal` 为 `true`（默认）时：

1. 读取 `.tinkerman/plans/<slug>.md` 获取所有 task
2. 读取 `.tinkerman/config.md` 获取 `ci_check_command`
3. 启动 /goal，目标条件："所有 task 标记完成 AND ci_check_command 通过"

/goal 每次迭代：
1. 读取下一个未完成 task（TaskGet）
2. 标记为 in_progress（TaskUpdate）
3. RED → 写失败测试
4. GREEN → 最小实现通过测试
5. REFACTOR → 清理代码
6. 运行相关测试验证
7. 标记为 completed（TaskUpdate）
8. 原子 commit

Three-Strike 检测：
- 同一 task 连续失败 3 次 → 停止 /goal → 进入 /forge debug

/goal 完成后：
- 运行 ci_check_command 全量验证
- 输出 ✅ build 完成
```

### Component 2: persistent-loop.sh 修改

**移除**：build 内 TDD 循环的重试逻辑。
**保留**：phase transition 检测和自动触发。

修改位置：在 `phase=build` 的处理分支中，检查 `/goal` 是否正在运行（或直接跳过，因为 /goal 在 build instructions 内处理完成）。

### Component 3: config.md 变更

```yaml
# 新增
build:
  use_goal: true  # true=使用 /goal 循环，false=旧 persistent-loop
```

### Component 4: ci.yml 变更

```yaml
# 在需要 Claude Code 的 step 中添加
- name: Run ultrareview
  env:
    SANDBOX_FAIL_IF_UNAVAILABLE: "1"
  run: ...
```

## Key Design Decisions

| Decision | Chosen Path | Rejected Path | Reason |
|----------|-------------|---------------|--------|
| /goal 集成方式 | 替代 persistent-loop TDD 循环 | 并行运行 | 职责清晰，避免双重循环 |
| persistent-loop 保留 | 仅 phase transition | 完全移除 | phase transition 仍需 Stop hook 触发 |
| 默认值 | `use_goal: true` | `false`（保守） | /goal 是更优的机制，应默认启用 |
| CI sandbox 范围 | 仅 Claude Code step | 所有 step | 普通 npm test 不需要 sandbox |

## Error Handling

| 场景 | 行为 |
|------|------|
| /goal 循环超限（token 预算耗尽） | /goal 内置停止 + 建议 /clear + resume |
| Three-Strike 触发 | 停止 /goal → 进入 /forge debug |
| `ci_check_command` 持续失败 | Three-Strike 触发 |
| persistent-loop.sh 检测到 phase=build 未完成 | 不触发（/goal 在 instructions 内处理） |
| CI sandbox 不可用 | SANDBOX_FAIL_IF_UNAVAILABLE=1 阻断 |

## Testing Strategy

1. **手动验证**：`/forge build` → 观察 /goal 自动循环
2. **手动验证**：连续失败 task → 确认 Three-Strike 触发
3. **手动验证**：`build.use_goal: false` → 确认回退到旧行为
4. **CI 验证**：推送 PR → 确认 sandbox 配置生效
5. **回归验证**：`npm run check` 通过
