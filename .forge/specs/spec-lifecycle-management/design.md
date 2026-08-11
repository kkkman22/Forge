---
feature: spec-lifecycle-management
layout: design
created: 2026-05-29
---

# Spec 生命周期管理 — 设计文档

## 概述

为 `.forge/specs/` 目录建立生命周期管理系统，包括状态机定义、frontmatter schema、自动索引生成和 Forge 流程集成。

## 设计决策

### D1: 状态机实现方式

状态机不通过代码实现，而是通过 frontmatter 约定 + 脚本验证：

- **状态存储**: 每个spec的 `requirements.md` 的 YAML frontmatter
- **状态转换**: 由 `/forge` 命令在特定阶段自动更新
- **状态验证**: `rebuild-spec-index.mjs` 脚本检查状态合法性
- **不合法状态**: 如 `completed` spec 的 tasks.md 有未完成任务，脚本报错

状态转换规则：
```
draft → approved:    人工在 frontmatter 中设置
approved → in_progress: /forge plan 引用该 spec 时自动设置
in_progress → completed: /forge build 所有任务完成时自动设置
in_progress → deferred:  人工在 frontmatter 中设置
completed → archived:    spec-housekeeping 流程移动到 _archived/
deferred → in_progress:  人工恢复时设置
```

### D2: Frontmatter Schema

```yaml
---
name: spec-name                    # 必填，kebab-case
status: draft                      # 必填，枚举值
created: "2026-05-29"              # 必填，ISO date
updated: "2026-05-29"              # 必填，自动更新
priority: P2                       # 可选，P1/P2/P3，默认 P2
tier: standard                     # 可选，light/standard/full
depends_on:                        # 可选，依赖的其他 spec
  - other-spec-name
replaces:                          # 可选，本 spec 替代的旧 spec
  - superseded-spec
replaced_by:                       # 可选，替代本 spec 的新 spec
  - newer-spec
deferred_reason: "原因"             # status=deferred 时必填
deferred_date: "2026-05-29"        # status=deferred 时必填
---
```

Schema 验证：`rebuild-spec-index.mjs` 在生成索引时同时验证 frontmatter 合法性。

### D3: INDEX.md 生成脚本

脚本: `scripts/rebuild-spec-index.mjs`

```bash
# 全量重建
node scripts/rebuild-spec-index.mjs

# 增量更新（只更新变化的 spec）
node scripts/rebuild-spec-index.mjs --incremental

# 仅验证（不写文件，检查 frontmatter 合法性）
node scripts/rebuild-spec-index.mjs --check
```

脚本逻辑：
1. 扫描 `.forge/specs/` 下所有非 `_archived`、非 `_template` 的子目录
2. 读取每个 spec 的 `requirements.md` 头部 frontmatter
3. 验证 frontmatter 合法性（必填字段、状态枚举、日期格式）
4. 按 status 分组生成三张表格
5. 写入 `.forge/specs/INDEX.md`

INDEX.md 格式：
```markdown
# Spec 索引

> 由 `scripts/rebuild-spec-index.mjs` 自动生成。
> 最后更新: 2026-05-29

## 统计

| 状态 | 数量 |
|------|------|
| in_progress | 24 |
| completed | 40 |
| deferred | 12 |
| archived | 12 |

## 活跃 Spec

| 名称 | 状态 | 优先级 | 档位 | 依赖 | 最后更新 |
|------|------|--------|------|------|---------|
| ... | ... | ... | ... | ... | ... |

## Deferred Spec

| 名称 | 原因 | 暂缓日期 |
|------|------|---------|
| ... | ... | ... |

## 已归档 Spec

> 详见 `_archived/` 目录

| 名称 | 归档原因 | 替代者 |
|------|---------|--------|
| ... | ... | ... |
```

### D4: /forge build 集成

在 `/forge build` 完成时：
1. 读取当前 feature 对应的 spec 的 tasks.md
2. 检查所有任务的 checkbox 状态（`[x]` vs `[ ]`）
3. 如果全部 `[x]` → 更新 spec frontmatter: `status: completed`, `updated: today`
4. 如果部分完成 → 更新 `updated: today`（status 不变）

集成方式：在 build SKILL 的完成阶段添加 spec 状态检查步骤。

### D5: /forge plan 集成

在 `/forge plan` 引用 spec 时：
1. 读取被引用 spec 的 status
2. 如果 `archived` → 报错，提示已被归档，显示 replaced_by
3. 如果 `deferred` → 警告，提示该 spec 已暂缓
4. 如果 `draft` 或 `approved` → 更新 status 为 `in_progress`
5. 如果 `in_progress` → 正常继续

### D6: Spec 模板

```
templates/spec-template/
├── requirements.md
├── design.md
└── tasks.md
```

`requirements.md` 模板：
```markdown
---
name: {spec-name}
status: draft
created: "{date}"
updated: "{date}"
priority: P2
tier: standard
---

# {Spec 标题}

## 背景

<!-- 描述为什么需要这个 spec -->

## 目标

<!-- 描述本 spec 要达成的目标 -->

## 需求

### 1. {需求标题}

<!-- 详细需求描述 -->

## 验收标准

- [ ] {验收条件}

## 依赖

<!-- 依赖的其他 spec 或外部条件 -->

## 非目标

<!-- 明确说明本 spec 不做什么 -->
```

`design.md` 和 `tasks.md` 模板类似，包含占位符引导。

## 风险

| 风险 | 缓解 |
|------|------|
| Frontmatter 解析增加构建复杂度 | 使用简单的正则/YAML 解析，不引入重量级依赖 |
| 自动状态更新可能不准确 | `--check` 模式只验证不修改，人工可覆盖 |
| INDEX.md 冲突 | 团队协作时可能冲突，通过增量更新减少冲突面 |
| 87 个 spec 的 frontmatter 批量补充工作量大 | 分批进行，优先补充 in_progress 和 deferred 的 spec |
