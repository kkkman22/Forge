---
updated: 2026-08-11
---
# Closure-First Probes (Detailed)

## 3.4 Closure-First Probes (2 Probe + 1 Verify)

每个原子任务进入 TDD 循环前，**必须先执行 Closure-First 探针**。借鉴 Vibe-Skills 反死寂设计——避免 AI 在错误假设上浪费 token。

**Probe Execution Method**: Use `explore` agent (`Agent(prompt="<探针指令>", subagent_type="explore")`).

### Graph-Based Probe Strategy (Primary)

When `code-review-graph` is available, use graph queries for more precise results with ~80% fewer tokens (~1500 → ~300 tokens per probe set).

**Prerequisites**: Check `which code-review-graph` and verify index exists. If either fails, silently fall back to grep-based probes.

| Step | Primary Method (graph) | Fallback Method (grep) | Purpose |
|------|------|------|------|
| **Probe #1** | `code-review-graph query files <pattern>` | Glob-based file search | Confirm repo structure matches Plan assumptions |
| **Probe #2** | `code-review-graph query impact <symbol>` + `code-review-graph query callchain <function>` | Grep-based text search | Locate code entry points and dependency relationships |
| **Verify #1** | Run narrowest-scope verification command | Same | Confirm current codebase state is healthy |

### Fallback Detection

Before each probe execution:
1. Run `which code-review-graph` — if not found, use grep fallback
2. Check if graph index exists — if not built, use grep fallback
3. On timeout (>5s), fall back to grep for this probe execution only

### Probe Output Format

`🔍 Closure-First 探针（Task N） Probe #1：✅/❌ <结果> Probe #2：✅/❌ <结果> Verify #1：✅/❌ <结果> → 探针通过/失败`

**Failure Handling**: Probe #1 fails → check if Plan is outdated; Probe #2 fails → broaden search or NEEDS_CONTEXT; Verify #1 fails → fix existing issues first.

**Lightweight Path Exception**: Skip probes.
