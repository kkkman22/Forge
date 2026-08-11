---
status: locked
feature: multi-platform-support
layout: design
created: 2026-04-29
---

# 设计文档：多 AI 平台支持（v3.0）

## Overview

基于已有的 `AgentInterface` 抽象，添加 AgentRegistry 注册/发现层和统一的 Agent 协议规范。现有的 `SdkAgentAdapter`（Claude）保持不变，新增 `MockAgentAdapter` 作为参考实现和测试工具。CLI 通过 `--agent <name>` 选项选择平台。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    forge-loop CLI                         │
│  --agent claude|mock|openai                              │
├─────────────────────────────────────────────────────────┤
│                    AgentRegistry                         │
│  register("claude", SdkAgentAdapter)                     │
│  register("mock", MockAgentAdapter)                      │
│  resolve("claude") → SdkAgentAdapter instance            │
├─────────────────────────────────────────────────────────┤
│                    AgentInterface (已有)                  │
│  name: string                                            │
│  run(prompt, cwd, options) → AgentResult                 │
│  close?() → void                                         │
├─────────────────────────────────────────────────────────┤
│  SdkAgentAdapter     │  MockAgentAdapter    │  (future)  │
│  (Claude SDK)        │  (参考实现)           │  OpenAI等  │
└─────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### AgentRegistry (`src/agent-registry.ts`)

```typescript
type AgentFactory = (config: AgentFactoryConfig) => AgentInterface;

interface AgentFactoryConfig {
  cwd: string;
  outputSchema: AgentOutputSchema;
  globalTimeoutMs?: number;
  maxBudgetUsd?: number;
}

interface AgentRegistry {
  /** 注册适配器工厂 */
  register(name: string, factory: AgentFactory): void;
  /** 按名称查找并实例化适配器 */
  resolve(name: string, config: AgentFactoryConfig): AgentInterface;
  /** 获取所有已注册的 Agent 名称 */
  listAgents(): string[];
  /** 检查名称是否已注册 */
  has(name: string): boolean;
}

/** 创建 AgentRegistry 实例 */
function createAgentRegistry(): AgentRegistry;

/** 注册内置适配器（claude、mock） */
function registerBuiltinAgents(registry: AgentRegistry): void;
```

### MockAgentAdapter (`src/mock-agent-adapter.ts`)

```typescript
interface MockAgentConfig {
  /** 预设的响应序列 */
  responses: AgentResult[];
  /** 每次调用的模拟延迟（毫秒） */
  delayMs?: number;
  /** 是否在响应耗尽后循环 */
  loop?: boolean;
}

class MockAgentAdapter implements AgentInterface {
  readonly name = "mock";
  constructor(config: MockAgentConfig);
  async run(prompt: string, cwd: string, options?: AgentRunOptions): Promise<AgentResult>;
  async close(): Promise<void>;
}
```

**设计决策**：
- `AgentRegistry` 使用工厂模式而非直接注册实例，支持延迟初始化
- `MockAgentAdapter` 用于测试和演示，不依赖任何外部 API
- `AgentFactoryConfig` 包含所有适配器可能需要的通用配置
- 未来的 OpenAI 适配器只需实现 `AgentInterface` 并注册到 Registry

## Correctness Properties

### Property 1: Registry 注册幂等性

*For any* agent name, registering the same factory twice SHALL overwrite the previous registration without error.

### Property 2: 未注册 Agent 查找

*For any* agent name not in the registry, `resolve()` SHALL throw a descriptive error listing available agents.

### Property 3: Mock Agent 响应序列

*For any* non-empty response sequence, MockAgentAdapter SHALL return responses in order, and when `loop: true`, cycle back to the first response after exhausting the sequence.

## Testing Strategy

- 属性测试：Registry 注册/查找正确性、Mock Agent 响应序列
- 单元测试：AgentRegistry CRUD、MockAgentAdapter 行为、CLI `--agent` 选项
- 集成测试：SdkDriver 使用 MockAgentAdapter 运行完整循环
