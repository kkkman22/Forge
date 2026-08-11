---
feature: session-journal-retention
layout: design
created: 2026-06-17
---

# Design Document: Session Journal Retention

## Overview

为 `.tinkerman/knowledge/sessions/` 补齐缺失的 retention 机制。新增 `scripts/prune-sessions.sh`（仿 `prune-event-logs.sh`）+ 两个 config 字段（`session_retention_days`、`session_keep_recent`），复用 §4.2 的 confidence/引用保护策略。

**变更范围**：
- 新增 `scripts/prune-sessions.sh`
- 修改 `.tinkerman/config.md`（新增 2 个字段）
- 修改 `templates/config.md`（同步）
- 修改 `scripts/prune-event-logs.sh`（末尾调用 prune-sessions，或仅文档化触发关系）
- 新增测试 `test/scripts/prune-sessions.test.ts`（或 .sh）

**不涉及**：session 写入逻辑（learn.ts / failure-sink.ts）、摘要格式、其他 knowledge 子目录。

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  触发时机（二选一，不重复）                                │
│  A. prune-event-logs.sh 末尾串行调用 prune-sessions.sh   │
│  B. /forge learn deep-reconciliation Phase 5 已有清理，   │
│     本脚本作为独立的运维清理入口（cron / 手动）            │
└──────────────────────┬──────────────────────────────────┘
                       │
           ┌───────────▼────────────────┐
           │  prune-sessions.sh          │
           │                             │
           │  1. 读 config:               │
           │     - session_retention_days │
           │       (默认 90)              │
           │     - session_keep_recent    │
           │       (默认 5)               │
           │  2. 枚举 sessions/*.md       │
           │  3. 计算 mtime 过期集        │
           │  4. 减去保护集:              │
           │     - 最近 N 条(mtime 降序)  │
           │     - solutions 引用的       │
           │       (source_session 字段)  │
           │  5. 删除差集                  │
           │  6. 写 tool-health.md 摘要   │
           └─────────────────────────────┘
```

## Components and Interfaces

### Component 1: prune-sessions.sh

结构完全对齐 `prune-event-logs.sh`：

```bash
#!/usr/bin/env bash
# category: user-facing
# prune-sessions.sh — Remove expired .tinkerman/knowledge/sessions/*.md
#
# Reads `session_retention_days` (default 90) and `session_keep_recent`
# (default 5) from `.tinkerman/config.md` frontmatter.
#
# Usage:
#   bash scripts/prune-sessions.sh            # normal run
#   bash scripts/prune-sessions.sh --dry-run  # report only
```

**保护集计算**（本脚本的核心逻辑，prune-event-logs.sh 没有这步，因为 runs/ 无引用关系）：

1. **mtime 保护**：`ls -t sessions/*.md | head -n $KEEP_RECENT` 得到最近 N 条 basename 集合。
2. **引用保护**：`grep -h '^source_session:' .tinkerman/knowledge/solutions/*.md` 提取被引用的 filename 集合（`src/glossary.ts:57` 定义 source_session 就是 sessions/ 下的 filename）。
3. 最终删除集 = 过期集 − mtime保护集 − 引用保护集。

### Component 2: config.md 变更

```yaml
session_retention_days: 90   # sessions/*.md 的 mtime 保留天数，正整数，默认 90
session_keep_recent: 5       # 无论是否过期，按 mtime 保留最近 N 条，正整数，默认 5
```

### Component 3: prune-event-logs.sh 集成

在 `prune-event-logs.sh` 末尾（清理完 runs/ 和 reviews/ 之后）追加：

```bash
# Chain session journal pruning (spec: session-journal-retention)
if [[ -x "${SCRIPT_DIR}/prune-sessions.sh" ]]; then
  bash "${SCRIPT_DIR}/prune-sessions.sh" ${DRY_RUN_FLAG}
fi
```

用 `DRY_RUN_FLAG` 透传 `--dry-run`，保证 dry-run 模式下两个脚本都不实际删除。

## Key Design Decisions

| Decision | Chosen Path | Rejected Path | Reason |
|----------|-------------|---------------|--------|
| retention 维度 | mtime + 引用保护 | confidence 排序 | sessions/ 摘要无独立 confidence 字段；solutions/ 才走 confidence（§4.2）。mtime 是 sessions/ 唯一可靠的时效信号 |
| 默认保留天数 | 90 天 | 30 天（同 runs/） | session 摘要是知识资产（resume 依赖），比 run 事件流价值高、密度低（≤20 行/文件），保留期应更长 |
| 保护最近 N 条 | N=5 | N=3（resume 实际读数） | resume 读 3 条是"恢复用"，但用户手动翻阅历史可能超过 3 条；5 留余量且成本极低 |
| 集成方式 | prune-event-logs 串行调用 | 独立 cron | 两者触发时机本就该一致（learn deep-reconciliation / 定期运维），串行避免多一个 cron 配置点 |
| 引用保护 | grep source_session 字段 | 解析 YAML frontmatter | source_session 是 solutions/ 的简单字段（glossary.ts:57），grep 足够且无 YAML 解析依赖 |

## Error Handling

| 场景 | 行为 |
|------|------|
| config 无 session_retention_days 字段 | 回退默认 90，stderr warning |
| session_retention_days 非正整数 | 回退默认 90，stderr warning |
| sessions/ 目录不存在 | 静默退出 0（nothing to prune） |
| solutions/ 引用了不存在的 session | 忽略（保护集只对实际存在的文件生效） |
| dry-run 模式 | 输出候选列表含 `[protected]` 标注，不删除 |
| 删除失败（权限） | stderr error，该文件跳过，继续处理其他，退出码 1 |

## Testing Strategy

1. **单元/集成测试**：构造临时 `.tinkerman/` 结构（含过期文件、保护文件、被引用文件），运行脚本验证删除集正确。
2. **dry-run 测试**：确认输出列表与实际删除集一致，且不产生副作用。
3. **config 回退测试**：删除 config 字段，确认回退默认值 + warning。
4. **`--help` 测试**：`validate-scripts-help.mjs` 校验（§2.8 铁律）。
5. **回归**：`npm run check` 全绿，特别确认 `check-dist-sync` / `validate-scripts-help` 不报错。
