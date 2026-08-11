# Spec 2: 上下文分层裁剪 — Byte Budget + 4-Tier 上下文管理

> 来源：open-gsd/gsd-core v1.4.4 `src/prompt-budget.cts` + `src/context-utilization.cts` + `workflows/` byte budget (#717)
> 优先级：P1 | 影响范围：instructions + context-budget 模块 + MCP cost audit
> 预估工作量：8-10h
> Forge 现状：✅ 已通过现有实现满足（Forge 比 gsd-core 更精细）

---

## 评估结论（2026-06-12）

**✅ 已通过现有实现满足，无需开发。Forge 的实现比 gsd-core 更精细。**

`src/context-budget.ts`（797 行）已包含：
- **`InformationLifecycle`** 4 类型（persistent/phase-scoped/ephemeral/write-and-discard）— 比 gsd-core 的 PEAK/GOOD/DEGRADING/POOR 状态名更精确（那些只是展示名称）
- **`CLASSIFICATION_MAP`** 13 source types — 细粒度内容分类
- **6 named trimmers**（serialize/deserialize）— 结构化裁剪链
- **`computeContextBudgetThresholds()`** 0.3/0.5/0.7 ratio thresholds — 使用原始 ratio 而非 round 后的 percent
- **`ContextBudgetReport`** before/after/savings 完整报告
- **MCP cost awareness** 已内建

gsd-core 的 byte budget（XL=90K/LARGE=54K/DEFAULT=38K）是 workflow 文件大小限制，Forge 的 token ratio 体系对 context 管理更精确。

## 问题

当前 Forge 的上下文管理存在三个缺陷：

| 缺陷 | 现状 | v1.4.4 方案 |
|------|------|------------|
| **阈值振荡** | 59.99% 健康、60.01% 警告——使用 round 后的 percent | 使用 ratio（原始比值）+ debounce |
| **无差别丢弃** | >100K tokens 建议清空，>150K 强制清空——所有内容等同丢弃 | 分层优先级裁剪链 |
| **行数限制** | 无 workflow/instruction 大小限制 | byte-based budget（非行数限制） |

### v1.4.4 新增 vs v1.3.0

| 特性 | v1.3.0 | v1.4.4 |
|------|--------|--------|
| 状态名称 | WARNING/CRITICAL | **PEAK/GOOD/DEGRADING/POOR** |
| Budget 单位 | token estimate | **bytes**（workflow/instruction 限制） |
| Read 深度 | 无区分 | **<500K tokens=frontmatter-only, ≥500K=full body** |
| Lazy loading | 无 | **MVP first-load, lazy expand on demand** |
| MCP cost | 无审计 | **20K+ tokens/server/turn 审计** |
| Debounce | 无 | **debounce=5**（避免瞬时波动触发误报） |

## 需求

### R1: 上下文状态分类器（4-Tier）

纯函数模块，零 I/O。接收 `tokensUsed` + `contextWindow`，返回状态分类。

```
分类标准（使用 ratio = tokensUsed / contextWindow，不使用 round 后的 percent）：

| 状态      | 条件             | 颜色 | 行为                                    |
|-----------|------------------|------|-----------------------------------------|
| PEAK      | ratio < 0.30     | 🟢   | 最佳状态，无限制                        |
| GOOD      | 0.30 ≤ ratio < 0.50 | 🔵 | 正常工作，允许所有操作                  |
| DEGRADING | 0.50 ≤ ratio < 0.70 | 🟡 | 开始裁剪低优先级内容 + lazy load MVP    |
| POOR      | ratio ≥ 0.70     | 🔷   | 激进裁剪 + 建议检查点 + 禁止新 explore  |

Monitor hook 触发阈值：
  - 35% remaining → WARNING（注入裁剪 note）
  - 25% remaining → CRITICAL（强制裁剪 + 建议开新会话）
  - debounce=5（连续 5 次检测到同一状态才触发，避免瞬时波动）

边界处理：ratio = 0.49999 仍为 GOOD（不是 DEGRADING），
因为 0.49999 < 0.50，不会因 round(49.999%) = 50% 触发错误状态。
```

**输入验证**：
- `tokensUsed` 必须是非负整数，否则 throw TypeError
- `contextWindow` 必须是正整数，否则 throw TypeError
- 错误消息包含参数名、实际值、期望类型

### R2: Prompt 裁剪优先级链

当上下文进入 DEGRADING/POOR 状态时，按以下优先级从低到高裁剪：

```
永不裁剪（Keep Forever）：
  └─ Instructions（系统指令、铁律、Agent 角色）
  └─ Reserve note（裁剪说明，约 80 tokens）
  └─ Spec locked requirements（锁定的规格要求）

优先保留（Keep High）：
  └─ Project context（CLAUDE.md、config.md）
     └─ 策略：头部缩减（保留前 N 行，丢弃尾部）

按比例保留（Proportional Keep）：
  └─ Plans（plan 文件内容）
     └─ 策略：每个 plan 按比例分配剩余预算
     └─ 最小保证：每个 plan ≥ 1024 bytes
     └─ 超出比例部分尾部截断

先丢弃（Drop First）：
  └─ Context files（代码文件内容、explore 结果）

次丢弃（Drop Second）：
  └─ Research findings（研究发现、外部文档）

最后丢弃（Drop Last）：
  └─ Requirements（需求文档、验收标准）

硬失败（Hard Fail）：
  └─ 如果最小保留集超出预算 → 返回空 prompt + hardFailed: true
```

### R3: Workflow Byte Budget

v1.4.4 的 workflow/instruction 大小限制基于 **bytes**（非行数），因为不同行的长度差异巨大。

```
Workflow / Instruction 大小限制：

| 级别    | Byte Budget | 适用场景                              |
|---------|-------------|---------------------------------------|
| XL      | 90,000      | 完整开发流程（plan→build→review→ship）|
| LARGE   | 54,000      | 单阶段完整流程（如 build-only）       |
| DEFAULT | 38,000      | 标准指令                              |

注意：Codex 在 32768 bytes 处截断，因此 DEFAULT budget 必须小于此值。
```

**实施要求**：
- Forge 的 `skills/forge/lib/*/instructions.md` 文件需要标注 byte size
- 超出 budget 的 instruction 文件需要拆分为多个子文件
- 拆分后使用 `@include` 或引用链接连接

### R4: Read Depth Table

根据上下文窗口剩余量决定文件读取深度：

```
| 剩余 Token 预算    | Read 策略                           |
|-------------------|-------------------------------------|
| ≥ 500K tokens     | 完整读取（full body）                |
| < 500K tokens     | 仅读 frontmatter + 目录结构          |
| < 100K tokens     | 仅读文件路径 + 第一行摘要            |
```

**Forge 集成**：在 explore agent 和 Read 工具调用时自动应用此规则。

### R5: Lazy Loading（MVP First-Load）

当上下文进入 DEGRADING 状态时，启用 lazy loading 模式：

```
MVP First-Load 策略：
  1. 首次读取文件时，只加载 frontmatter + 目录结构（不加载完整内容）
  2. Agent 需要具体内容时，按需 lazy-expand 单个文件
  3. 每次 lazy-expand 检查预算，超限时拒绝并返回裁剪版本

适用文件类型：
  - 大型 spec 文件（>500 行）
  - 代码文件（>200 行）
  - 测试文件（始终 lazy-load，仅读取 describe/it 标题）
```

### R6: MCP Cost Audit

v1.4.4 发现每个 MCP server 每 turn 消耗 20K+ tokens。Forge 应审计 MCP server 的 context 开销：

```
MCP Cost Audit：
  1. 记录每个 MCP server 的 tool definition 大小
  2. 如果所有 MCP server 的 tool definitions 总计 > 50K tokens → 警告
  3. 建议禁用低使用率的 MCP server
  4. 在 DEGRADING 状态下，自动建议禁用非必需 MCP server
```

### R7: 裁剪透明度

每次裁剪后注入说明 note：

```xml
<note type="context-trim">
预算：{budget} tokens | 状态：{status} | 已省略：{omittedList} | Plan 截断：{planTruncationPct}%
完整内容见 .forge/ 目录对应文件。
</note>
```

### R8: Token 估算

```
tokenEstimate(text) = Math.ceil(text.length / 4)
```

> chars/4 的上取整。预算管理场景中一致性比精确性更重要。

### R9: 压力感知 Note 预留

仅在检测到预算压力时（DEGRADING 或 POOR）才预留 80 tokens 的裁剪说明空间。PEAK/GOOD 状态不预留。

## 设计决策

| 决策 | 选项 | 选择 | 理由 |
|------|------|------|------|
| 状态名称 | WARNING/CRITICAL vs PEAK/GOOD/DEGRADING/POOR | PEAK/GOOD/DEGRADING/POOR | v1.4.4 标准，4 级比 2 级更精细 |
| Budget 单位 | tokens vs bytes | bytes（workflow）+ tokens（context） | workflow 文件用 bytes 更精确，context 用 tokens 更直觉 |
| Read depth | 统一 full vs 分层 | 分层（500K 阈值） | 大文件全量读取浪费 context |
| Lazy loading | 始终全量 vs MVP-first | MVP-first on DEGRADING+ | PEAK/GOOD 不需要 lazy load 的延迟开销 |
| Debounce | 无 vs N 次 | debounce=5 | 避免瞬时上下文波动触发误报 |
| Token 估算 | 精确 tokenizer / chars÷4 | chars÷4 | 一致性 > 精确性 |

## 验收标准

- [ ] R1 4-tier 分类器实现（PEAK/GOOD/DEGRADING/POOR），使用 ratio 而非 percent
- [ ] R1 debounce=5 机制实现
- [ ] R2 裁剪优先级链写入 instructions
- [ ] R3 workflow byte budget 标注（XL=90K / LARGE=54K / DEFAULT=38K）
- [ ] R4 read depth table 集成到 explore agent
- [ ] R5 lazy loading（MVP first-load）在 DEGRADING 状态启用
- [ ] R6 MCP cost audit 实现或文档化
- [ ] R7 裁剪说明 note 格式定义
- [ ] R8 token 估算公式（chars÷4）文档化
- [ ] R9 压力感知预留规则
- [ ] `npm run check` 通过
