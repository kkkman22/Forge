---
feature: architect-design-it-twice
layout: design
created: 2026-06-03
---

# Design Document: Architect Agent "Design It Twice" 多方案并行设计模式

## Overview

本功能为 architect agent 新增条件触发的 "Design It Twice" 多方案并行设计模式。当评估的问题涉及 interface/API/schema 设计时，architect agent 产出 3 个根本不同的设计方案并给出强推荐，而非只输出一个技术方案。同时引入统一的架构术语体系，使架构讨论语言一致。

**灵感来源**：Matt Pocock `skills` 仓库的 `/improve-codebase-architecture` skill + `INTERFACE-DESIGN.md` + `LANGUAGE.md`。

**修改范围**：
1. `.claude/agents/architect.md` — 追加 "Design It Twice" 条件分支 + 统一架构术语
2. `.claude/agents/forge-decide-arch.md` — 同步追加（Agent Teams 模式）

**设计原则**：
- 条件触发，不是所有 decide 都走多方案设计
- 方案在 architect agent 输出内直接呈现（inline），不 spawn 额外 subagent
- 保持 500 tokens 输出限制（多方案设计时允许扩展到 800 tokens）

## Architecture

### 现有实现分析

**`.claude/agents/architect.md`** 当前行为：
- 评估 4 个维度：Tech Stack Suitability / Architecture Risks / Scalability / Compatibility
- 输出单个 Technical Solution（Tech Selection + Risks + Scalability + Compatibility）
- 500 tokens 限制
- 可以引用和质疑其他视角结论

**`.claude/agents/forge-decide-arch.md`** 当前行为：
- Agent Teams 模式的架构 teammate
- 只读（disallowedTools: Write, Edit, Bash, Agent）
- 同样输出 4 小节（核心立场 / 关键权衡 / 建议 / Follow-up）

**Gap**：
1. 两个 architect agent 都只产出**一个**方案。Ousterhout 指出"你的第一个设计几乎不会是最好的"
2. 没有利用多方案对比来探索设计空间
3. 没有统一的架构术语——讨论中可能 drift 成 "component/service/API/boundary"

### 修改拓扑

```
.claude/agents/architect.md
  ├── Identity（保留）
  ├── Evaluation Dimensions（保留）
  ├── Design It Twice（新增，条件触发）
  │     ├── 触发条件判断
  │     ├── 3 方案设计（Minimal / Flexible / Common-Case）
  │     ├── 综合比较（Depth / Locality / Seam Placement）
  │     └── 强推荐
  ├── 架构术语（新增）
  ├── Behavioral Rules（保留）
  └── Output Format（增强：条件分支输出）

.claude/agents/forge-decide-arch.md
  └── 同步追加 Design It Twice + 架构术语
```

## Components and Interfaces

### Component 1: 触发条件判断

| 触发 Design It Twice | 不触发（保持单方案） |
|----------------------|---------------------|
| 需要设计新的 interface 或 API | 评估已有技术选型的风险 |
| 需要定义数据 schema 或类型结构 | 分析可扩展性上限 |
| 需要决定模块间的 seam 位置 | 安全或性能评估 |
| 多个合理的模块划分方案 | 与现有系统兼容性检查 |

### Component 2: 3 方案设计

| 方案 | 约束方向 | 适用场景 |
|------|---------|---------|
| **Minimal** | 最小化 interface，1-3 入口点，最大化 leverage | 需求明确、调用场景单一 |
| **Flexible** | 最大化灵活性，支持多种用例和扩展 | 未来需求不确定、需预留扩展点 |
| **Common-Case** | 优化最常见调用者，默认路径零摩擦 | 有明确的 primary caller |

每个方案包含：
- Interface 定义（方法签名 + 参数 + 返回值 + 不变量）
- 使用示例（caller 怎么用）
- 实现隐藏了什么（seam 背后的复杂度）
- Trade-offs（leverage 高的地方 / 薄弱的地方）

### Component 3: 综合比较 + 强推荐

- 按 **Depth**（interface 杠杆率）、**Locality**（变更集中度）、**Seam Placement**（seam 位置合理性）三个维度对比
- 给出**强推荐**：哪个方案最强，为什么
- 如果不同方案的元素可以组合，提出混合方案
- **给推荐，不是给菜单**

### Component 4: 统一架构术语

| 术语 | 定义 | 禁用替代 |
|------|------|---------|
| Module | 任何有 interface + implementation 的东西 | 不用 "component" |
| Interface | caller 需要知道的一切 | 不用 "API"（指 module 级别时） |
| Depth | interface 杠杆率：小 interface 背后行为多 = 深 | — |
| Seam | interface 存在的位置 | 不用 "boundary" |
| Adapter | 在 seam 上满足 interface 的具体实现 | — |
| Leverage | caller 从 depth 获得的好处 | — |
| Locality | 维护者从 depth 获得的好处 | — |

**Deletion Test**：对任何怀疑是 shallow 的模块，想象删掉它——复杂度消失了 = pass-through，复杂度分散到 N 个 caller = 它在赚存在价值。

### Output Format 增强

未触发 Design It Twice 时，输出格式不变。

触发时，输出格式变为：

```markdown
### Technical Solution — Design It Twice

**问题空间**: <2-3 句描述约束和依赖>

**方案 A — Minimal**: <interface 定义 + 使用示例 + trade-offs>
**方案 B — Flexible**: <interface 定义 + 使用示例 + trade-offs>
**方案 C — Common-Case**: <interface 定义 + 使用示例 + trade-offs>

**对比**: Depth: <比较> / Locality: <比较> / Seam: <比较>

**推荐**: <强推荐 + 理由>
```

tokens 限制：Design It Twice 触发时允许扩展到 **800 tokens**（从 500 提升）。

## Edge Cases

| 情况 | 处理 |
|------|------|
| 任务既涉及 interface 设计又涉及风险评估 | Design It Twice 部分 + 风险评估部分都输出，控制在 800 tokens |
| 方案空间太小（只有一种合理设计） | 不触发 Design It Twice，走单方案路径 |
| architect 无法确定是否涉及 interface 设计 | 默认不触发（宁缺毋滥） |
| forge-decide-arch 的 Agent tool 被禁用 | inline 方式输出 3 方案，与 architect.md 一致 |

## Out of Scope

- 不改变 decide 的 Round 1/Round 2 流程
- 不改变其他 4 个视角 agent（product/security/ops/cost）
- 不引入新的独立 agent
- 不改变 forge-decide-arch 的 maxTurns/model/memory 配置
