---
spec: subagent-result-truncation
stage: 3
commit: b2d1f65
generated_at: 2026-05-17T00:34:16Z
experiment: background-fallback
result: complete
closure_upgraded_by: forge-review-diff-context-fidelity-stage2 (2026-05-17)
followup_spec: subagent-foreground-truncation (RESOLVED via cascade closure)
three_strike_reroute_triggered: true
---

# Subagent Result Truncation — Stage 3 Real Smoke

## Closure Note (Stage 3 — three-strike reroute)

Stage 3 fallback experiment failed. spec-check 连续三次失败：

| Stage | 实验变量 | 结果 |
|---|---|---|
| 1 | maxTurns 10 + Turn Budget Discipline + Mandatory Read 合并 | spec-check 通过（fixture 仅 1 行 metrics.md，未扫 plans） |
| 2 | + 同样改造扇出至 quality / security | spec-check 截断（fixture 是 172 行测试改动），qual/sec 通过 |
| 3 | spec-check 加 `background: true` | spec-check 截断（plans-enumeration loop 与 Stage 2 一致），qual/sec 通过 |

**真正的 Bug Condition（事实校准后）**：

spec-check 在 review 时执行 R6（Claimed New File Existence on main branch）+ R7（Pack/Loader Integration Evidence）检查，需要枚举 `.forge/plans/` 下的文件做存在性验证。当 fixture 含 ≥ N 个 plan 文件（本次 fixture: 49 个）时，spec-check 把所有 turn 都消耗在 Read/Grep plans 文件上，从未进入文本生成阶段。

quality-check / security-check 通过**不是**因为 background 模式（Stage 3 已证伪）。它们通过是因为不做 spec/plan 存在性验证：quality-check 只看 diff 里的代码质量，security-check 只看安全维度，都不需要扫 `.forge/plans/`。

按 AGENTS.md §2.4 三次失败重排（Three-Strike Reroute），停止在本 spec 内继续修补 spec-check。把残留问题转入新 spec `subagent-foreground-truncation`，从可观测证据出发重新形式化 Bug Condition：

```
C(X) :≡  reviewer 是 spec-check
           ∧ fixture 含 ≥ N_plans active plan files
           ∧ subagent 在 Plans-enumeration loop 中耗尽 maxTurns
           ∧ result 字段不含结构化报告
```

新 spec 需要调查的方向（不在本 spec 范围）：

1. **Plans-enumeration scoping**：spec-check 的 R6/R7 检查是否应该按 review topic 限定到 `.forge/plans/<topic>.md` 而不是枚举整个目录？
2. **Plans context injection 移到 hook 层**：让 SessionStart 把 plans 索引注入 prompt 而非让 subagent 运行时枚举？
3. **diff-scoped 限制**：R6 仅在 diff 中出现 `claimed new file` 字样时触发，而不是无条件扫描？
4. **检查项分层**：把 R6/R7 从 spec-check 拆出到独立的 `pack-integration-check` agent，spec-check 仅做 contract extraction？

**Hypothesis**: Adding `background: true` to spec-check.md frontmatter would make it as stable as quality-check/security-check (both `background: true`).

**Result**: **Hypothesis DISPROVEN.** spec-check truncated with identical pattern despite `background: true`.

### Agent Results

| Agent | Layer | Result | Tool Uses | Duration (ms) | Complete Report | Starts with Preamble |
|-------|-------|--------|-----------|---------------|-----------------|---------------------|
| spec-check | L1 | TRUNCATED | 6 | 19712 | NO — zero text output | N/A |
| quality-check | L2 | PASS | 2 | 16942 | YES | NO |
| security-check | L3 | PASS | 0 | 10583 | YES | NO |

### spec-check Detail

- **Stop reason**: `tool_use` (not `end_turn`) — agent exhausted turns still reading files
- **Turn breakdown** (all 6 were tool calls, zero text):
  - Turn 0: Read (file_path)
  - Turn 1: Glob (pattern)
  - Turn 2: Grep (pattern search)
  - Turn 3: Grep (pattern search with glob)
  - Turn 4: Read (file_path, limit, offset)
  - Turn 5: Grep (pattern search with -A context)
- **Last action**: Grep in `.forge/plans/specs-unchecked-tasks-remediation.md` around line 75-94 (reading about background: true task)
- **No text output produced at all**

### quality-check Detail

- Complete Layer 2 report with severity summary + issue list + verdict
- P0:0 P1:0 P2:0 P3:0, PASS
- 2 tool uses (Read + Grep), both before report generation

### security-check Detail

- Complete Layer 3 report with severity summary + issue list + verdict
- P0:0 P1:0 P2:0 P3:0, PASS
- 0 tool uses (minimal diff = no security concerns to investigate)

### Conclusion

`background: true` is NOT the variable differentiating spec-check from quality/security stability. spec-check has a structural problem:

1. **Context payload size**: spec-check reads `.forge/plans/` extensively (49 active plans ≥ 4KB). The Grep results from plans inject massive context per turn.
2. **Turn budget exhaustion**: Even with `maxTurns: 10`, spec-check burns through turns on exploratory reads/greps of plan files before synthesizing output.
3. **quality-check/security-check succeed because**: minimal diff = minimal investigation needed. They complete in 0-2 tool calls. spec-check always does extensive plan/spec reading regardless of diff size.

### Four Checklist Items

- [ ] ~~spec-check 完整 Layer 1 报告 + 不以 preamble 起头~~ **FAIL** — zero text output, truncated at turn 6
- [x] quality-check 完整 Layer 2 报告 + 不以 preamble 起头
- [x] security-check 完整 Layer 3 报告 + 不以 preamble 起头
- [x] spec-check 实际以 background 模式运行 (confirmed: launched with `run_in_background: true`, agent frontmatter has `background: true`)

### Next Steps (per AGENTS.md §2.4 Three-Strike Reroute)

This is spec-check's **third consecutive failure** across Stage 1/2/3. Per §2.4:

1. Stop attempting the same fix direction
2. Open new spec: `subagent-foreground-truncation` investigating root cause
3. Root cause hypothesis shift: foreground vs background is ruled out. New hypotheses:
   - **H1**: `.forge/plans/` context injection via SessionStart hooks still flooding spec-check (hook-stdin-router fix not yet deployed)
   - **H2**: spec-check prompt triggers more exploratory reads than quality/security — needs prompt constraint (e.g., "max 2 file reads")
   - **H3**: maxTurns: 10 is insufficient when plans/ contains 49 files — needs dedicated diff-scoped prompt, not full plans scan
