---
feature: subagent-truncation-fix
layout: design
created: 2026-05-29
---

# Subagent 结果截断修复 — 设计文档

## 概述

Review subagent（spec-check、quality-check、security-check）在高工具调用场景下结果被截断，导致 Layer 报告丢失。本设计通过结构化报告模板、token 预算管理和截断检测三层防御解决这个问题。

## 术语

- **Layer 报告**: subagent 完成评审后输出的结构化结论段落
- **截断**: subagent 返回的文本不包含完整的 Layer 报告
- **maxTurns**: Agent SDK 中限制 subagent 交互轮次的参数
- **Token 预算**: subagent 可用的 token 上限

## 根因分析

### 截断发生的条件

```
C(X): tool_uses(X) ≥ 5 ∧ remaining_tokens(X) < report_size(X)
```

当 subagent 执行了 5+ 次工具调用后，剩余 token 不足以生成完整报告。Agent SDK 在达到限制时截断输出。

### 为什么 spec-check 的修复不能推广

spec-check 的修复是针对性的（将 plans 枚举改为精确路径 Read），减少了工具调用次数。但 quality-check 和 security-check 的评审维度天然需要多次工具调用（读取不同文件、grep 不同模式），无法通过简单减少调用来解决。

## 设计方案

### 层 1: 结构化报告模板

每个 review subagent 的 SKILL 文档定义报告模板：

```markdown
<!-- REPORT_START -->
## Layer N: <layer-name> Review

### P0 Issues
<list or "None">

### P1 Issues
<list or "None">

### P2 Issues
<list or "None">

### P3 Issues
<list or "None">

### Summary
<1-2 sentence summary>
<!-- REPORT_END -->
```

关键设计点：
- `<!-- REPORT_START -->` 和 `<!-- REPORT_END -->` 标记使解析简单可靠
- 报告段放在 subagent 输出的最末尾
- 定长结构降低 token 消耗（预估 200-500 tokens）
- 空段落填 "None" 而非省略

### 层 2: 两阶段执行模式

将 subagent 执行分为两个阶段：

**阶段 A: 收集**（工具调用阶段）
- 正常执行评审，收集发现
- 跟踪已使用 token（通过工具调用次数 × 平均消耗估算）
- 当预估剩余 token < 报告模板大小 × 2 时，停止收集

**阶段 B: 报告**（纯输出阶段）
- 不调用任何工具
- 将收集到的发现填入报告模板
- 输出完整的 `<!-- REPORT_START -->` ... `<!-- REPORT_END -->` 段落

在 SKILL 文档中通过指令实现：

```markdown
## 执行约束

1. 在执行任何工具调用前，先计划本评审需要的全部工具调用
2. 优先执行高优先级的检查（P0/P1 相关）
3. 当工具调用次数达到 maxToolCalls - 2 时，停止收集并开始生成报告
4. 报告生成阶段禁止调用任何工具
5. 报告必须使用 REPORT_START/REPORT_END 标记包裹
```

其中 `maxToolCalls` 在 agent 定义中设置。

### 层 3: 截断检测

主 agent（`/forge review`）在收到 subagent 结果后的处理：

```typescript
interface LayerResult {
  layer: 'spec' | 'quality' | 'security';
  raw: string;
  report: string | null;     // REPORT_START...REPORT_END 之间的内容
  truncated: boolean;         // report 为 null 或明显不完整时为 true
}

function detectTruncation(raw: string): LayerResult {
  const startIdx = raw.lastIndexOf('<!-- REPORT_START -->');
  const endIdx = raw.lastIndexOf('<!-- REPORT_END -->');

  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return { layer, raw, report: null, truncated: true };
  }

  const report = raw.substring(startIdx, endIdx + '<!-- REPORT_END -->'.length);

  // 检查报告是否包含必要的段落
  const hasRequiredSections = report.includes('P0 Issues')
    && report.includes('Summary');

  return {
    layer,
    raw,
    report,
    truncated: !hasRequiredSections
  };
}
```

### 层 4: 降级策略

截断发生时的处理：

```
1层 truncated  → 正常输出，标注 "[数据不完整]"
2层 truncated  → 警告，建议重新运行 review
3层 truncated  → 触发 Fallback Ladder L2（串行重试）
```

### maxTurns 配置建议

| Subagent | 建议值 | 理由 |
|----------|--------|------|
| spec-check | 15 | 需要读取 spec、plans、tasks，工具调用较多 |
| quality-check | 12 | 需要扫描多个文件的代码质量 |
| security-check | 10 | 模式匹配为主，工具调用较少 |

## 实现路径

1. 定义 `detectTruncation` 纯函数及 `LayerResult` 类型
2. 更新三个 subagent 的 SKILL 文档，加入报告模板和两阶段执行指令
3. 更新 `/forge review` SKILL 的结果处理流程，集成截断检测
4. 实现降级策略（1层/2层/3层 truncated 的不同处理）
5. 编写测试

## 风险

| 风险 | 缓解 |
|------|------|
| SKILL 文档指令可能不被 subagent 完全遵守 | 截断检测作为兜底，不依赖 subagent 百分百合规 |
| maxTurns 配置可能不适用于所有项目 | 作为建议值，subagent 可根据实际情况调整 |
| 两阶段执行可能减少评审深度 | "优先高优先级检查"指令确保核心发现不被遗漏 |
