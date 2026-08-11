---
status: draft
feature: review-agent-timeout-dynamic
layout: requirements
created: 2026-06-17
tier: light
---
# Review Agent Timeout 动态化 — 需求文档

## 背景

`src/forge/agents-dispatcher.ts:69` 定义了 review/decide subagent 的硬超时：

```ts
const DEFAULT_AGENT_TIMEOUT_MS = 15 * 60 * 1000; // 15 分钟
```

超时后 SIGTERM 杀进程，`fallback.ts:280` 将其识别为 `"timeout"` 签名，进入 ADR-0005 的 fallback ladder（L0→L1→L2→L3）。**机制是健全的**——超时不阻断，降级处理。

**缺口**：15 分钟是写死的固定值，不随任务规模变化：

| Tier | 典型 review 工作量 | 15 分钟固定值的问题 |
|------|-------------------|-------------------|
| Light | ≤1 文件，改动 ≤20 行 | 偏长，小任务拖到 15 分钟才降级，浪费时间 |
| Standard | 明确需求 | 基本合适 |
| Full | 新服务/新数据库，3 个 reviewer 并行深审 | **偏短**，大 spec 的 quality-check 跑 20-30 分钟正常，固定 15 分钟会误触发 L1 降级 |

用户在上一轮调研中明确指出："review 阶段 3 个 agent review 的时间都很长，这应该是要根据任务的大小动态决定时长。" 本 spec 让 timeout 可配 + 按 Tier 给默认，修复误降级。

**来源**：Claude Code CHANGELOG 2.1.169（Vertex/Foundry 恢复 idle timeout，卡住的 stream 中止而非无限挂起）+ 2.1.178（compaction 在过载时走 fallback model 链）启发。Forge 的 timeout + fallback ladder 机制已存在，本 spec 只补"动态化"这一维度。

## 目标

- 让 review/decide subagent 的超时可通过 config 配置。
- 按 Tier（light/standard/full）提供差异化默认值，避免大任务误降级、小任务空等。
- 保持 ADR-0005 fallback ladder 不变——超时仍触发降级，不阻断 ship。

## 需求

### Requirement 1: config 字段

**User Story:** 作为 Forge 用户，我希望可以按 Tier 配置 review subagent 超时，避免大任务被误杀或小任务空等。

#### 验收标准

1. THE `.tinkerman/config.md` SHALL 新增 `review.agent_timeout_minutes` 字段（对象或扁平映射），支持按 Tier 配置：`light`、`standard`、`full`。
2. THE 默认值 SHALL 为 `light: 5, standard: 15, full: 30`（分钟）。
3. WHEN 某个 Tier 的值缺失，THE 解析 SHALL 回退到该 Tier 的默认值。
4. WHEN 字段完全缺失，THE 行为 SHALL 与当前一致（全 Tier 用 15 分钟），保证向后兼容。
5. THE `forge init` 模板（`templates/config.md`）SHALL 包含此字段及注释。

### Requirement 2: Tier 解析

**User Story:** 作为 Forge 内部，我希望从 status.md 读取当前 Tier 来选择对应的 timeout。

#### 验收标准

1. THE timeout 解析 SHALL 从 `.tinkerman/status.md` 的 `tier` 字段读取当前 Tier（`doctor.ts:464` 已验证该字段为 light/standard/full）。
2. THE `agents-dispatcher.ts` SHALL 导出一个 `resolveAgentTimeoutMs(tier, configContent)` 纯函数，返回对应 Tier 的毫秒超时。
3. WHEN tier 读取失败或值非法，THE 函数 SHALL 回退到 `standard` 的默认值（15 分钟）。
4. THE 函数 SHALL 是纯函数（无 IO），便于测试（对齐 `parseDispatchMode` 的设计）。

### Requirement 3: dispatch 集成

**User Story:** 作为 Forge 内部，我希望 dispatch 调用时自动使用 Tier 对应的超时。

#### 验收标准

1. THE `dispatch(opts)` 的 `timeoutMs` SHALL 在调用方未显式传入时，由 `resolveAgentTimeoutMs(tier, configContent)` 解析（而非写死 `DEFAULT_AGENT_TIMEOUT_MS`）。
2. THE 显式传入的 `opts.timeoutMs` SHALL 优先于 config 解析值（保持现有 override 语义）。
3. THE `DEFAULT_AGENT_TIMEOUT_MS` 常量 SHALL 保留作为最终 fallback（config 缺失 + tier 未知时）。

### Requirement 4: 向后兼容

**User Story:** 作为现有 Forge 用户，我希望升级后无 config 字段时行为不变。

#### 验收标准

1. WHEN `.tinkerman/config.md` 无 `review.agent_timeout_minutes` 字段，THE 所有 Tier SHALL 使用 15 分钟（当前行为）。
2. ALL 现有 `agents-dispatcher` 相关测试 SHALL 在变更后继续通过。

## 验收标准

- [ ] `resolveAgentTimeoutMs` 纯函数存在且有单元测试（覆盖 3 个 Tier + 缺失/非法回退）
- [ ] `.tinkerman/config.md` 和 `templates/config.md` 含 `review.agent_timeout_minutes` 字段
- [ ] 现有 dispatch 测试在无 config 字段时仍用 15 分钟（向后兼容）
- [ ] `npm run check` 全绿

## 依赖

- 无外部依赖。Tier 字段已存在于 `.tinkerman/status.md`（`doctor.ts:464` 读取）。

## 非目标

- **不**改 ADR-0005 fallback ladder 的任何层级或触发条件——超时后的降级行为不变。
- **不**实现 idle/stall detection（CC 2.1.113 的 subagent stalling detection 是运行时行为，由 Claude Code 自身处理）。
- **不**按 task 数动态计算（如 `baseline × taskCount/10`）——Tier 已是任务规模的分级，按 Tier 给默认已足够；task 数动态化是过度优化，留待 metrics 显示误降级仍频繁时再考虑。
- **不**改 decide 阶段的 timeout（decide subagent 通常较快，固定值可接受；如未来需要再加 `decide.agent_timeout_minutes`，本 spec 不扩展）。
- **不**引入 fallback model 链（CC 2.1.178）——Forge 的模型选择由 `review_force_model` 等 config 已覆盖，与超时是正交问题。
