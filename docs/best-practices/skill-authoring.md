# SKILL 编写指南

## 概述

SKILL 是 Forge 的核心扩展机制。每个 SKILL 是一个 Markdown 文件，定义 AI 在特定阶段的行为契约。

## 文件结构

```
skills/<skill-name>/
  SKILL.md          # 必需，SKILL 定义文件
```

### SKILL.md 模板

```yaml
---
name: <skill-name>
description: <一句话描述 SKILL 功能>
disable-model-invocation: true   # 防止 AI 直接调用
---

# <SKILL 名称>

## 概述 / Overview

<SKILL 的目标和职责>

## 执行步骤

1. 步骤 1
2. 步骤 2
...

## 输出格式

<SKILL 产生的文件/输出>

## 约束

<SKILL 的边界条件>
```

## YAML Frontmatter 规则

- `name`: 必须与目录名一致（如 `skills/forge-plan/SKILL.md` → `name: forge-plan`）
- `description`: 一句话功能描述，用于 contract test 验证
- `disable-model-invocation`: 必须为 `true`，所有 SKILL 通过 `/forge` 入口分发

## 压缩策略

每个 SKILL.md 应控制在合理大小内：

| 策略 | 说明 |
|------|------|
| **Reference Directive** | 与 CLAUDE.md 重复的规则用 `→ 详见 CLAUDE.md §X` 替代 |
| **Canonical Example** | 每种输出格式只保留一个完整示例 |
| **Table Compression** | 多行描述合并为紧凑表格 |
| **Flow Simplification** | 冗长流程替换为 ≤6 行编号步骤 |
| **Example Pruning** | 保留一个完整示例，删除重复场景 |

## 命名约定

- 前缀 `forge-` + 阶段名（如 `forge-build`、`forge-review`）
- 目录名 = SKILL name = YAML name
- 文件名始终为 `SKILL.md`（大写）

## 验证

```bash
# Contract tests 验证 SKILL 结构
npx vitest run test/contract.test.ts test/contract.skills.test.ts

# 字符数检查
wc -c skills/*/SKILL.md
```
