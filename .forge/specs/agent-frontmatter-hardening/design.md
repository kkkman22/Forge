---
feature: agent-frontmatter-hardening
layout: design
created: 2026-05-30
---

# Design Document: Agent Frontmatter 加固

## Overview

对 `.claude/agents/` 下的 agent 文件进行 frontmatter 批量加固，涵盖 5 项优化。所有变更都是声明式的 frontmatter 修改，不涉及 agent 逻辑变更。

**变更范围**：修改 `.claude/agents/` 下的 agent 文件（frontmatter 部分）。

**不涉及**：agent 的指令逻辑、SKILL 文档、plugin.json、hook 脚本。

## Architecture

```
.claude/agents/
├── spec-check.md          ← +disallowed-tools
├── quality-check.md       ← +disallowed-tools
├── security-check.md      ← +disallowed-tools
├── forge-build.md         ← +memory, +initialPrompt
├── forge-plan.md          ← +memory, +initialPrompt
├── forge-review.md        ← +memory, +initialPrompt
├── security.md            ← +memory
├── forge-decide-lead.md   ← +effort: xhigh
├── forge-decide-arch.md   ← +effort: xhigh
├── forge-decide-product.md← +effort: xhigh
├── forge-decide-sec.md    ← +effort: xhigh
├── forge-decide-cost.md   ← +effort: high
└── forge-decide-ops.md    ← +effort: high
```

## Components and Interfaces

### Review Agent Frontmatter（spec-check/quality-check/security-check）

```yaml
---
disallowed-tools:
  - Bash
  - Write
  - Edit
  - Agent
---
```

**理由**：Review agent 只需 Read/Grep/Glob 做分析。禁止 Bash 防止执行命令，禁止 Write/Edit 防止修改代码，禁止 Agent 防止 spawn 子 agent。

### Build/Plan/Review Agent Frontmatter

```yaml
---
memory: project
initialPrompt: "..."  # 各 agent 不同的启动提示
---
```

### Decide Agent Effort

```yaml
---
effort: xhigh  # lead/arch/product/sec
# 或
effort: high   # cost/ops
---
```

## Testing Strategy

1. **YAML 校验**：每个 agent 文件 frontmatter 格式正确
2. **功能验证**：`/forge review` → 确认 review agent 仍正常工作
3. **隔离验证**：review agent 尝试 Write → 确认被拒绝
4. **回归验证**：`npm run check` 通过
