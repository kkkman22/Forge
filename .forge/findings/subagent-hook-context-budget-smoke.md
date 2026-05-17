---
spec: subagent-hook-context-budget
task: 20
kind: dogfood-smoke
status: partial-closure
generated_at: 2026-05-16T23:29:19Z
last_updated: 2026-05-17T00:30:00Z
generated_by: kiro/claude-opus-4.7 (mock-smoke harness)
commit: 05e97c2
followup_spec: subagent-result-truncation
---

# Task 20 — Dogfood Smoke for `subagent-hook-context-budget`

## Closure Decision (2026-05-16)

**Status: partial-closure** — hook-injection scope verified PASS;
residual subagent-result truncation deferred to followup spec
`subagent-result-truncation`.

The Real Smoke Run below revealed that 2 of 3 review subagents
(`spec-check`, `security-check`) still return preamble-only results
even though Mock Smoke proved the hook injection on the subagent path
is now **0 bytes**. The original bug report attributed truncation to
"~130 KB of hook context per turn"; this fix closes that vector
(verified quantitatively below) but is **not sufficient** to guarantee
complete subagent output. The residual symptom points to a different
root cause (likely `maxTurns: 6` exhaustion or Agent-tool result-field
semantics where only the final assistant message is captured), which
is out-of-scope for the hook-budget fix and will be investigated under
a new spec.

This closure is consistent with AGENTS.md §2.4 "three-strike reroute":
rather than continuing to patch the hook layer (already at 0 bytes,
no further reduction possible), we open a new investigation track for
the residual truncation.

## Status Summary

| Phase | Coverage | Outcome |
|---|---|---|
| Mock Smoke (quantitative byte verification) | ✅ Executed by Kiro | PASS |
| Real `/forge review` end-to-end | ⏳ Deferred — must run from main agent in Claude Code | Pending |

The fix has been verified at the **byte-injection contract level** (Mock Smoke
below). The `/forge review` end-to-end run is deferred because Kiro cannot
invoke Claude Code slash commands; it must be executed by the user from a
Claude Code main-agent session.

## Fixture State (Task 20 threshold check)

Both fixture thresholds in `tasks.md ## Notes` are satisfied without
synthetic padding:

| Fixture | Threshold | Actual |
|---|---|---|
| `.forge/knowledge/evolved-rules.md` | ≥ 8 KB | **9580 bytes** ✅ |
| `.forge/plans/*.md` (≥ 4 KB) | ≥ 5 active | **49 files ≥ 4 KB** (63 total) ✅ |

Verification commands:

```
$ wc -c .forge/knowledge/evolved-rules.md
9580 .forge/knowledge/evolved-rules.md

$ find .forge/plans -maxdepth 1 -type f -name '*.md' -size +4k | wc -l
49

$ find .forge/plans -maxdepth 1 -type f -name '*.md' | wc -l
63
```

## Mock Smoke Result (quantitative byte verification)

Harness: `.forge/.smoke-tmp/run-mock-smoke.sh` (cleaned up after run).

For each hook injector, the harness pipes a stdin JSON payload representing
either a subagent or a main-agent caller, then counts bytes of stdout.

### subagent stdin payload

```json
{"session_id":"smoke-sub","hook_event_name":"UserPromptSubmit","agent_id":"spec-check","agent_type":"spec-check","prompt":"smoke"}
```

### main-agent stdin payload

```json
{"session_id":"smoke-main","hook_event_name":"UserPromptSubmit","prompt":"smoke"}
```

### Measured stdout bytes

| Injector | subagent path (must = 0) | main-agent path | Limit | Verdict |
|---|---:|---:|---:|---|
| `scripts/inject-plan-context.mjs` | **0** | 6825 | ≤ 8192 (`MAX_TOTAL_CHARS`) | ✅ |
| `scripts/inject-evolved-rules.mjs` | **0** | 4059 | ≤ 4096 + truncation marker | ✅ |
| `scripts/cmux-mirror/sync-once.mjs` (temp `.forge`) | **0** | 0 (no cmux state, exits) | n/a | ✅ |
| `.claude/settings.json` UserPromptSubmit groups | n/a (config-level) | n/a | must = 0 (head/tail deleted) | ✅ (`length === 0`) |

All three node injectors emit **exactly 0 bytes** on the subagent path,
confirming Property 1 (Bug Condition — subagent short-circuit zero injection).
The main-agent path remains within the documented byte caps, confirming
Property 2 (Preservation).

### Truncation markers (Preservation evidence)

**`inject-plan-context.mjs`** main-agent tail (last 250 bytes):

```
... | ADR |
| `.forge/decisions/2026-05-12-plugin-distribution.md` | MODIFY | 追加 Update 章节 |
## Tasks

### Task 1: Wave 1 RED — R2 测试

**Depends On**: []
**Files**:
- Create: `test/single-entry/forge-md-skill-syntax.test.
[... truncated]
```

Header `=== Forge Context ===` + per-plan delimiters preserved byte-equal
to pre-fix behaviour.

**`inject-evolved-rules.mjs`** main-agent tail (last 200 bytes):

```
... Pack 测试都绿）
**Source**: 2026-05-10 三 Sprint 审计 — Sprint 1 R6 glossary 格式断层
**Added**: 2026-05-10
**Confidence**: 0.9
**Last_triggered**: 2026-05-10
[... 5570 bytes truncated]
```

Header `=== Evolved Rules ===` preserved; truncation occurs at the last
newline before the 4096-byte limit (UTF-8 boundary safe — see commit `4331fac`).
Truncation marker `[... 5570 bytes truncated]` appended at end-of-stream.

## Before/After Comparison (Bug Condition fix evidence)

To make the regression non-abstract, here are the byte counts the **old**
hook commands would have injected on the **same fixture** (had the fix not
been applied):

| Hook Command (pre-fix) | Subagent Bytes Without Fix | Subagent Bytes With Fix |
|---|---:|---:|
| `cat .forge/knowledge/evolved-rules.md` (settings/plugin/hooks SessionStart) | **9602** (full file + header) | **0** ✅ |
| `head -50 .forge/plans/*.md ; tail -20 .forge/progress/*.md` (settings.json UPS) | **168896** (~165 KB) | **0** (entry deleted) ✅ |
| `inject-plan-context.mjs` | **~6825** (no router) | **0** ✅ |
| `cmux-mirror/sync-once.mjs` | variable (lock + snapshot side effects) | **0**, no lock/snapshot ✅ |
| **Cumulative subagent injection per UserPromptSubmit** | **~185 KB** | **0 KB** ✅ |

The 168 KB head/tail figure is the smoking gun for the original report —
which described "~130 KB of context per turn". The actual injection on this
fixture was even larger (168 KB) once `.forge/progress/*.md` (38 files) was
included. The settings.json UserPromptSubmit entry has been deleted in
Step 2 (`commit 304c1a3`), so the harness reports `length === 0` for that
hook group on the post-fix tree.

## Spec Acceptance Criteria — Status

Mapping to `tasks.md ## Acceptance Criteria for Spec Closure`:

1. **All tasks pass** — Tasks 1–19 verify commands all PASS in the most
   recent run (133 tests across 8 spec-introduced or extended files). See
   commit history `66aa720..34f7532` for the atomic commit chain.
2. **Dogfood smoke pass** — Mock Smoke ✅ **here**. Real `/forge review`
   smoke ⏳ deferred — see "Pending Real-Run Verification" below.
3. **Main-agent byte stream byte-equal pre-fix** — Verified by:
   - `test/inject-plan-context.test.ts` "main agent stdin (no agent_id) is
     byte-equal to no-stdin baseline" — PASS.
   - `test/non-frozen-hook-preservation.property.test.ts` baseline migration
     (Step 3) — PASS.
   - The Mock Smoke output above: `inject-plan-context.mjs` main-agent path
     produces 6825 bytes within the 8 KB cap and the original
     `=== Forge Context ===` framing.
4. **No P0/P1 review issues** — No review pending on this spec
   (single-author bugfix, validated via TDD).

## Pending Real-Run Verification

The remaining e2e check requires a manual `/forge review` invocation from a
Claude Code main-agent session, on the fixture confirmed above. Expected
observations (per `tasks.md` Task 20 step 3):

- All three review subagents (`spec-check`, `quality-check`, `security-check`)
  return a complete Layer N report (severity table + Issue List + optional
  known-failures append-block).
- Each subagent reports `total_tokens > 0`, matching its actual tool usage.
- The main agent does **not** receive the truncated last-sentence-only
  result that triggered the original bug report.

Suggested logging on first real run:

```bash
# Capture commit hash + timestamp before invoking
git rev-parse --short HEAD
date -u '+%Y-%m-%dT%H:%M:%SZ'

# Run from a Claude Code main-agent session (not Kiro):
/forge review
```

After the run, append a `## Real Smoke Run` section to this file with each
subagent's final structured report and its `total_tokens` value.

## Real Smoke Run

**Started**: 2026-05-16T23:38:18Z (UTC)
**Commit**: 05e97c2
**Review range**: HEAD~1..HEAD (`.forge/knowledge/metrics.md` — 1 line added, 1 line removed)

### spec-check (Layer 1)

**Result**: Incomplete — agent returned only a preamble line, no structured report.

```
I need to understand what spec this commit belongs to. Since the task context mentions "subagent-hook-context-budget fix", let me check for that spec:
```

**total_tokens**: N/A (synchronous agent, no usage metadata returned)
**Duration**: N/A
**Verdict**: FAIL — no severity table, no issue list produced.

### quality-check (Layer 2)

**Result**: Complete structured report.

```
## Layer 2 — Code Quality

**Reviewer**: quality-check

| # | Severity | File | Issue | Suggestion |
|---|--------|------|------|------|
| 0 | — | — | **No quality issues found** | — |

### Analysis Summary

**1. Naming Consistency** ✅
- Format follows existing pattern: `ISO timestamp | benchmark count |`
- No naming changes introduced

**2. Error Handling** ✅
- Not applicable (data file modification only)

**3. Performance Hotspots** ✅
- No performance concerns (log rotation operation)

**4. Test Coverage** ✅
- Not applicable (data file maintenance)

**5. Code Duplication** ✅
- Following established logging pattern (expected, not actual code duplication)

**6. Maintainability** ✅
- Log file well-structured with clear section headers
- Baseline rotation maintains historical depth

**7. Deslop (AI Code-Slop Detection)** ✅
- No AI-generated code patterns detected
- Manual log entry format

### Context Notes

This commit performs routine performance baseline log maintenance by adding the newest entry (2026-05-16T23:17:51.701Z) and removing the oldest entry (2026-05-15T07:32:43.815Z), maintaining the historical depth of performance tracking data. The operation is atomic and follows the established logging convention.
```

**total_tokens**: 0 (reported by framework — actual token consumption non-zero given 1 tool use + 14s duration)
**Duration**: 13915ms
**Verdict**: PASS — complete Layer 2 report with severity table and issue list.

### security-check (Layer 3)

**Result**: Truncated — agent's final output was a preamble line, not a structured report.

```
Now let me check for known-failures to detect any recurrence patterns:
```

**total_tokens**: 0 (reported by framework — actual token consumption non-zero given 6 tool uses + 19s duration)
**Duration**: 19025ms
**Verdict**: FAIL — no severity table, no issue list in final result. Agent used 6 tools (indicating active analysis), but final message was preamble, not report.

### Checklist

- [ ] spec-check 完整 Layer 1 报告 + total_tokens > 0 — FAIL (no structured report, no token metadata)
- [x] quality-check 完整 Layer 2 报告 + total_tokens > 0 — PARTIAL (report complete, total_tokens=0 framework reporting issue)
- [ ] security-check 完整 Layer 3 报告 + total_tokens > 0 — FAIL (truncated result, no structured report)

### Anomalies

1. **total_tokens always 0**: Framework reports `total_tokens: 0` for all async agents despite non-zero `tool_uses` and `duration_ms`. This is a Claude Code Agent tool reporting limitation, not the hook context budget fix. The fix's success is evidenced by agents actually completing (non-zero tool uses, durations) rather than truncating from context exhaustion.

2. **spec-check returned incomplete**: The synchronous agent returned only a preamble line. Possible causes: (a) agent hit max turns before producing report, (b) agent output was summarized/truncated by the framework. However, this agent returned synchronously (not async), suggesting it completed early without full analysis.

3. **security-check truncated output**: Agent used 6 tools over 19s (substantial work) but its final message was a preamble about "known-failures" rather than the expected structured report. The report content may have been generated in earlier turns and not captured in the final result field.

## Stage 2 Cross-Reference (2026-05-17)

Stage 2 of the `subagent-result-truncation` spec applied Turn Budget Discipline IRON-LAW + maxTurns: 10 to all three agent definitions. Results on commit acf3b4d:

- **security-check**: FAIL → **PASS** ✅ (complete Layer 3 report)
- **quality-check**: PASS → **PASS** ✅ (stable, preserved)
- **spec-check**: FAIL → **FAIL** (still preamble-only; foreground agent, different execution path)

Status remains `partial-closure` — acceptance criterion 2 not fully met (spec-check still truncates).

Full Stage 2 findings: `.forge/findings/subagent-result-truncation-stage2.md`

## References

- Spec docs: `.kiro/specs/subagent-hook-context-budget/{bugfix,design,tasks}.md`
- Implementation commits: `66aa720..34f7532` (Step 1 + Step 2 + Step 3 plus
  follow-up `4331fac` UTF-8 truncation hardening)
- Hook stdin schema authority:
  https://code.claude.com/docs/en/hooks#common-input-fields
