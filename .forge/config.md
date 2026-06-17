---
project: "Forge"
stack:
  - "TypeScript"
  - "JavaScript"
  - "Shell"
security_level: 1
knowledge_limit: 20
max_parallel_agents: 6    # Range: 1-10, default 6
review.subagent_concurrency: 3  # Range: 1-10; default 3; env FORGE_REVIEW_CONCURRENCY overrides
# Review/decide subagent 超时（分钟），按路由 Tier 区分。整组缺失→全 Tier 15min（向后兼容）。
review.agent_timeout_minutes.light: 5       # Light tier 默认 5 分钟
review.agent_timeout_minutes.standard: 15   # Standard tier 默认 15 分钟
review.agent_timeout_minutes.full: 30       # Full tier 默认 30 分钟
findings_retention_days: 30
# 会话摘要 retention（spec: session-journal-retention）。由 scripts/prune-sessions.sh 执行。
session_retention_days: 90   # sessions/*.md 的 mtime 保留天数，正整数，默认 90
session_keep_recent: 5       # 无论是否过期，按 mtime 保留最近 N 条，正整数，默认 5
review_dispatch_mode: inline           # inline | agents
decide_dispatch_mode: auto              # inline | agents | auto — auto: full tier→agents, standard/light→inline
output_conciseness_hook: on            # on | off
forge_compact_restate_reminder: on       # on | off — inject restate reminder into compact snapshot
forge_compact_restate_threshold_tasks: 3  # restate reminder trigger threshold
postooluse_inject_warnings: on         # on | off
review_use_ultrareview: true           # true | false
review_force_model: ""                  # Optional: override all reviewers to use this model (empty = per-agent)
review_confidence_threshold: 75         # Confidence gate threshold (0-100). Findings below this suppressed unless P0@50+
review_enable_adversarial: true         # Enable adversarial-check agent (Full tier default, Standard conditional)
review_enable_validation: true          # Enable validation pass (Full tier only)
context_budget: 100000                  # Context token budget for compact-safe mode threshold
post_push_verify_enabled: true
build.use_goal: true    # true=使用 /goal 循环（推荐），false=旧 persistent-loop TDD 循环
ci_check_command: "npm run check"
# cmux integration (cmux-integration R11.9) — all optional, no required fields.
# cmux is env-detected (CMUX_WORKSPACE_ID); these flags tune behavior when cmux is present.
cmux_integration: auto              # auto (default) | on | off — on+unavailable emits a one-time warning
cmux_notification_budget: 5         # 每个会话的桌面通知上限，正整数或 0，默认 5
cmux_review_notify: on              # on | off; 是否发送评审聚合通知，默认 on
cmux_session_idle_minutes: 15       # 会话空闲超时（分钟），正整数，默认 15
cmux_respawn_budget: 3              # Mirror_Daemon 崩溃后自动重启上限，正整数或 0，默认 3
docs.grace_period_until: "2026-06-01"
docs:
  max_count: 35                     # 文档配额上限，ADR-0042 从默认 30 调高，授权 forge-triage.md 新增
docs.ssot_sources:
  - topic: "commands"
    source: "docs/_ssot/commands.json"
    renderer: "commands-table"
  - topic: "routing"
    source: "docs/_ssot/routing.json"
    renderer: "routing-table"
  - topic: "security-tiers"
    source: "docs/_ssot/security-tiers.json"
    renderer: "security-tiers"
  - topic: "gate-skills"
    source: "docs/_ssot/gate-skills.json"
    renderer: "json-list"
---

# 项目配置

- **项目名称**：Forge
- **技术栈**：TypeScript,JavaScript,Shell
- **安全级别**：标准（Level 1）
- **知识库上限**：20
- **初始化时间**：2026-04-28

## CI 检查命令

build 阶段的全量测试和 test 阶段的验证清单必须使用以下命令，不得自行拼凑：

```bash
npm run check    # = tsc --noEmit && biome check src/ test/ && vitest run && bash scripts/check-readme-metrics.sh
npm run docs     # typedoc 文档生成验证
bash scripts/build-dist.sh  # 分发包同步校验
```

## 状态文件保护分区

`.forge/` 目录下的文件按修改权限分为三个区域：

### 冻结区（Frozen）— AI 不可修改

<HARD-GATE name="frozen-zone-protection">

以下文件一旦进入锁定/批准状态，AI 在 build 阶段**不得修改**，除非用户明确解锁：

- `.forge/specs/*/spec.md`（status: locked）
- `.forge/plans/*.md`（status: approved）
- `.forge/config.md`

</HARD-GATE>

### 受保护区（Guarded）— AI 可追加，不可删除或覆盖

以下文件 AI 可以追加内容，但不得删除已有内容或覆盖文件（维护清理操作除外）：

- `.forge/progress/*.md`（只能标记任务完成，不能删除任务或修改已完成的记录）
- `.forge/reviews/*.md`（只能写入新评审，不能修改已有评审结果）
- `.forge/knowledge/instincts.md`（只能追加或更新置信度，不能删除已有模式，除非维护清理）
- `.forge/knowledge/known-failures.md`（只能追加或更新，不能删除已有失败模式，除非维护清理）
- `.forge/knowledge/solutions/*.md`（只能追加或合并，不能随意删除，除非维护清理）
- `.forge/decisions/ADR-*.md`（已发布 ADR，只能追加新文件或通过 supersession 再渲染 frontmatter）

**ADR 专项规则**（`.forge/decisions/ADR-NNNN-*.md`）：仅允许以下两类操作——

1. **追加新 ADR 文件**：由 `/forge decide` 自动生成，新文件编号经 `nextAdrId` 分配。
2. **supersession 更新**：通过 `finalizeAdr` 对旧 ADR 再渲染 frontmatter（`status=superseded`、`superseded_by=新ID`），body 保持不变。

禁止：直接编辑已发布 ADR 的 Context/Decision/Consequences 正文；删除 ADR 文件；修改已分配的 `id`/`date`/`deciders` 字段。模板文件 `.forge/decisions/ADR-TEMPLATE.md` 不属于 ADR，可以自由修改。

### 开放区（Open）— AI 可自由修改

以下文件 AI 可以自由创建和修改：

- `.forge/status.md`（状态更新）
- `.forge/decisions/[0-9]*.md`（非 ADR 决策转录文档，例如 `<YYYY-MM-DD>-<topic>.md` 视角对话全文；注意 `ADR-*.md` 属于受保护区）
- `.forge/runs/*/`（forge-loop 事件流；retention 由 `event_log_retention_days` 控制，默认 30 天；保留策略由 `scripts/prune-event-logs.sh` 执行）
- `.forge/findings/*.md`（研究发现）
- `.forge/debug/*.md`（调试记录）
- `.forge/knowledge/sessions/*.md`（会话上下文）
- `.forge/knowledge/metrics.md`（指标追踪）
- `.forge/knowledge/tool-health.md`（工具健康度）
- `.forge/knowledge/skill-feedback.md`（SKILL 反馈）
- `.forge/ship/*.md`（ship 阶段产物，含 post-push-verify 报告；保留 30 天）

## Skills Dispatcher Mode

`skills.dispatcher_mode`: `collapsed` (default) | `legacy`

- `collapsed`：使用 `skills/forge/lib/` 路径（v2.5+，spec R2.10）
- `legacy`：使用旧 `skills/forge-X/SKILL.md` 路径（v2.4 兼容；需配合 `git revert` 物理迁移才能真正生效；本字段仅声明意图，dispatcher 在 collapsed 路径下统一处理）

> v2.5 起 `legacy` 模式仅在迁移期保留为 advisory。完整 dispatcher 实现见 ADR-0004。
