# ADR: Claude Code v2.1.153 平台能力 Uplift

**Date**: 2026-05-28
**Status**: decided
**Deciders**: Forge contributors

## Context

Claude Code v2.1.83→v2.1.153 引入了多项平台级能力（hook 生命周期、skill frontmatter、auto mode、plugin 化），其中相当一部分直接对应 Forge 宪法 §2-§3 中仅靠 prompt 约束的"软铁律"。本 uplift 将这些能力落到工具/平台层，把"指令式约束"升级为"机制式约束"。

## Decision

实施 16 项升级，分 5 个工作包：

1. **WP-A 会话生命周期**（R1 SessionStart, R4 /goal, R5 agents）— 自动注入 evolved-rules、跨多轮执行、并行 subagent 调度
2. **WP-B 工具层硬约束**（R2 MessageDisplay, R3 disallowed-tools, R6 hard_deny, R7 baseRef, R13 PreCompact, R16 CwdChanged）— 从 prompt 约束升级为平台级强制
3. **WP-C 评审与工具升级**（R9 ultrareview L0, R11 maxResultSizeChars, R12 bin/, R15 PostToolUse）— 外围功能灰度升级
4. **WP-D 分发与一致性**（R8 exec form, R10 plugin化, R14 mcp_tool）— 机械性改造
5. **WP-E 收尾**（R17）— 文档、ADR、版本号

## Key Trade-offs

| 决策 | 选择 | 放弃 | 理由 |
|------|------|------|------|
| hard_deny 格式 | 简单 string 形式 | 复杂 matchCondition | v2.1.136 schema 不确定，简单形式已够用 |
| /goal 集成 | 输出文本让用户复制 | 自动设置 goal | /goal 无编程 API |
| forge-doctor | 新建脚本 | 使用现有 scripts/ | 设计中的脚本名不存在，需创建 |
| bin/ 脚本 | 仅 forge-doctor | 迁移多个现有脚本 | 最大化实用价值、最小化风险 |

## Consequences

- **正面**：Forge 约束从"prompt 铁律"升级为"平台机制"，可靠性提升
- **负面**：依赖 Claude Code v2.1.153+，旧版降级到 prompt 模式
- **风险**：部分平台特性（hard_deny schema、ultrareview provider 可用性）需运行时验证
