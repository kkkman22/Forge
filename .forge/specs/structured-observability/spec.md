---
status: locked
contract_legacy: true
created: "2026-04-29"
source: ".kiro/specs/structured-observability/requirements.md"
---

# Spec: 结构化可观测性增强

> 来源: `.kiro/specs/structured-observability/requirements.md`

## 需求清单

### R1: 结构化日志数据模型
- LogEntry 必填字段: timestamp(ISO 8601), level(debug/info/warn/error), event, message
- 可选上下文: runId, iteration, phase, branchName, commitCount
- metadata 支持任意键值对
- JSON round-trip 等价性

### R2: 日志输出格式切换
- CLI `--log-format <text|json>` 选项，默认 text
- JSON 模式: 单行 JSON 到 stdout
- Text 模式: 保持当前人类可读格式（向后兼容）
- 无效值: 列出有效选项并拒绝启动
- LogSink 为纯函数

### R3: 日志级别过滤
- CLI `--log-level <debug|info|warn|error>` 选项，默认 info
- 仅输出 >= 配置级别的日志
- 级别比较为纯函数

### R4: 迭代级性能计时
- 每轮迭代记录: iterationStartMs, agentCallDurationMs, effectExecutionDurationMs, totalIterationDurationMs
- 作为 LogEntry metadata 输出
- totalIterationDurationMs >= agentCallDurationMs + effectExecutionDurationMs

### R5: 运行级性能汇总
- 运行结束时输出 PerformanceBaseline
- 在 formatCompletionSummary() 中追加
- JSON 模式: 结构化 JSON 对象
- 0 轮迭代: 输出 N/A 或省略计时字段

### R6: 现有日志迁移
- logTokenUsage() 通过 LogSink 输出
- console.warn 通过 LogSink warn 级别输出
- EffectExecutor onLog 通过 LogSink 输出
- [debug] 前缀用 debug 级别，用户可见用 info 级别

### R7: 纯函数设计与可测试性
- LogEntry 构建: 纯函数
- LogEntry 格式化: 纯函数
- 级别过滤: 纯函数
- IterationTiming 计算: 纯函数
- PerformanceBaseline 计算: 纯函数

### R8: 向后兼容性
- 未指定新选项时保持当前行为
- 不引入新的运行时依赖
