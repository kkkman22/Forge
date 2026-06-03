# Spec 索引

> 由 `scripts/rebuild-spec-index.mjs` 自动生成。
> 最后更新: 2026-05-30

## 统计

| 状态 | 数量 |
|------|------|
| draft | 11 |
| approved | 0 |
| in_progress | 7 |
| completed | 50 |
| superseded | 14 |
| deferred | 3 |
| archived | 14 |

## 活跃 Spec

| 名称 | 状态 | 优先级 | 档位 | 依赖 | 最后更新 |
|------|------|--------|------|------|---------|
| configchange-hook | draft |  | light |  | 2026-05-30 |
| plugin-data-persistence | draft |  | light |  | 2026-05-30 |
| decide-auto-dispatch | draft |  | standard | plugin-data-persistence | 2026-05-30 |
| review-pipeline-enhancement | draft |  | standard | configchange-hook | 2026-05-30 |
| build-goal-replace-loop | draft |  | standard | configchange-hook | 2026-05-30 |
| agent-frontmatter-hardening | draft |  | light |  | 2026-05-30 |
| hook-system-enhancement | draft |  | standard | agent-frontmatter-hardening | 2026-05-30 |
| forge-init-env-optimization | draft |  | light |  | 2026-05-30 |
| observability-enhancement | draft |  | standard |  | 2026-05-30 |
| misc-forge-optimization | draft |  | light |  | 2026-05-30 |
| context-explosion-defense | draft |  | standard |  | 2026-05-30 |
| docs-governance-system | in_progress |  |  |  | 2026-01-01 |
| local-ci-parity | in_progress |  |  |  | 2026-01-01 |
| missions-inspired-rigor | in_progress |  |  |  | 2026-01-01 |
| sandbox-phased-implementation | in_progress |  |  |  | 2026-01-01 |
| ship-gate-hardening | in_progress |  |  |  | 2026-01-01 |
| spec-lifecycle-management | in_progress |  |  |  | 2026-01-01 |
| subagent-truncation-fix | in_progress |  |  |  | 2026-01-01 |

## 已完成 Spec

| 名称 | 状态 | 最后更新 |
|------|------|---------|
| agent-team-migration | completed | 2026-01-01 |
| archive-transcript-purge | completed | 2026-05-12 |
| build-discipline-enhancement | completed | 2026-01-01 |
| ccbp-hardening-phase2 | completed | 2026-05-12 |
| ccbp-inspired-hardening | completed | 2026-01-01 |
| ci-check-integration | completed | 2026-01-01 |
| claude-md-self-evolution | completed | 2026-01-01 |
| cmux-integration | completed | 2026-01-01 |
| cmux-skills-collapse | completed | 2026-01-01 |
| community-ecosystem | completed | 2026-01-01 |
| context-optimization | completed | 2026-01-01 |
| cursor-team-kit-integration | completed | 2026-05-09 |
| ddd-tactical-bdd-collaboration | completed | 2026-01-01 |
| dist-sync-guard | completed | 2026-01-01 |
| documentation-onboarding | completed | 2026-01-01 |
| engineering-governance-hardening | completed | 2026-01-01 |
| error-recovery-strategy | completed | 2026-01-01 |
| feature-dossier-index | completed | 2026-01-01 |
| forge-decide-agent-teams | completed | 2026-05-12 |
| forge-resume-from-pr | completed | 2026-05-12 |
| forge-review-fix-optimization | completed | 2026-01-01 |
| forge-slimming-followups | completed | 2026-01-01 |
| forge-slimming-plan | completed | 2026-01-01 |
| frozen-zone-structured-feedback | completed | 2026-05-12 |
| i18n-support | completed | 2026-01-01 |
| output-bloat-control | completed | 2026-01-01 |
| output-conciseness | completed | 2026-01-01 |
| oz-skills-inspiration | completed | 2026-01-01 |
| pack-system | completed | 2026-01-01 |
| parallel-status-tracking | completed | 2026-01-01 |
| plan-document-streamlining | completed | 2026-01-01 |
| plugin-distribution | completed | 2026-05-12 |
| plugin-init-experience | completed | 2026-01-01 |
| pms-pack-v1 | completed | 2026-01-01 |
| process-lifecycle-management | completed | 2026-01-01 |
| remaining-backlog | completed | 2026-01-01 |
| review-no-mainagent-fallback | completed | 2026-01-01 |
| review-report-methodology-field | completed | 2026-01-01 |
| review-subagent-concurrency | completed | 2026-01-01 |
| routing-assumptions | completed | 2026-01-01 |
| ship-gate-commit-verification | completed | 2026-01-01 |
| skill-behavioral-guardrails | completed | 2026-01-01 |
| skill-composability | completed | 2026-01-01 |
| skill-function-integration-audit | completed | 2026-01-01 |
| skills-cross-pollination | completed | 2026-01-01 |
| state-resilience | completed | 2026-01-01 |
| token-language-optimization | completed | 2026-01-01 |
| typedoc-api-docs | completed | 2026-01-01 |
| ultrareview-ci-integration | completed | 2026-05-12 |
| workflows-integration | completed |  |

## Superseded Spec

> 曾标记 completed，但交付物已被 loop/SDK 架构重构（d73f51f2/ddf6d4d1/b4f377dc）有意移除。

| 名称 | 原状态 | 替代者 |
|------|--------|--------|
| multi-platform-support | completed | **wontfix** — 新架构不走自建 SDK driver，AgentRegistry 无消费方 |
| sdk-driver-decomposition | completed | ScheduleWakeup/Cron 原生调度 |
| audit-remediation-v221 | completed | 部分项随模块删除而废弃 |
| branch-lifecycle-enforcement | completed | branch-gate.ts 保留 topic gate |
| ship-delivery-unification | completed | **wontfix** — forge-ship Skill 内联处理已覆盖需求，git-transaction 抽象层无必要 |
| loop-skills-fusion | completed | 纯函数保留，驱动层删除 |
| build-goal-replace-loop | draft | phase-transition-guard.sh |
| phase-advance-hardening | completed | phase-transition-guard.sh |
| observability-enhancements | completed | logger/perf 库保留，驱动集成层删除 |
| structured-observability | completed | 同上 |
| v2.4-review-followups | completed | 部分 review 改进已合入主流程 |
| branch-isolation-recommendation | completed | EnterWorktree 内置策略 |
| skill-document-optimization | completed | 统一 SKILL.md 重构 |
| token-budget-compression | completed | 统一 SKILL.md 重构 |

## Deferred Spec

| 名称 | 原因 | 暂缓日期 |
|------|------|---------|
| forge-loop-desktop-app | Claude Code 桌面版已覆盖核心场景，独立桌面应用优先级降低 |  |
| review-comment-bitbucket | Bitbucket 集成优先级低于 GitHub/GitLab | 2026-05-29 |
| sandbox-execution | Claude Agent SDK 已原生支持 OS 级沙箱，Forge 自建沙箱优先级降低 |  |

## 已归档 Spec

> 详见 `_archived/` 目录

| 名称 | 归档原因 | 替代者 |
|------|---------|--------|
| audit-remediation | archived |  |
| claude-code-uplift | archived |  |
| claude-code-uplift-2.1.153 | archived |  |
| cmux-064-alignment | archived |  |
| cmux-claude-uplift-0.64 | archived |  |
| context-bloat-control | archived |  |
| context-budget-management | archived |  |
| forge-context-mcp-bundling | archived |  |
| single-entry-command-consolidation | archived |  |
| spec-housekeeping | archived |  |
| sprint-3-gap-remediation | archived |  |
| subagent-notification-consumption-migration | archived |  |
| workflows-integration-resilience | archived |  |
| workflows-integration-wiring | archived |  |
