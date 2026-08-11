---
description: "Use when running `/tinkerman storm <context>`, exploring a new Bounded Context, or building a domain model before writing specs"
context: fork

dispatch_mode: fork
allowed_tools:
  - Read
  - Write
  - Agent
---

# /tinkerman storm — Event Storming 引导

> **触发方式**：`/tinkerman storm <context>` 或探索新 Bounded Context 时
> **职责**：通过 Socratic 问答逐阶段收集领域事件、命令、聚合、策略和读模型
> **输出路径**：`.forge/contexts/<context>/event-storm.md`

---

## 1. Goal

Produce a structured event-storm document (`.forge/contexts/<context>/event-storm.md`) that captures the domain model of a Bounded Context — events, commands, aggregates, policies, and read models — through Socratic dialogue, yielding input for `/tinkerman spec`.

**Constraints**:
- One question per turn. Extract structured entries from natural language answers — never present a form to fill.
- Accept signals like "差不多了", "这些够了", "next" as phase completion.
- Each phase must collect at least 3 entries before suggesting advancement. When entries are thin, probe edge cases ("取消呢？", "超时呢？").
- Phases advance automatically without mid-step confirmation (§2.7).
- **Not For**: small changes (Light tier), well-understood domains, implementation details.

## 2. Domain Coverage

**Goal**: Cover five domain-modeling perspectives, in any order you choose, ensuring each is adequately explored before moving on.

| Perspective | Guiding Question |
|-------------|-----------------|
| Domain Events | "什么事情在业务中发生后值得记录？" |
| Commands | "哪些命令会触发这些事件？" |
| Aggregates | "哪些 Command + Event 应由同一个一致性边界守护？" |
| Policies | "哪些 event 自动触发下一步 command？" |
| Read Models | "哪些视图/报表从 events 投影？" |

**Constraints**:
- Every perspective must be represented in the final output.
- If the user skips a perspective, note the gap and offer to revisit at the end.

## 3. Output Format

输出文件：`.forge/contexts/<context>/event-storm.md`

```yaml
---
context: <context-name>
started_at: "<ISO timestamp>"
last_updated: 2026-08-11<ISO timestamp>"
phase_completed: <events|commands|aggregates|policies|read_models>
---
```

五个 markdown section：`## Events`、`## Commands`、`## Aggregates`、`## Policies`、`## Read Models`。
每条目格式：`- **Name** — 描述。来源：trigger`

→ 完整示例见 references/example-storm.md

## 4. Session Continuity

**Goal**: Resume an interrupted storm session seamlessly, picking up exactly where it left off.

**Constraints**:
- Read the existing `.forge/contexts/<context>/event-storm.md` and parse its `phase_completed` frontmatter to determine resumption point.
- If the file is corrupted or malformed, inform the user and offer restart or manual fix options.
- Approach: your choice — inspect, parse, continue.

## 5. Available Functions

| Concept | Function | Params | Returns |
|---------|----------|--------|---------|
| Initialize | `initStormState(context)` | context name | `StormState` |
| Save progress | `saveStormState(state)` | current StormState | void (writes file) |
| Final output | `serializeStormMarkdown(state)` | completed StormState | markdown string |

Use these as needed. No prescribed sequence — call them when your approach requires them.

## 6. Completion

When all five perspectives are sufficiently explored, produce the final markdown file and suggest: `"可用 /tinkerman spec 基于此风暴启动 spec 生成"`

## 7. Examples

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

## Gotchas
- **Premature modeling**: Jump to aggregates before exploring events → miss critical domain concepts → explore events first, model later
- **Facilitator bias**: AI suggests events that match its training → domain-specific events missed → let user drive, AI only structures
- **Scope explosion**: Event storm covers entire system → too many events → scope to one bounded context at a time
