---
status: draft
feature: session-journal-retention
layout: requirements
created: 2026-06-17
tier: light
---
# Session Journal Retention — 需求文档

## 背景

`.tinkerman/knowledge/sessions/*.md` 是 `/forge learn` 自动写入的会话摘要（Requirement 7.9，`src/learn.ts:289`）和 `failure-sink.ts` 自动追加的失败 episode。单文件为 ≤20 行摘要（`knowledge-backflow.md:40`），不含原始对话。

**现状缺口**：Forge 对其他时序数据都有 retention 机制，唯独 sessions/ 缺失——

| 目录 | retention | 执行者 |
|------|-----------|--------|
| `.tinkerman/runs/` | `event_log_retention_days: 30` | `scripts/prune-event-logs.sh` |
| `.tinkerman/reviews/` | `findings_retention_days: 30` | `scripts/prune-event-logs.sh` |
| `.tinkerman/knowledge/solutions/` | §4.2 的 20 文档上限 + Confidence<0.3 清理 | `/forge learn` deep-reconciliation |
| `.tinkerman/knowledge/sessions/` | **无** | **无** |

当前规模小（7 文件 / ~7KB），不构成性能问题；但随项目长期使用，sessions/ 会无界增长，且 `/forge resume` 只读取最近 3 条（`knowledge-backflow.md:42`），历史摘要的长期堆积价值递减。本 spec 在缺口扩大前补齐 retention，复用 §4.2 已有的 confidence 排序清理机制，不新造一套。

**来源**：Claude Code CHANGELOG 2.1.169 `post-session` lifecycle hook（snapshot 未提交工作或导出日志）启发；Forge 的 session 自动写入已实现（learn.ts:289），本 spec 只补 retention 这块。

## 目标

- 为 `.tinkerman/knowledge/sessions/` 建立与 runs/、reviews/ 一致的 retention 机制。
- 复用 §4.2 的 confidence 排序策略，不引入新的清理维度。
- 保护被 `/forge resume` 依赖的最近会话和被 solutions 引用的高价值会话不被误删。

## 需求

### Requirement 1: session retention 脚本

**User Story:** 作为 Forge 维护者，我希望有一个脚本按配置清理过期的 session 摘要，避免 sessions/ 无界增长。

#### 验收标准

1. THE `scripts/prune-sessions.sh` SHALL 存在并遵循 `scripts/prune-event-logs.sh` 的相同结构（`--help` / `--dry-run` / `set -euo pipefail` / 退出码语义）。
2. THE 脚本 SHALL 从 `.tinkerman/config.md` frontmatter 读取 `session_retention_days`（默认 90）作为 mtime 过期阈值。
3. THE 脚本 SHALL 删除 mtime 早于阈值的 `.tinkerman/knowledge/sessions/*.md` 文件。
4. THE `--dry-run` 模式 SHALL 只报告将删除的文件列表，不实际删除。
5. THE `--help` 模式 SHALL 输出 usage 和 retention 配置说明。
6. THE 脚本 SHALL 归类为 user-facing（frontmatter `# category: user-facing`），遵循 §2.8 Scripts as Black Box 铁律。

### Requirement 2: config 字段

**User Story:** 作为 Forge 用户，我希望可以通过配置调整 session 保留时长。

#### 验收标准

1. THE `.tinkerman/config.md` SHALL 新增 `session_retention_days: 90` 字段（默认 90）。
2. WHEN 字段缺失或非正整数，THE 脚本 SHALL 回退到默认值 90 并在 stderr 输出一条 warning。
3. THE `forge init` 模板（`templates/config.md`）SHALL 包含 `session_retention_days` 字段及注释。

### Requirement 3: 保护规则（不可删除的 session）

**User Story:** 作为 Forge 用户，我希望被 solutions 或 resume 引用的会话不被 retention 误删。

#### 验收标准

1. THE 脚本 SHALL 保留最近 N 条 session（按 mtime 降序），N 由 config `session_keep_recent` 控制（默认 5），无论是否过期。
2. THE 脚本 SHALL 保护被 `.tinkerman/knowledge/solutions/*.md` 的 `source_session` 字段引用的 session 文件（引用关系见 `src/glossary.ts:57`）。
3. THE 被保护的文件 SHALL 在 `--dry-run` 输出中标注 `[protected]`，不进入删除候选。

### Requirement 4: 集成到既有清理流程

**User Story:** 作为 Forge 维护者，我希望 session 清理与 event-logs 清理在同一时机触发。

#### 验收标准

1. THE `scripts/prune-event-logs.sh` SHALL 在清理完 runs/ 和 reviews/ 后调用 `prune-sessions.sh`（或文档化二者由同一 cron / learn deep-reconciliation 触发）。
2. THE 清理结果 SHALL 追加一行摘要到 `.tinkerman/knowledge/tool-health.md`（格式与 event-logs 清理一致），便于审计。

## 验收标准

- [ ] `scripts/prune-sessions.sh` 存在，通过 `--help` / `--dry-run` / 正常运行三种模式测试
- [ ] `.tinkerman/config.md` 和 `templates/config.md` 含 `session_retention_days` 字段
- [ ] 最近 5 条 + solutions 引用的 session 在过期后仍被保留
- [ ] `npm run check` 全绿（含新增脚本的 `validate-scripts-help.mjs` 校验）

## 依赖

- 无外部依赖。复用 `scripts/prune-event-logs.sh` 的 config 解析模式。

## 非目标

- **不**实现 Claude Code 2.1.169 的 `post-session` lifecycle hook——session 自动写入已由 `src/learn.ts:289`（Req 7.9）和 `failure-sink.ts` 完成，本 spec 只补 retention。
- **不**改变 session 摘要的格式或写入逻辑。
- **不**引入向量检索或语义相似度清理——当前规模（≤20 文档上限）下 tag/confidence 策略已足够，属过度优化。
- **不**处理 `.tinkerman/knowledge/sessions/` 以外的 knowledge 子目录（solutions/ 走 §4.2，不在本 spec 范围）。
