---
topic: "triage-observability-metrics"
date: "2026-06-17"
status: "confirmed"
source: "juejin Loop Engineering 深度实践指南 §8 可观测性 + loop-engineering-adoption R2 后续增强"
dispatch_mode: "inline"
tier: "light"
---

# Decision: triage 可观测性 metric

> 来源：掘金《Loop Engineering 深度实践指南》(2026) §8「可观测性 + 动态断点」。
> 触发：作为 loop-engineering-adoption PR #98 R2 triage 的后续增强评估。

## Product Definition

**Problem**：当前 `/forge triage` 跑完后，用户只能看到 inbox 里多了几条，但看不到 triage 本身的运行健康度——拉了多少个发现源、各源返回多少条、降级了几次、耗时多少。当 triage"什么都没发现"时，用户无法区分是"真没事"还是"Jira MCP 挂了静默降级到 git 导致漏报"。

**Users**：开了定时 triage 的用户（`--install` 后），以及手动跑 triage 想确认发现源是否正常工作的用户。

**Success Criteria**：
- 每次 triage 跑完，`/forge triage --status` 能显示上次运行的 metric：各发现源是否启用、是否成功、返回条数、降级次数。
- metric 落盘到 `.tinkerman/state/triage-state.json`（已有的 state 文件），不新增独立 metric 系统。
- 零新依赖，纯扩展现有 state 结构。

**Scope Boundaries**：
- ❌ 不做实时动态断点 / 热修改参数（掘金 §8 的另一半，产品形态不匹配，需 WebSocket 管理面板）。
- ❌ 不做 OTEL/distributed tracing（过重，triage 是轻量发现工具）。
- ❌ 不做 inbox 条目的 SLA/趋势图表（那是 backlog 管理工具的职责）。

## Technical Solution

**Tech Selection**：扩展 `.tinkerman/state/triage-state.json`（PR #98 已建）的 schema，新增 `last_run` 对象。纯 schema 扩展 + triage skill 写入，零新依赖。

当前 schema（PR #98）：
```json
{ "last_triage_at": "", "last_triage_sources_used": [], "inbox_stats": {...} }
```

扩展后：
```json
{
  "last_triage_at": "",
  "last_triage_sources_used": ["jira-sprint", "bitbucket-pr", "git"],
  "last_run": {
    "sources": {
      "jira-sprint": { "status": "ok|degraded|error", "findings": 3, "duration_ms": 1200 },
      "bitbucket-pr": { "status": "degraded", "findings": 0, "duration_ms": 0, "reason": "mcp-not-configured" },
      "git": { "status": "ok", "findings": 1, "duration_ms": 80 }
    },
    "total_findings": 4,
    "degradation_events": 1,
    "total_duration_ms": 1280
  },
  "inbox_stats": { "open": 4, "in_progress": 0, "done": 0, "skip": 0 }
}
```

`status` 三态：`ok`（源正常返回）/ `degraded`（MCP 不可用降级）/ `error`（源抛错被 catch）。`--status` 命令渲染这个 `last_run`。

**Risks**：
- **state 文件膨胀**（每次 run 追加历史）：影响低。缓解：`last_run` 只存最近一次（覆盖式），历史不保留（triage 是发现工具不是审计工具）。
- **duration_ms 在 skill 层测不准**（agent 执行时间含 LLM 推理）：影响低。缓解：duration 只测"源拉取"段（MCP 调用 + git 命令），不含 LLM 分析；标注为"近似"。

**Scalability**：无。schema 扩展是 O(1)。

**Compatibility**：PR #98 的 triage-state.json 已预留了 `last_triage_sources_used` 字段（目前是空数组），本决策只是把它结构化。与 triage skill instructions §9 Execution Flow 的 step 6（Update state）无缝衔接——当前只写 `last_triage_at`，扩展为写整个 `last_run`。

## Security Assessment

**OWASP Check**：
- **A09 安全日志与监控不足**：本决策**正面改善**——可观测性增强让 MCP 降级/失败可见，避免"静默漏报"的安全盲区。

**STRIDE Analysis**：
- **Information Disclosure**：`last_run` 含 sources/finding 计数，已在 `.tinkerman/state/`（PR #98 已加入 .gitignore，不进 git）。无新增泄露面。
- **Repudiation**：triage 无审计需求，state 是运行时产物非审计日志。

**Conclusion**：无安全风险，反而改善可观测性。

## ADR Criteria Check
<!-- Manual inline assessment -->

```
ADR Criteria Check:
  Reversibility: soft (schema 扩展可回退)
  Surprising: false (是现有 state 结构的自然扩展)
  Trade-off alternatives: [独立 metric 文件 (被否:增加文件数), OTEL (被否:过重)]
  Verdict: DISCARD
```

Verdict = **DISCARD**：纯 schema 扩展、可逆、不令人意外，无需 ADR 也无需 inline note，直接在 spec/实现里做即可。

## Veto Record

None.

## 决策结论

**做。Light tier。** 作为 PR #98 R2 triage 的**直接补丁**（可并入 PR #98 或紧随其后的小 PR），因为：
1. 改动极小（triage-state.json schema 扩展 + skill instructions 的 step 6 + `--status` 渲染）。
2. 它修补的是 PR #98 已有的"静默降级不可见"问题，属同一功能的完善，不是新方向。
3. 风险低、独立性强，适合 Light tier（`build → review`）快速交付。

与方向 1（动态重规划）不同：方向 1 是新 spec（引擎改动、Standard tier），方向 2 是现有 PR 的增强补丁（Light tier）。
