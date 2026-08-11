---
updated: 2026-08-11
---
# Status Updates & Execution Flow

## 7. Status Updates

**7.1** Progress → `.tinkerman/progress/<topic>.md` per task. **7.2** Interim → `.tinkerman/knowledge/sessions/<date>-<topic>-interim.md` (≤15 lines, overwrite, delete after learn/done, resume reads first). **7.3** Phase → `.tinkerman/status.md`. **7.4** Health → `.tinkerman/knowledge/tool-health.md`: ≥80% 🟢 / 50-79% 🟡 / <50% 🔴.

| Done | phase → |
|---|---|
| plan | build |
| build | review |
| review | test / completed (light) |
| test | ship |
| ship | learn / completed |
| learn | completed |

---

## 8. Execution Flow

1. Path: Light / Standard / Full
2. Gates (standard/full): Spec + Plan + Dir + Branch
3. Init Counter N=3
4. Loop: Probes → TDD → status → progress → commit → counter-1
5. Full: Phase 1 research → Phase 2 modules
6. Final Validation
7. Delete interim → 自动调用 /tinkerman review（→ 详见 shared/next-step-protocol.md）

3 consecutive same-fix → `/tinkerman debug`

---

## 10. Example

```
$ /tinkerman build
🔍 前置检查... ✅ Spec 已锁定 / Plan 已批准
📋 执行计划（5 任务）
🔴 RED → FAIL ✓  🟢 GREEN → PASS ✓  🔵 REFACTOR → PASS ✓
✅ Task 1 → 提交 → 1/5
```

---

## Context Budget Management

Mandatory token limits, structured outputs exempt. → 详见 references/context-budget.md

**Trimmer 函数映射**（概念名 → 实际函数调用）：

| 概念名 | 函数调用 | 参数来源 | 返回值用途 |
|--------|---------|---------|-----------|
| Explore_Summarizer | `serializeExploreResult(exploreOutput)` | Explore Agent 原始返回值 | 替换 context 中的原始 Explore 输出为结构化摘要（≤300 tokens） |
| Subagent_Summary_Protocol | `serializeSubagentSummary(subagentOutput)` | Subagent 原始返回值 | 替换 context 中的执行日志为提取摘要（≤200 tokens） |
| Test_Output_Trimmer | `serializeTestOutput(testOutput)` | 测试运行原始输出（先解析为 `TestOutputSummary`） | all-pass 时替换为单行；failures 时保留仅失败项（≤300 tokens） |
| Git_Output_Limiter | `serializeGitDiff(diffSummary, lineCount)` / `serializeGitStatus(statusSummary, fileCount)` | git 命令输出（先解析为 `GitDiffSummary` / `GitStatusSummary`） | diff >50 行或 status >30 文件时替换为文件级摘要（≤200 tokens） |
