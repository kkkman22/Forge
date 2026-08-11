---
status: completed
feature: spec-lifecycle-management
layout: requirements
created: 2026-05-29
tier: light
---
# Spec 生命周期管理

## 背景

Forge 项目的 `.tinkerman/specs/` 目录在快速迭代中积累了 87 个 spec，缺乏统一的生命周期管理：
- 无状态标记：无法区分 active / completed / deferred / archived
- 无索引：找到特定 spec 依赖文件系统浏览
- 无自动化：spec 完成后不会自动标记状态
- 无清理机制：过时 spec 永久堆积

本 spec 建立 spec 生命周期管理系统，作为长期基础设施。

## 需求

### 1. Spec 状态机

定义 spec 的生命周期状态：

```
draft → approved → in_progress → completed → archived
                   ↓
                deferred → in_progress（恢复时）
```

| 状态 | 含义 | 允许的转换 |
|------|------|-----------|
| `draft` | 初始草稿，未评审 | → approved, archived |
| `approved` | 已批准，等待开发 | → in_progress, deferred, archived |
| `in_progress` | 正在实现 | → completed, deferred |
| `completed` | 已完整实现 | → archived |
| `deferred` | 暂缓，有明确原因 | → in_progress, archived |
| `archived` | 已归档，不再活跃 | → draft（仅限重新激活） |

### 2. Spec Frontmatter Schema

每个 spec 的 `requirements.md` 头部必须包含：

```yaml
---
name: spec-name
status: in_progress
created: "2026-05-29"
updated: "2026-05-29"
priority: P1 | P2 | P3
tier: light | standard | full
depends_on: [other-spec-name]
replaces: [superseded-spec-name]  # 可选
replaced_by: [newer-spec-name]     # 可选
---
```

- 旧 spec 无 frontmatter 的，默认为 `status: active`（等同于 in_progress）
- `replaces` / `replaced_by` 建立替代关系链
- **status 单一事实源（2026-06-30 gap-remediate-0630 REQ-07 确立）**：spec 级 `status` 字段**只**写在 `requirements.md` 头部。`design.md` / `tasks.md` **不得**重复定义 `status:` 字段。曾因 design/tasks 的 status 野字段被污染（混入 `done|blocked|failed`、`<go|no-go>` 等非枚举值），导致 124/146 spec 三件套 status 不一致、`check-spec-status.mjs` 分布失真。`design.md`/`tasks.md` 若含 `status:` 会被 `check-spec-status.mjs` 报违规；`rebuild-spec-index.mjs` 与 `check-spec-status.mjs` 均以 `requirements.md` 的 status 为 spec 代表状态。

### 3. Spec 索引文件

#### 3.1 `INDEX.md` 自动生成

在 `.tinkerman/specs/INDEX.md` 维护全量索引：

```markdown
# Spec 索引

> 自动生成，请勿手动编辑。运行 `scripts/rebuild-spec-index.mjs` 更新。

## 活跃 Spec

| 名称 | 状态 | 优先级 | 档位 | 最后更新 |
|------|------|--------|------|---------|
| branch-lifecycle-enforcement | in_progress | P1 | standard | 2026-05-29 |
| ... | ... | ... | ... | ... |

## 已归档 Spec

| 名称 | 归档原因 | 替代者 |
|------|---------|--------|
| audit-remediation | 被 v221 替代 | audit-remediation-v221 |
| ... | ... | ... |
```

#### 3.2 索引构建脚本

- `scripts/rebuild-spec-index.mjs`：扫描所有 spec 目录，读取 frontmatter，生成 INDEX.md
- 支持增量更新（只重新生成变化的条目）
- CI 中作为 check 脚本运行，确保 INDEX.md 与实际 spec 同步

### 4. 自动化集成

#### 4.1 `/forge build` 完成时
- 检查 `.tinkerman/specs/` 中对应 spec 的 status
- 如果所有 tasks.md 中的任务均已完成 → 自动更新 status 为 `completed`

#### 4.2 `/forge ship` 完成时
- 在 ship 报告中包含 spec 状态变更摘要
- 更新 INDEX.md

#### 4.3 `/forge decide` 或 `/forge plan` 引用 spec 时
- 优先搜索 `status: approved` 或 `status: in_progress` 的 spec
- 忽略 `archived` 和 `replaced_by` 非空的 spec
- 对 `deferred` spec 发出提醒

### 5. Spec 模板

为新建 spec 提供模板 `templates/spec-template/`：

```
templates/spec-template/
├── requirements.md   # 带 frontmatter 的需求模板
├── design.md         # 设计文档模板
└── tasks.md          # 任务清单模板
```

## 验收标准

- [ ] Spec 状态机定义完成并在文档中记录
- [ ] Frontmatter schema 定义完成
- [ ] `scripts/rebuild-spec-index.mjs` 实现并可运行
- [ ] `INDEX.md` 生成且包含全部 87 个现有 spec
- [ ] 现有 spec 的 frontmatter 批量补充完成（至少 status 字段）
- [ ] `/forge build` 完成时自动更新 spec status
- [ ] Spec 模板创建完成
- [ ] CI 中集成 INDEX.md 一致性检查

## 依赖

- `spec-housekeeping`（先归档再建索引，但 worktree 并行时不阻塞）
- `docs-governance-system`（frontmatter schema 参考）
- `.tinkerman/specs/` 现有 spec 结构

**并行说明**：本 spec 与 `spec-housekeeping` 可在独立 worktree 中并行执行。本 spec 不移动/删除任何 spec 目录，只读写 frontmatter。合并时如有冲突，以本 spec 的 frontmatter 为准。

## 非目标

- 不实现 spec 评审流程（approved 状态由人工设置）
- 不实现 spec 版本控制（已有 git）
- 不修改现有已完成 spec 的内容
