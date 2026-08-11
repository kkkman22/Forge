---
status: approved
created: "2026-04-29"
spec: ".tinkerman/specs/structured-observability/spec.md"
---

# Plan: 结构化可观测性增强

## 新增模块

### 1. `src/logger/types.ts` — 类型定义
- LogLevel union type
- LogEntry interface
- IterationTiming interface
- PerformanceBaseline interface
- LogSinkConfig interface

### 2. `src/logger/log-entry.ts` — 纯函数
- `createLogEntry(event, level, message, context?, metadata?)` → LogEntry
- round-trip 保证通过 JSON.parse(JSON.stringify()) 实现

### 3. `src/logger/log-sink.ts` — 纯函数
- `formatAsJson(entry)` → 单行 JSON string
- `formatAsText(entry)` → 人类可读 string
- `shouldLog(entryLevel, configLevel)` → boolean
- `createLogSink(config)` → { log(), formatCompletionSummary() }

### 4. `src/logger/timing.ts` — 纯函数
- `createIterationTiming(startMs, agentEndMs, effectEndMs)` → IterationTiming
- `computePerformanceBaseline(timings[])` → PerformanceBaseline

### 5. `src/logger/index.ts` — barrel export

## 修改文件

### 6. `src/forge-loop-cli.ts`
- 添加 `--log-format` 和 `--log-level` CLI 选项
- 验证选项值，无效时拒绝启动
- 创建 LogSink 注入到 SdkDriver

### 7. `src/sdk-driver.ts`
- 注入 logger 依赖
- 主循环中添加迭代计时埋点
- logTokenUsage() 迁移到 logger
- console.warn 迁移到 logger.warn
- formatCompletionSummary() 追加 PerformanceBaseline

### 8. `src/effect-executor.ts`
- onLog 回调接入日志管道（可选，通过上层注入）

## 测试文件 (TDD — 先写)

### 9. `test/logger/log-entry.test.ts`
- 验证必填字段
- 验证可选字段
- 验证 metadata
- 验证 round-trip

### 10. `test/logger/log-sink.test.ts`
- 验证 JSON 格式化
- 验证 text 格式化
- 验证级别过滤

### 11. `test/logger/timing.test.ts`
- 验证 IterationTiming 计算
- 验证 total >= agent + effect 不变式
- 验证 PerformanceBaseline 计算
- 验证空数组边界情况

## 执行顺序

1. 创建类型定义 (types.ts)
2. 写测试 (TDD RED)
3. 实现纯函数 (TDD GREEN)
4. 修改 CLI 添加选项
5. 修改 SdkDriver 注入日志和计时
6. 迁移现有 console.log/warn
7. 集成测试验证端到端
