---
name: forge-storm
description: "Capture domain events, commands, aggregates, policies, and read models through Socratic event-storming prompts into a structured output file. Use when running `/forge storm <context>`, exploring a new Bounded Context, or building a domain model before writing specs."
skeleton_exempt_legacy: true
disable-model-invocation: true
---

# /forge storm — Event Storming 引导

> **触发方式**：`/forge storm <context>` 或探索新 Bounded Context 时
> **职责**：通过 Socratic 问答逐阶段收集领域事件、命令、聚合、策略和读模型
> **输出路径**：`.forge/contexts/<context>/event-storm.md`

---

## 1. Overview

Event Storming 是一种快速领域建模技术。forge-storm 通过 5 个阶段逐一引导，产出结构化的 event-storm.md，为后续 `/forge spec` 提供领域模型输入。

**核心原则**：一个问题一轮，从自然语言提取结构化条目，Socratic 引导而非填表。

**Not For**：小改动（Light 路径）、领域已充分理解时、实现细节讨论。

## 2. When to Use

- 设计新 Bounded Context 时
- 探索 Core Subdomain 业务规则时
- `/forge decide` 前需要领域建模输入时
- 团队需要统一领域语言时

**不适用**：小范围改动、已充分理解的领域、纯技术实现讨论。

## 3. Five-Phase Flow

| Phase | Color | Key Question |
|-------|-------|-------------|
| 1. Domain Events | 橙色 | "什么事情在业务中发生后值得记录？" |
| 2. Commands | 蓝色 | "哪些命令会触发这些事件？" |
| 3. Aggregates | 黄色 | "哪些 Command + Event 应由同一个一致性边界守护？" |
| 4. Policies | 紫色 | "哪些 event 自动触发下一步 command？" |
| 5. Read Models | 绿色 | "哪些视图/报表从 events 投影？" |

每阶段：提问 → 收集 → 保存状态 → 自动推进（§2.7 无中间确认）。

## 4. Interactive Patterns

- **一轮一问**：每轮只问一个问题，等待用户回答。
- **结构提取**：从自然语言回答中提取结构化 Event/Command/Aggregate 等。
- **完成信号**：接受"差不多了"、"这些够了"、"next" 作为阶段完成信号。
- **最低门槛**：每阶段至少 3 个条目后才建议进入下一阶段。
- **补充追问**：条目不足时追问边界情况（"取消呢？"、"超时呢？"）。

## 5. Output Format

输出文件：`.forge/contexts/<context>/event-storm.md`

```yaml
---
context: <context-name>
started_at: "<ISO timestamp>"
last_updated: "<ISO timestamp>"
phase_completed: <events|commands|aggregates|policies|read_models>
---
```

五个 markdown section：`## Events`、`## Commands`、`## Aggregates`、`## Policies`、`## Read Models`。
每条目格式：`- **Name** — 描述。来源：trigger`

→ 完整示例见 references/example-storm.md

## 6. Resuming Interrupted Session

读取已有 `.forge/contexts/<context>/event-storm.md` → 检查 `phase_completed` → 从下一阶段继续。

流程：检查文件 → 解析 frontmatter → 确认已完成阶段 → 继续未完成阶段。

若文件损坏或格式错误，提示用户重新开始或手动修正。

## 7. Execution Flow

1. **检查** `.forge/contexts/<context>/event-storm.md` 是否存在
2. **加载或初始化** StormState（使用 `src/storm.ts` 中的函数）
3. **当前阶段**：提出 Socratic 问题
4. **用户回答** → 提取条目 → `saveStormState`
5. **阶段完成** → 自动推进下一阶段（§2.7 no-mid-step-confirmation）
6. **5 阶段全部完成** → `serializeStormMarkdown` → 输出最终文件
7. **建议**：`"可用 /forge spec 基于此风暴启动 spec 生成"`

**函数映射**：

| 概念 | 函数调用 | 参数 | 返回 |
|------|---------|------|------|
| 初始化 | `initStormState(context)` | context name | `StormState` |
| 保存 | `saveStormState(state)` | 当前 StormState | void（写入文件） |
| 序列化 | `serializeStormMarkdown(state)` | 完成的 StormState | markdown string |

## 8. Examples

**Phase 1 示例对话（PMS Reservations Context）**：

```
AI: 我们来梳理 Reservations Context 的领域事件。
    第一个问题：在预订业务中，什么事情发生后值得记录？
    比如客人创建了一个新预订？

User: 客人可以在网上预订房间，预订后需要支付定金确认，
      也可以取消预订。到店后前台办理入住，离店时退房。
      如果预订了但没来，夜审会标记为 NoShow。

AI: 提取到 6 个领域事件：
    - ReservationBooked — 新预订已创建
    - ReservationConfirmed — 预订已支付定金确认
    - ReservationCancelled — 预订被取消
    - GuestCheckedIn — 客人完成入住
    - GuestCheckedOut — 客人完成退房
    - NoShowDeclared — 未入住声明
    还有遗漏的事件吗？（如：房间变更、延期退房）
```

---

## Common Rationalizations

| 合理化 | 反驳 |
|--------|------|
| "我们已经很了解这个领域了" | Storming 能暴露隐藏假设和边界情况 |
| "事件就是 CRUD 操作" | 事件捕捉业务语义，不是数据操作 |
| "这太花时间了" | 30 分钟风暴节省数天返工 |
| "直接写代码更快" | 没有领域模型的代码只是在堆 if-else |
| "业务人员没空参加" | forge-storm 允许异步逐轮进行 |
