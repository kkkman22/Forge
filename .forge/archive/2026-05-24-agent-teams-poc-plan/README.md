---
date: "2026-05-24"
archived_from: ".forge/plans/forge-decide-agent-teams.md"
spec_ref: ".kiro/specs/forge-decide-agent-teams"
reason: "PoC infrastructure shipped, live comparison runs never executed; superseded by Tier 1 governance in ROADMAP.md and ADR-0007"
status: "archived"
---

# 归档说明：forge-decide-agent-teams PoC plan

## 归档原因

`forge-decide-agent-teams` plan 在 2026-05-12 被批准（status: approved），目标是为 `/forge decide` 新增 Agent Teams 模式 PoC，对比 DAG vs Teams 的延迟 / token / 失败恢复，得出 adopt / keep / hybrid 决策。

截至 2026-05-24：

- ✅ **PoC 基础设施完整**：5 个 viewpoint agents、1 个 lead agent、`forge-decide-teams` skill、对比脚本、metrics 解析器、契约测试（30 个测试通过）
- ❌ **实际对比运行未执行**：`.forge/runs/decide-poc/` 不存在，12 次 PoC 运行（Topic A/B/C × DAG/Teams × 2 iter）从未发生
- ❌ **PoC 报告与 ADR 未产出**：tasks.md 中 Task 8/9/10 被标记 `[x]` 但 `.forge/decisions/<date>-agent-teams-poc.md` 不存在，archive 不存在

tasks.md 的复选框为投机性勾选，实际证据不足。

## 决策

不再继续 PoC 的"实际运行"部分，而是把 PoC 作为 **Tier 1 opt-in 实现**保留，由 ROADMAP v3.0 的 **Agent Teams 分层 adoption** 章节和 **ADR-0007** 共同治理：

1. `skills/forge/lib/decide-teams/instructions.md` 作为 opt-in PoC 继续存在，启用条件由 ROADMAP Tier 1 描述（macOS/Linux + tmux/iTerm2、full-tier、20 分钟内、5x token 预算、task type ∈ {architecture, research, debug-with-competing-hypotheses}）
2. 5 个 viewpoint agents（`.claude/agents/forge-decide-{arch,sec,cost,ops,product,lead}.md`）保留，由 ROADMAP Tier 0 任务"Subagent definition 复用"承接——它们将通过 frontmatter 改造同时支持 Subagent 和 teammate 两种调用形态
3. `scripts/run-decide-poc.sh` + `scripts/parse-decide-poc-metrics.mjs` + `test/forge-decide-teams.contract.test.ts` 保留，未来如要重启对比运行可直接复用
4. `.forge/audit-keep.md` 中 `forge-decide-teams` 的"Agent Teams 趋势 PoC"豁免条目继续生效

## 后续触发条件

仅当**任一**条件满足时重新激活 PoC 的实际对比运行：

- Anthropic 修复 `/resume` 不恢复 in-process teammates 的限制（官方 Limitations 列表移除该条目）
- Forge 用户提出明确的"DAG 模式不够用"反馈，且场景符合 Tier 1 启用条件
- 季度检视 Tier 3 限制清单时发现任一架构性限制被官方移除

## 归档清单

本目录仅保留指针，原文件留在源位置以方便引用：

- 计划文档：`.forge/plans/forge-decide-agent-teams.md`（保留，状态从 approved 改为 superseded）
- Spec：`.kiro/specs/forge-decide-agent-teams/`（保留只读）
- 实现：`skills/forge/lib/decide-teams/instructions.md`（保留作为 Tier 1 opt-in）
- Agent 定义：`.claude/agents/forge-decide-{arch,sec,cost,ops,product,lead}.md`（保留）
- 脚本与测试：`scripts/run-decide-poc.sh`、`scripts/parse-decide-poc-metrics.mjs`、`test/forge-decide-teams.contract.test.ts`（保留）

## 相关决策

- ADR-0007（review / build / loop 永不回迁 Agent Teams）
- ROADMAP.md v3.0 章节（Tier 0/1/2/3 分层 adoption）
- ADR-0002（capability-library scope —— `forge-decide-teams` 排除在能力库外）
