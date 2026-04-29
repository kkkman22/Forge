---
topic: "context-budget-management"
date: "2026-04-29"
result: "fail"
p0_count: 0
p1_count: 3
p2_count: 5
p3_count: 3
---

## Layer 1 -- Spec Alignment

**Reviewer**: spec-check

### Requirement Coverage Matrix

| Requirement | AC | Status | Notes |
|-------------|-----|--------|-------|
| Req 1.1 (four lifecycle categories) | -- | Implemented | `InformationLifecycle` type has all four categories |
| Req 1.2 (Persistent retention) | -- | Implemented | Classification mapping assigns persistent to plan-task-list, current-task, key-interfaces |
| Req 1.3 (Phase-scoped summary on phase end) | -- | Implemented | tdd-test-output, closure-first-probes mapped to phase-scoped |
| Req 1.4 (Ephemeral immediate summary) | -- | Implemented | explore-results, test-output, git-diff, git-status, subagent-results mapped to ephemeral |
| Req 1.5 (Write-and-discard confirmation only) | -- | Implemented | review-reports, progress-updates, decision-documents mapped to write-and-discard |
| Req 1.6 (classification mapping for all sources) | -- | Implemented | CLASSIFICATION_MAP covers all 13 sources listed in design.md |
| Req 2.1 (Explore summary fields) | -- | Implemented | ExploreSummary has entryPoints, dependencyChain, relatedTests, keyInterfaces, fileGroups |
| Req 2.2 (Explore <= 300 tokens) | -- | Implemented | Property 2 test checks char/4 approximation <= 300 |
| Req 2.3 (>5 files grouped) | -- | Partially Implemented | See P2 finding below |
| Req 2.4 (preserve entry point paths) | -- | Implemented | Serializer always outputs entryPoints with filePath:line |
| Req 2.5 (error passthrough) | -- | Not Implemented in TypeScript | See P1 finding below |
| Req 3.1 (persist full review to .forge/reviews/) | -- | Implemented (SKILL) | SKILL doc instructs to write full output to .forge/reviews/ |
| Req 3.2 (retain findings summary only) | -- | Implemented | ReviewSummary serializer outputs severity counts + findings list |
| Req 3.3 (<= 400 tokens) | -- | Implemented | Property 3 test checks <= 400 tokens |
| Req 3.4 (file path reference) | -- | Implemented | Serializer includes filePath reference |
| Req 3.5 (zero findings single line) | -- | Implemented | When total===0 && findings.length===0, outputs single-line confirmation |
| Req 4.1 (all-pass single summary line) | -- | Implemented | When failed===0, outputs single line with stats |
| Req 4.2 (failures: only failing details) | -- | Implemented | Only failure entries are included when failed > 0 |
| Req 4.3 (all-pass <= 150 tokens) | -- | Implemented | Property 4 test checks <= 150 tokens |
| Req 4.4 (vitest format support) | -- | Not Implemented | See P2 finding below |
| Req 4.5 (unparseable format passthrough) | -- | Not Implemented in TypeScript | See P1 finding below |
| Req 5.1 (diff >50 lines file summary) | -- | Implemented | serializeGitDiff with lineCount > 50 produces per-file summary |
| Req 5.2 (status >30 files category summary) | -- | Implemented | serializeGitStatus with fileCount > 30 produces category summary with <=10 per category |
| Req 5.3 (diff <=50 lines passthrough) | -- | Implemented | When lineCount <= 50, produces simplified output |
| Req 5.4 (status <=30 files passthrough) | -- | Implemented | When fileCount <= 30, produces simplified output |
| Req 5.5 (full diff preserved in temp file) | -- | Implemented | fullDiffPath field in GitDiffSummary |
| Req 6.1 (structured result fields) | -- | Implemented | SubagentSummary has all required fields |
| Req 6.2 (Orchestrator extracts only defined fields) | -- | Implemented (SKILL) | SKILL docs instruct extraction of Subagent_Summary_Protocol fields |
| Req 6.3 (<= 200 tokens) | -- | Implemented | Property 6 test checks <= 200 tokens |
| Req 6.4 (BLOCKED/NEEDS_CONTEXT blocking reason) | -- | Implemented | Conditional blockingReason field |
| Req 6.5 (DONE_WITH_CONCERNS concerns) | -- | Implemented | Conditional concerns field |
| Req 6.6 (consistent across all invocations) | -- | Implemented (SKILL) | Referenced in forge-build, forge-review, forge-decide SKILL docs |
| Req 7.1 (forge-build SKILL budget section) | -- | Implemented | forge-build/SKILL.md has "## 上下文预算管理" with Explore_Summarizer, Test_Output_Trimmer, Git_Output_Limiter, Subagent_Summary_Protocol |
| Req 7.2 (forge-review SKILL budget section) | -- | Implemented | forge-review/SKILL.md has "## 上下文预算管理" with Write-and-discard, Review_Summarizer |
| Req 7.3 (forge-decide SKILL budget section) | -- | Implemented | forge-decide/SKILL.md has "## 上下文预算管理" with Subagent_Summary_Protocol, Write-and-discard |
| Req 7.4 (existing content preserved) | -- | Implemented | Contract tests verify TDD rules, severity grading, three-layer review, OWASP/STRIDE all preserved |
| Req 8.1 (Restatement identifies phase-scoped info) | -- | Partially Implemented | SKILL doc mentions phase-scoped but no explicit identification logic |
| Req 8.2 (Restatement verifies write-and-discard persisted) | -- | Not Implemented in TypeScript | See P2 finding below |
| Req 8.3 (no increase to Restatement token budget) | -- | Implemented | SKILL doc says budget status line is omitted if it would exceed 1,500 tokens |
| Req 8.4 (budget status line in Restatement) | -- | Implemented | forge-build SKILL has the "Savings ~saved_tokens tokens" line |
| Req 9.1 (session-end budget report) | -- | Partially Implemented | ContextBudgetReport model + serializer exists but no session-end trigger |
| Req 9.2 (report written to .forge/knowledge/sessions/) | -- | Partially Implemented | ContextBudgetReport serializer produces Markdown format, but file path logic not in TypeScript |
| Req 9.3 (savings < 30% warning) | -- | Implemented | serializeContextBudgetReport includes warning when savingsPercentage < 30 |
| Req 10.1 (Subagent round-trip) | -- | Implemented | Property 7 test |
| Req 10.2 (Explore round-trip) | -- | Implemented | Property 8 test |
| Req 10.3 (Review round-trip) | -- | Implemented | Property 9 test |
| Req 10.4 (Test output round-trip) | -- | Implemented | Property 10 test |
| Req 10.5 (Git output round-trip) | -- | Implemented | Property 11 test |

### Property Test Coverage Matrix

| Property | Spec Reference | Status | Notes |
|----------|---------------|--------|-------|
| Property 1: Classification mapping correctness | Req 1.1, 1.6 | Covered | Three test cases: unique lifecycle mapping, no duplicate sources, undefined for unknown |
| Property 2: Explore summary format constraints | Req 2.2, 2.3 | Covered | Token limit + grouped format tests |
| Property 3: Review summary format constraints | Req 3.3, 3.4 | Covered | Token limit + file path reference tests |
| Property 4: Test output trimmer correctness | Req 4.1, 4.2, 4.3 | Covered | All-pass <= 150 tokens + failure details test |
| Property 5: Git output limiter threshold behavior | Req 5.1, 5.2 | Covered | Diff > 50 + status > 30 tests |
| Property 6: Subagent summary format completeness | Req 6.1, 6.3, 6.4, 6.5 | Covered | Token limit + BLOCKED + DONE_WITH_CONCERNS tests |
| Property 7: Subagent round-trip | Req 10.1 | Covered | Full field comparison round-trip |
| Property 8: Explore round-trip | Req 10.2 | Covered | Full field comparison round-trip |
| Property 9: Review round-trip | Req 10.3 | Covered | Full field comparison round-trip |
| Property 10: Test output round-trip | Req 10.4 | Covered | Full field comparison round-trip |
| Property 11: Git output round-trip | Req 10.5 | Covered | Both GitDiffSummary and GitStatusSummary round-trips |

### SKILL Document Contract Coverage

| Contract Test | Spec Reference | Status | Notes |
|---------------|---------------|--------|-------|
| forge-build has budget section | Req 7.1 | Covered | Tests "## 上下文预算管理" heading |
| forge-build references all 4 trimmers | Req 7.1 | Covered | Explore_Summarizer, Test_Output_Trimmer, Git_Output_Limiter, Subagent_Summary_Protocol |
| forge-build preserves existing content | Req 7.4 | Covered | TDD rules, Restatement, Closure-First |
| forge-review has budget section | Req 7.2 | Covered | Tests "## 上下文预算管理" heading |
| forge-review references Review_Summarizer | Req 7.2 | Covered | |
| forge-review preserves severity + three-layer | Req 7.4 | Covered | P0-P3, spec/quality/security-check |
| forge-decide has budget section | Req 7.3 | Covered | Tests "## 上下文预算管理" heading |
| forge-decide references Subagent_Summary_Protocol | Req 7.3 | Covered | |
| forge-decide preserves viewpoints + OWASP/STRIDE | Req 7.4 | Covered | product/architect/security, OWASP, STRIDE |

### Scope Creep Assessment

No scope creep detected. All implemented features trace back to Spec requirements:

- ContextBudgetReport serializer/deserializer -- traces to Req 9.1
- Barrel file exports -- traces to standard module export pattern (not a new requirement)
- Barrel file count update (35 exports) -- maintenance of existing barrel file test

No features were found that are not specified in the requirements or design documents.

---

## Issue List

| # | Severity | Issue | Fix Suggestion |
|---|----------|-------|----------------|
| 1 | **P1** | Req 2.5: Explore error/empty passthrough not implemented in TypeScript. The Spec states "IF the Explore agent returns an error or empty result, THEN THE Explore_Summarizer SHALL pass through the error message without transformation." The TypeScript `serializeExploreSummary` function always produces a formatted summary and has no error/empty-result passthrough logic. | Add an error passthrough path in `serializeExploreSummary` (e.g., check for empty/null input or add a dedicated function). Add corresponding unit test. |
| 2 | **P1** | Req 4.5: Test output unparseable format passthrough not implemented in TypeScript. The Spec states "IF the test runner output cannot be parsed (unrecognized format or corrupted output), THEN THE Test_Output_Trimmer SHALL retain the original output without modification and log a warning." There is no parse failure detection or passthrough logic in the deserializer. | Add parse validation with fallback to raw output in `deserializeTestOutput`. Add warning log mechanism and corresponding unit test. |
| 3 | **P1** | Req 4.4: vitest output format support is not tested. The Spec states "THE Test_Output_Trimmer SHALL support vitest output format as the primary test runner." While the serializer/deserializer can produce/consume the defined format, there is no test verifying actual vitest output format compatibility (e.g., parsing real vitest output samples). | Add unit tests with representative vitest output samples to verify the parser handles actual vitest format correctly. |
| 4 | **P2** | Req 2.3: The ">5 files grouped" test is a hardcoded example, not a property test. The Spec requires that "WHEN the Explore agent returns results containing more than 5 files, THE Explore_Summarizer SHALL group files by module." The current test in Property 2 uses a single hardcoded example with 3 fileGroups (total 7 files). The grouping logic is not actually conditional on file count -- the serializer always renders fileGroups regardless of count, and there is no logic that switches between individual file listing vs. grouped format based on file count. | The serializer's `fileGroups` field is always rendered. If the Spec intends individual file listing for <=5 files, add conditional logic. If the design always uses fileGroups (as currently implemented), the Spec wording may be misleading -- clarify with spec author. |
| 5 | **P2** | Req 8.2: Restatement verification of write-and-discard persistence is not testable. The Spec requires that "WHEN a Restatement_Checkpoint is executed, THE Context_Budget_Manager SHALL verify that all Write-and-discard information has been properly persisted." This is a SKILL-level behavioral instruction with no corresponding testability. | Add a contract test or unit test that validates the SKILL document includes this verification instruction, or document that this is runtime-only behavior not testable via automated tests. |
| 6 | **P2** | Req 9.1/9.2: Session-end budget report output has no automated test for the report being written to the correct file path. The `ContextBudgetReport` serializer/deserializer exist and the < 30% warning works, but there is no test verifying the report is triggered at session end or written to `.forge/knowledge/sessions/<date>-<topic>-budget.md`. | Since this is SKILL-level behavior (triggered by `/forge ship` or `/forge learn`), add a contract test verifying the SKILL document instructs this output path, or add a unit test for the file path format. |
| 7 | **P2** | Property 11 GitDiffSummary round-trip does not verify `fileCount` or `fullDiffPath`. The round-trip test for GitDiffSummary only checks `files`, `totalAdded`, and `totalRemoved`, but skips `fileCount` and `fullDiffPath` fields. The deserializer does parse `fileCount` from the "change file count" line and `fullDiffPath` from the header. | Add `expect(parsed.fileCount).toBe(original.fileCount)` and `expect(parsed.fullDiffPath).toBe(original.fullDiffPath)` to the Property 11 GitDiffSummary test. |
| 8 | **P2** | Design.md specifies unit tests that are missing: "Explore empty result passthrough", "Review zero findings", "Git diff threshold boundary (exactly 50 lines)", "Git status threshold boundary (exactly 30 files)", "Subagent BLOCKED/DONE_WITH_CONCERNS status" -- these are listed in the testing strategy's unit test table but are not present as dedicated unit tests. Some are covered partially by property tests, but the boundary cases (exactly 50 lines, exactly 30 files) have no explicit test. | Add dedicated unit tests for boundary conditions: exactly 50 lines diff (should passthrough), 51 lines (should summarize); exactly 30 files status (should passthrough), 31 files (should summarize). |
| 9 | **P3** | Property tests use char/4 as a token approximation. This is a reasonable heuristic but may produce false positives/negatives. CJK characters (used extensively in the serialized output) typically consume more tokens per character than ASCII text, so the 4-char-per-token approximation may underestimate actual token count. | Consider using a more conservative ratio for CJK-heavy text (e.g., char/2.5) or document the approximation limitation in a comment. |
| 10 | **P3** | The `serializeTestOutput` all-pass format differs from the design spec format. Design says: `"X <total> tests passed (0 failed, <skip> skipped) in <duration>s"` but the implementation outputs `"X <passed>/<total> tests passed (0 failed, <skip> skipped) in <duration>s"`. The implementation includes `<passed>/` prefix before `<total>`. | Align the all-pass format with the design spec, or update the design spec to match implementation if the deviation is intentional. |
| 11 | **P3** | Property 2 "uses grouped format when more than 5 files" test is deterministic (single example), not property-based. It tests a single hardcoded `ExploreSummary` rather than using `fc.assert` with a generated arbitrary. This does not fully exercise the property across the input space. | Consider making this a property-based test by generating summaries with >5 files in fileGroups and verifying the output does not contain individual file paths outside the grouped format. Note: this is constrained by the current design where grouping is always via fileGroups, not conditional. |
