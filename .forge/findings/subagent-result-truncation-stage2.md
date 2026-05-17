---
spec: subagent-result-truncation
stage: 2
commit: acf3b4d
generated_at: 2026-05-17T00:24:00Z
result: complete
closure_upgraded_by: forge-review-diff-context-fidelity-stage2 (2026-05-17)
---

# Subagent Result Truncation — Stage 2 Dogfood Smoke

## Fixture

| Fixture | Threshold | Actual |
|---|---|---|
| `.forge/knowledge/evolved-rules.md` | ≥ 8 KB | 9580 bytes ✅ |
| `.forge/plans/*.md` (≥ 4 KB) | ≥ 5 active | 49 files ✅ |

## Review Target

- Commit: acf3b4d
- Diff: HEAD~1..HEAD
- Files: `test/agent-prompt-discipline.property.test.ts` (NEW, +131), `test/agent-prompt-discipline.test.ts` (MODIFIED, +43 -1)
- Total: +172 -1

## Stage 2 Real Smoke

**Started**: 2026-05-17T00:24:00Z
**Commit**: acf3b4d

### spec-check (Layer 1) — foreground agent

**Result**: Incomplete — agent returned only a preamble line, no structured report.

```
基于 diff 内容和测试文件，我现在可以分析这次变更。让我检查实际测试实现是否完整：
```

**total_tokens**: 0 (framework reporting)
**tool_uses**: 0 (foreground agent, no usage metadata)
**Duration**: N/A (foreground, no timing metadata)
**Verdict**: FAIL — no severity table, no issue list produced. Preamble-only output.

### quality-check (Layer 2) — background agent

**Result**: Complete structured report. PASS.

```
## Layer 2 — Code Quality

**Reviewer**: quality-check

| # | Severity | File | Issue | Suggestion |
|---|--------|------|------|------|
| 1 | P2 | `test/agent-prompt-discipline.property.test.ts` | `ContractCheckResult` 接口定义与使用位置相距较远，可内联 | 考虑将接口定义移至使用位置或改为 `type` 别名 |
| 2 | P3 | `test/agent-prompt-discipline.test.ts` | Stage 2 测试为空骨架，仅有注释描述 | 补充测试用例或添加 TODO 标记说明实现计划 |
| 3 | P3 | `test/agent-prompt-discipline.property.test.ts` | 常量 `VALID_BODY` 定义在函数外部，但在多个测试中单次突变使用 | 考虑在每个测试中生成独立的 VALID_BODY，避免全局变量污染 |
| 4 | P3 | `test/agent-prompt-discipline.property.test.ts` | 魔法数字 `50` 和 `30` 作为 `numRuns` 参数重复出现 | 提取为命名常量 `PBT_NUM_RUNS_FULL = 50` / `PBT_NUM_RUNS_LIGHT = 30` |
| 5 | P2 | `test/agent-prompt-discipline.test.ts` | 新增导入 `existsSync` 但未在可见代码中使用 | 若为 Stage 2 预留则添加 `// Stage 2` 注释，否则移除 |

**Deslop 检测结果**: 无 AI 代码异味发现。

**总体评估**: 代码质量良好，主要是 P3 级别的风格优化建议。P2 问题均非阻断性，Stage 2 测试骨架为有意占位。
```

**total_tokens**: 0 (framework reporting)
**tool_uses**: 2
**Duration**: 10587ms
**Verdict**: PASS — complete Layer 2 report with severity table, issue list, and deslop analysis.

### security-check (Layer 3) — background agent

**Result**: Complete structured report. PASS.

```
## Layer 3 — Security & Risk

**Reviewer**: security-check

| # | Severity | File | Issue | Suggestion |
|---|--------|------|------|------|
| 1 | P2 | `test/agent-prompt-discipline.property.test.ts:72` | Property-based test generates weak invalid inputs (0-9 range) | Consider using more realistic negative test cases or document why this range is sufficient |
| 2 | P3 | `test/agent-prompt-discipline.test.ts:175` | File existence test with absolute path resolution | Path traversal risk is low here (test code), but consider using relative paths for test data |
```

**total_tokens**: 0 (framework reporting)
**tool_uses**: 4
**Duration**: 8425ms
**Verdict**: PASS — complete Layer 3 report with severity table and issue list.

### Stage 1 → Stage 2 Comparison

| Subagent | Stage 1 (maxTurns: 6, no TBD) | Stage 2 (maxTurns: 10, with TBD) | Delta |
|----------|-------------------------------|----------------------------------|-------|
| spec-check | FAIL (preamble) | FAIL (preamble) | No change |
| quality-check | PASS | PASS | Stable |
| security-check | FAIL (preamble) | PASS (complete) | **Fixed** ✅ |

### Analysis

1. **security-check fixed**: Stage 1 FAIL → Stage 2 PASS. The Turn Budget Discipline + maxTurns: 10 resolved the truncation. This is the key positive result.

2. **quality-check preserved**: Stage 1 PASS → Stage 2 PASS. Layer 2 output has 5 issues (1×P2 + 3×P3 + 1×P2), severity table with 5 columns, Layer 2 heading — structurally consistent with Stage 1 baseline.

3. **spec-check still fails**: The foreground agent still returns preamble-only output. Possible causes:
   - Foreground vs background agent execution difference (spec-check runs foreground per SKILL.md §18)
   - Agent tool result-field semantics: foreground agents may capture only the last assistant message, which could be a mid-turn preamble if the agent didn't reach its final report turn
   - The agent definition changes may not have taken effect for foreground mode
   - `maxTurns: 10` may still be insufficient if the agent's step 0 + step 0.5 + analysis consumes more turns than expected

### Checklist

- [ ] spec-check 完整 Layer 1 报告 + 不以 preamble 起头 — **FAIL** (preamble only)
- [x] quality-check 完整 Layer 2 报告 + 不以 preamble 起头 — **PASS**
- [x] security-check 完整 Layer 3 报告 + 不以 preamble 起头 — **PASS**
- [x] quality-check Preservation: Layer 标题 `## Layer 2 — Code Quality` 一致; severity 表格 5 列 (#/Severity/File/Issue/Suggestion); 5 行 issues; 自然语言波动 ≤ 5% — **PASS**

### Follow-up Required

spec-check (foreground) truncation persists despite Turn Budget Discipline + maxTurns: 10. Per AGENTS.md §2.4 three-strike reroute, this should be investigated in a new debug session rather than further patching the agent definition.
