---
updated: 2026-08-11
---
# Recovery Priority Chain（error-recovery-strategy R7）

恢复时**先**执行 8 步恢复优先级链，收集**全部**不一致后再一次性呈现（不在第一个不一致处停下）：

1. **读 Status_Document** — `.tinkerman/status.md` frontmatter（phase / tier / current_task）。
2. **读 Interim_Log** — `.tinkerman/knowledge/sessions/*-interim.md`（若存在）；步骤 1–2 的结果作为后续对账的基线。
3. **扫描 git log** — `git log --pretty=format:"%H%x00%s%x00%ci" <run-start>..HEAD`，做 commit→task 匹配（`extractCommitPatterns` + `matchCommitsToTasks`）。
4. **检查 git status** — `git status --porcelain` 检测未提交改动（`parseGitStatus`）。
5. **对账 Progress_Document** — `.tinkerman/progress/<topic>.md` 对照 git log，发现 committed-but-not-marked / dependency gap（`findProgressInconsistencies` + `findDependencyGaps`）。
6. **对账 phase** — all-tasks-done 但 phase 未推进 / 任务未完但 phase 超前（`findPhaseInconsistencies`）。
7. **分类中断点** — clean-state / committed-not-progress-updated / progress-updated-not-phase-advanced / task-completed-not-committed / subagent-mid-execution（`classifyInterruption`）。
8. **生成 Recovery_Report** — 聚合全部不一致 + 各自的 category / evidence / recommendedAction（`buildRecoveryReport`）。

## 实现：`runRecoveryChain(input)`

纯函数，位于 `src/resume.ts`，按上述固定顺序编排 `src/error-recovery/` 的检测原语，返回 `RecoveryReport`。

**调用方式**：
1. 收集原始输入：`git log` / `git status --porcelain` 输出 + status.md 的 phase/tier/current_task + progress 任务条目 + plan 内容（提取 commit 模式）。
2. 调用 `runRecoveryChain(input)` → 得到 `RecoveryReport`。
3. 把 `report.inconsistencies` 逐条呈现给用户（category / evidence / recommendedAction）。
4. 用户确认后，按依赖顺序应用修复（progress 对账先于 phase 对账），每步验证修复生效。
5. **零不一致**（`report.summary.totalInconsistencies === 0`）时直接进入 Five-Question 自动定位。

## 优先级链的不变量

- **顺序固定**（R7.1）：8 步顺序不可调换；步骤 5 的 progress 对账必须在步骤 6 的 phase 对账之前。
- **收集而非停下**（R7.2）：即使步骤 5 发现不一致，仍继续执行步骤 6–8，把所有不一致聚合进同一份报告。
- **纯函数无副作用**：`runRecoveryChain` 不写盘、不应用修复；R7.3（呈现）/ R7.4（应用修复）由调用方负责。
