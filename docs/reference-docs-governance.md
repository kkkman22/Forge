---
title: Docs Governance 参考手册
category: reference
audience: [maintainer, contributor]
updated: 2026-06-16
owner: forge-maintainers
mirror_of: reference-docs-governance.en.md
---

[← 返回索引](./INDEX.md) | [English Version](./reference-docs-governance.en.md)

# Docs Governance 参考手册

Forge 文档治理系统的完整参考：Frontmatter 规范、CLI 工具、配置项、SSOT 嵌入机制。

## Frontmatter 规范

所有 `docs/` 目录下的 Markdown 文件**必须**包含 YAML frontmatter：

```yaml
---
title: "文档标题"
category: reference | onboarding | workflow | architecture
audience: [maintainer, contributor, beginner]
updated: 2026-01-15
---
```

### 必填字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `title` | string | 文档标题 |
| `category` | enum | `reference` / `onboarding` / `workflow` / `architecture` |
| `audience` | string[] | 目标受众 |
| `updated` | date | 最后更新日期（YYYY-MM-DD） |

### 可选字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `owner` | string | 维护团队 |
| `mirror_of` | string | 对应的中文/英文镜像文件名 |

### 规则

- `updated` 必须在 body 变更时同步更新（`check-docs-updated --fix` 自动修复）
- 中文文档（默认）不需要 `mirror_of`，英文镜像（`.en.md`）必须声明 `mirror_of`
- frontmatter-only 变更不需要更新 `updated` 字段

## CLI 工具

### 检查器（只读，退出码反映健康状态）

| 脚本 | 用途 | 标志 |
|------|------|------|
| `check-docs-frontmatter` | 验证 frontmatter 字段 | `--json` |
| `check-docs-bilingual` | 检查 CN/EN 配对 | `--json` |
| `check-docs-staleness` | 按日期检测过时文档 | `--json`, `--ci` |
| `check-docs-updated` | 检查 updated 字段与 body 变更一致性 | `--json`, `--fix` |
| `check-docs-links` | 验证内部链接 | `--json` |
| `check-docs-quota` | 强制文档数量上限 | `--json`, `--allow-grow` |
| `check-docs-index` | 验证 INDEX.md 同步 | `--json` |
| `check-docs-embeds` | 验证 SSOT 嵌入指令最新 | `--json` |
| `check-docs-root-whitelist` | 检查根目录 .md 文件 | `--json` |

### 构建器（写入输出）

| 脚本 | 用途 | 标志 |
|------|------|------|
| `build-docs-index` | 生成 INDEX.md / INDEX.en.md | `--json` |
| `build-docs-embeds` | 渲染所有 SSOT 嵌入指令 | `--json`, `--dry-run` |

### 迁移工具

| 脚本 | 用途 | 标志 |
|------|------|------|
| `migrate-docs-frontmatter` | 为缺失 frontmatter 的文档补全 | `--apply --force` |
| `scan-literal-mismatches` | 查找应使用 SSOT 的硬编码数值 | — |
| `install-hooks` | 配置 git hooks | — |

### 聚合命令

```bash
npm run docs:check    # 运行全部 9 个检查器
npm run docs:index    # 生成/更新 INDEX
npm run docs:embeds   # 渲染嵌入指令
```

## 配置

所有配置在 `.forge/config.md` 的 frontmatter 中：

```yaml
docs.max_count: 30                          # 文档数量上限
docs.root_whitelist: [README.md, ...]       # 根目录允许的 .md 文件
docs.grace_period_until: "2026-06-01"       # 宽限期（error 降级为 warning）
docs.ssot_sources:                          # SSOT 数据源注册
  - topic: "commands"
    source: "docs/_ssot/commands.json"
    renderer: "commands-table"
staleness.warning_days: 90                  # 过时警告天数
staleness.critical_days: 180                # 过时严重天数
```

## SSOT 嵌入机制

### 数据源

`docs/_ssot/` 目录存储 JSON 格式的 SSOT 数据：

| 文件 | 主题 | 渲染器 |
|------|------|--------|
| `commands.json` | 命令列表 | `commands-table` / `count` |
| `routing.json` | 三维路由表 | `routing-table` |
| `security-tiers.json` | 安全层级 | `security-tiers` |
| `gate-skills.json` | 安全门控 | `json-list` |

### 嵌入指令

```markdown
<!-- ssot:begin topic=commands render=count -->37<!-- ssot:end topic=commands -->
```

- `topic`: 数据源主题名
- `render`: 渲染器名（`commands-table` / `count` / `routing-table` / `security-tiers` / `json-list`）
- 标记之间的内容会被渲染器输出替换
- 支持单行和多行嵌入

### 渲染器

| 渲染器 | 输入格式 | 输出 |
|--------|---------|------|
| `commands-table` | `{name, tier, summary}[]` | Markdown 表格 |
| `routing-table` | `{tier, condition, sequence}[]` | Markdown 表格 |
| `security-tiers` | `{level, name, capabilities, constraints}[]` | 分级列表 |
| `json-list` | `{label, value}[]` | 标签值列表 |
| `count` | `any[]` | 数组长度 |

## Pre-commit Hook

`.githooks/pre-commit` 决策树：

1. 无文档变更 → 立即退出（轻量路径）
2. 根 `.md` 变更 → root-whitelist 检查
3. `docs/` 变更 → frontmatter、bilingual、index、updated 检查
4. `docs/_ssot/` 变更 → embed 同步检查
5. 配置变更 → staleness、links、quota 检查

每个检查器有可配置超时（默认 30s，`CHECKER_TIMEOUT` 环境变量）。

## 退出码

| 码 | 含义 |
|----|------|
| 0 | 无问题 |
| 1 | 发现错误 |
| 2 | 仅有警告 |
| 3 | 内部错误 |

## /forge learn 集成

`/forge learn` 在知识提取前自动运行三个检查器（quota、staleness、links），10s 预算。结果写入会话文件的"文档治理诊断"小节。
