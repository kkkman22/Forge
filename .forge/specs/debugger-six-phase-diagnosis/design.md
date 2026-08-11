---
feature: debugger-six-phase-diagnosis
layout: design
created: 2026-06-03
---

# Design Document: Debugger Agent 6 阶段结构化诊断循环

## Overview

本功能将 debugger agent 的 Investigation Protocol 从 5 步升级为 6 阶段结构化诊断循环，引入 feedback loop 构建策略、可证伪假设机制和架构问题 handoff。修改范围限定在 `.claude/agents/debugger.md` 的 Investigation Protocol 重写。

**灵感来源**：Matt Pocock `skills` 仓库的 `/diagnose` skill。

**修改范围**：
1. `.claude/agents/debugger.md` — 重写 Investigation Protocol（5 步 → 6 阶段循环）

**设计原则**：
- 保留现有的 Behavioral Rules、Prohibited Actions、Output Format 不变
- 保留现有的 3 次熔断机制（Phase 3-4 循环内集成）
- 新增 "无 loop = 不准假设" 的铁门
- 新增 "无正确 seam = 架构问题" 的 handoff 信号

## Architecture

### 现有实现分析

**当前 debugger.md Investigation Protocol**（5 步）：

| 步骤 | 内容 | Gap |
|------|------|-----|
| 1. 复现 | "能稳定触发吗？最小复现步骤是什么？" | 只有一句话，没有具体的 loop 构建策略 |
| 2. 收集证据 | 并行：完整错误信息 + git log + 正常代码对比 + 出错位置代码 | 合理，保留 |
| 3. 假设 | "对比正常和异常代码，形成假设，记录后再深入" | 只说"一次一个假设"，未要求生成 3-5 个可证伪假设 |
| 4. 修复 | "推荐一个改动，预测验证方式，检查同类问题" | 合理，与 Matt Phase 5 对齐 |
| 5. 熔断 | "3 次假设失败后停止，上报架构层面分析" | 有熔断但无 post-mortem |

**缺失的关键设计**：
1. 没有 10 种 feedback loop 构建方式目录——agent 不知道有哪些 loop 可选
2. 没有 "建不出 loop 就不进入假设" 的铁门——agent 会无目的读代码
3. 没有 `[DEBUG-xxxx]` 前缀标记和 cleanup 机制——debug log 残留
4. 没有 "什么能防止这个 bug？" post-mortem——错过架构改进机会
5. 没有 "无正确 test seam → 架构问题" handoff——修完 bug 就走了

### 修改拓扑

```
.claude/agents/debugger.md
  ├── Core Principles（保留不变）
  ├── Use Cases（保留不变）
  ├── Investigation Protocol（重写：5 步 → 6 阶段）
  │     ├── Phase 1 — Build a Feedback Loop（新增，含 10 种方式）
  │     ├── Phase 2 — Reproduce（增强：3 项确认 checklist）
  │     ├── Phase 3 — Hypothesise（增强：3-5 可证伪假设 + 用户排序）
  │     ├── Phase 4 — Instrument（增强：[DEBUG-xxxx] 标记 + 性能分支）
  │     ├── Phase 5 — Fix + Regression Test（增强：无 seam = 架构发现）
  │     └── Phase 6 — Cleanup + Post-mortem（新增）
  ├── Output Format（保留不变，字段映射到 6 阶段）
  ├── Behavioral Rules（保留不变）
  └── Prohibited Actions（保留不变）
```

## Components and Interfaces

### Phase 1 — Build a Feedback Loop

**核心原则**："This is the skill. Everything else is mechanical."

10 种构建方式（按优先级）：

| # | 方式 | 说明 |
|---|------|------|
| 1 | 失败测试 | 在能触达 bug 的 seam 写 failing test |
| 2 | Curl / HTTP 脚本 | 对运行中的 dev server 发请求 |
| 3 | CLI 调用 | fixture 输入，diff stdout vs 已知快照 |
| 4 | Headless browser | Playwright/Puppeteer 驱动 UI |
| 5 | 重放 trace | 保存真实请求到磁盘，隔离重放 |
| 6 | 一次性 harness | 最小子系统 + mock deps，单函数调用 |
| 7 | 属性/模糊测试 | 1000 随机输入找失败模式 |
| 8 | 二分 harness | `git bisect run` |
| 9 | 差分循环 | 同输入跑旧版 vs 新版，diff 输出 |
| 10 | HITL bash 脚本 | 最后手段，脚本驱动人类操作 |

**Loop 优化迭代**：更快？更清晰？更确定？

**铁门**：当确实建不出 loop 时，停下来告知用户试了什么，请求环境/artifacts/临时监控。**不进入 Phase 2。**

### Phase 2 — Reproduce

3 项确认 checklist：
- Loop 产生的是用户描述的失败模式
- 失败在多次运行中可复现
- 已捕获确切症状供后续验证

### Phase 3 — Hypothesise

- 生成 3-5 个**可证伪**假设（格式："如果 `<假设>` 是原因，那么 `<干预>` 会让 bug 消失"）
- 展示排序列表给用户后再测试
- 无法表述预测 = 假设是一个感觉，丢弃或锐化

### Phase 4 — Instrument

- 每个探针对应 Phase 3 的一个具体预测
- **一次只变一个变量**
- **`[DEBUG-xxxx]` 前缀标记**所有 debug log
- 性能回归分支：建立基线测量，二分而非 log

### Phase 5 — Fix + Regression Test

- 修复前写回归测试（仅当存在正确 seam）
- **正确 seam** = 测试在调用点 exercising 真实 bug 模式
- **如果不存在正确 seam，这本身就是发现**——记录，标记给 Phase 6

### Phase 6 — Cleanup + Post-mortem

- 5 项 cleanup checklist（原始复现不再复现、回归测试通过、[DEBUG-...] 清除、prototype 删除、正确假设写入 commit）
- **Post-mortem 问题**："什么能防止这个 bug？"
- 如果答案涉及架构变更 → 输出 handoff 建议（`🔧 架构改进建议`）

### 与现有 3 次熔断的集成

Phase 3-4 循环中同一假设验证连续失败 3 次：
1. 停止当前假设
2. 回到 Phase 3 生成新假设列表（排除已失败）
3. 所有假设穷尽 → 输出架构分析，建议 `/forge decide`

### Output Format 映射

保留现有 Bug Report 格式，字段映射：
- **Symptom** ← Phase 2 确切症状
- **Root Cause** ← Phase 4/5 确认的假设
- **Reproduction** ← Phase 1 feedback loop 描述
- **Fix** ← Phase 5 最小改动
- **Verification** ← Phase 6 cleanup checklist
- **Similar Issues Check** ← Phase 6 post-mortem 横向扫描

## Edge Cases

| 情况 | 处理 |
|------|------|
| 非确定性 bug | 目标是提高复现率而非干净复现；50% 可调试，1% 不行 |
| 真的建不出 loop | 停下来请求用户帮助，不进入 Phase 2 |
| Phase 3 所有假设穷尽 | 输出架构分析，建议 `/forge decide` |
| Bug 修复后发现架构问题 | Phase 6 handoff 到 refactor/decide |

## Out of Scope

- 不改变 `skills/forge/lib/build/instructions.md` §5.1 Three-strike 触发逻辑
- 不改变 `forge-debug` skill 的 instructions.md（如存在）
- 不改变 debugger 的 model/maxTurns/memory 配置
- 不新增独立 skill（保持 debugger 作为 agent）
