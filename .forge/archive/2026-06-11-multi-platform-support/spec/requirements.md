---
status: archived
archived_reason: "多平台抽象层（AgentRegistry / AgentAdapter / AgentProtocol）经 2026-06-11 代码复核确认从未实现，决定不做"
archived_replacement: "无（决定不实现）"
feature: multi-platform-support
layout: requirements
created: 2026-04-29
tier: standard
---
# 需求文档：多 AI 平台支持（v3.0）

## 简介

基于已有的 `AgentInterface` 平台抽象层，扩展 Forge Loop 以支持 Claude 以外的 AI 编码助手。实现统一的 Agent 协议适配器，确保状态文件和工作流在不同 AI 平台间兼容。

## 术语表

- **AgentInterface**：已有的通用 Agent 接口（`loop-types.ts`），定义 `name`、`run()`、`close()` 方法
- **AgentAdapter**：特定 AI 平台的 `AgentInterface` 实现（如 `SdkAgentAdapter` 对应 Claude）
- **AgentRegistry**：Agent 适配器注册表，支持按名称查找和实例化适配器
- **AgentProtocol**：统一的 Agent 通信协议，定义输入/输出格式、结构化输出 schema、错误处理约定

## 需求

### 需求 1：Agent 适配器注册与发现

**用户故事：** 作为用户，我希望通过 CLI 选项选择不同的 AI 平台，而非硬编码使用 Claude。

#### 验收标准

1. THE forge-loop CLI SHALL 接受 `--agent <name>` 选项，指定使用的 AI 平台（默认 `claude`）
2. THE AgentRegistry SHALL 支持注册多个 AgentAdapter 实现
3. THE AgentRegistry SHALL 通过名称查找并实例化对应的 AgentAdapter
4. WHEN 指定的 Agent 名称未注册时，THE CLI SHALL 输出可用 Agent 列表并拒绝启动
5. THE AgentAdapter 注册 SHALL 支持动态加载（通过配置文件或插件目录）

### 需求 2：统一 Agent 协议

**用户故事：** 作为适配器开发者，我希望有清晰的协议规范，以便为新的 AI 平台编写适配器。

#### 验收标准

1. THE AgentProtocol SHALL 定义标准的输入格式：prompt 字符串 + 结构化输出 schema + 运行选项
2. THE AgentProtocol SHALL 定义标准的输出格式：`AgentOutput`（summary、success、skill_phase_completed 等）+ `TokenUsage`
3. THE AgentProtocol SHALL 定义标准的错误处理：超时、API 错误、输出验证失败
4. THE `AgentOutput` schema SHALL 与 AI 平台无关——适配器负责将平台特定的输出映射到标准格式
5. THE `TokenUsage` 字段 SHALL 为可选——不支持 token 计量的平台返回零值

### 需求 3：状态文件跨平台兼容

**用户故事：** 作为用户，我希望在不同 AI 平台间切换时，`.forge/` 状态文件和工作流保持兼容。

#### 验收标准

1. THE StatusFile 格式 SHALL 不包含平台特定字段——所有平台使用相同的 `status.md` 格式
2. THE Notes 文档格式 SHALL 不包含平台特定字段——所有平台使用相同的 `notes.md` 格式
3. THE SkillScheduler SHALL 与 Agent 实现无关——仅依赖 StatusFile 中的 phase/tier 字段
4. WHEN 从一个 Agent 切换到另一个时，THE 现有的 `.forge/runs/` 目录 SHALL 保持可读

### 需求 4：参考适配器实现

**用户故事：** 作为开发者，我希望有一个参考适配器实现，作为编写新适配器的模板。

#### 验收标准

1. THE 项目 SHALL 提供至少一个非 Claude 的参考适配器（如 Mock Agent 或 OpenAI 适配器骨架）
2. THE 参考适配器 SHALL 实现完整的 `AgentInterface`，包含 `run()`、`close()`、`name`
3. THE 参考适配器 SHALL 包含详细的代码注释，说明每个方法的职责和实现要点
4. THE 参考适配器 SHALL 包含对应的单元测试

### 需求 5：向后兼容

**用户故事：** 作为现有用户，我希望多平台支持不破坏现有的 Claude 工作流。

#### 验收标准

1. WHEN 未指定 `--agent` 时，THE CLI SHALL 默认使用 `claude` 适配器，行为与当前版本完全一致
2. THE `SdkAgentAdapter` SHALL 保持不变——新功能通过 AgentRegistry 层添加
3. THE 现有测试 SHALL 全部通过，无需修改
