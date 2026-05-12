[← 返回索引](./INDEX.md)

# opusplan 模式指南

## 工作原理

opusplan 是 Claude Code 的内置模型别名，实现自动的推理/执行分层：

- **Plan 模式**：使用 opus（复杂推理，适合架构设计和任务规划）
- **执行模式**：使用 sonnet（代码生成，适合实现和测试）

这种分层让每个阶段使用最合适的模型，避免在执行阶段浪费高推理能力的 token。

## 启用方法

```bash
# 会话内切换
/model opusplan

# 启动时指定
claude --model opusplan
```

## 预期成本节省

20-40%，取决于任务中推理与执行的比例。

- 纯编码任务（推理少）：节省接近 40%
- 架构设计任务（推理多）：节省约 20%
- 混合任务（Forge 标准路径）：通常节省 25-35%

## 与 Agent 级模型路由的关系

opusplan 和 Agent 级模型路由是**互补关系**，控制不同层面：

| 维度 | 控制范围 | 机制 |
|------|---------|------|
| opusplan | 主 Agent 的推理/执行分层 | Claude Code 内置模型别名 |
| Agent 级路由 | Subagent 的模型选择 | Agent 定义文件 `model` 字段 |

两者可以同时使用，互不冲突。启用 opusplan 后，Subagent 仍然遵循各自的 model 字段设置（explore → haiku，review → sonnet，decide → inherit）。

## 注意事项

- **用户自愿选择**：Forge 不在任何配置文件或脚本中强制启用 opusplan
- **工作流兼容**：所有 Forge 命令（plan、build、review、test、ship、learn）在 opusplan 模式下正常运行
- **随时切换**：可使用 `/model` 命令随时切换回其他模型
