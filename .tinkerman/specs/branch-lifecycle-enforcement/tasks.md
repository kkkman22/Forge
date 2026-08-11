---
feature: branch-lifecycle-enforcement
layout: tasks
created: 2026-04-29
spec_ref: ".tinkerman/specs/branch-lifecycle-enforcement/requirements.md"
---

# Implementation Plan

- [x] 1. Write bug condition exploration test
  - **Property 1: Bug Condition** - Branch Lifecycle Enforcement Gaps
  - **CRITICAL**: This test MUST FAIL on unfixed code — failure confirms the bug exists
  - **DO NOT attempt to fix the test or the code when it fails**
  - **NOTE**: This test encodes the expected behavior — it will validate the fix when it passes after implementation
  - **GOAL**: Surface counterexamples that demonstrate the four bug condition scenarios exist
  - **Scoped PBT Approach**: Scope the property to concrete failing cases for each bug scenario:
    - Scenario 1 (Topic Mismatch): `checkBuildGate("locked", "approved")` passes even when branch topic ≠ task topic — the function has no branch parameter at all, confirming the gap
    - Scenario 2 (Keep-Branch No-Record): No `PendingDeliveryRecord` type or `recordPendingDelivery` function exists — importing them should fail or return undefined
    - Scenario 3 (Stale Branch Undetected): No `detectStaleBranches` function exists — there is no staleness detection mechanism
    - Scenario 4 (Cross-Topic Commit): No `checkCommitTopicMatch` function exists — `executeCommit` has no topic-matching check
  - Write property-based test in `test/branch-lifecycle-bug-condition.property.test.ts` using fast-check
  - Generate random `(branchName, taskTopic)` pairs where `extractBranchTopic(branchName) !== taskTopic` and assert the expected behavior from the design: `checkBranchTopicGate` should return `{ allowed: false }` with topic-mismatch reason
  - Since the functions don't exist yet on unfixed code, the test file should attempt to import from `src/branch-lifecycle.ts` and the test will fail (module not found or functions missing)
  - Run test on UNFIXED code
  - **EXPECTED OUTCOME**: Test FAILS (this is correct — it proves the bug exists: no topic matching, no pending-delivery, no staleness detection, no cross-topic prevention)
  - Document counterexamples found: the entire `src/branch-lifecycle.ts` module is missing, confirming the root cause that no branch lifecycle enforcement exists
  - Mark task complete when test is written, run, and failure is documented
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 2. Write preservation property tests (BEFORE implementing fix)
  - **Property 2: Preservation** - Existing Build Gate and Ship Effects Unchanged
  - **IMPORTANT**: Follow observation-first methodology
  - Observe behavior on UNFIXED code for non-buggy inputs:
    - Observe: `checkBuildGate("locked", "approved")` returns `{ allowed: true, reasons: [] }` — this must remain unchanged
    - Observe: `checkBuildGate("draft", "approved")` returns `{ allowed: false, reasons: [...] }` — spec/plan gate logic must be preserved
    - Observe: `buildCheckoutCommand("main")` returns valid GitCommand — ship_merge checkout step preserved
    - Observe: `buildMergeCommand("feature/topic", true)` returns valid GitCommand — ship_merge merge step preserved
    - Observe: `buildBranchDeleteCommand("feature/topic", false)` returns valid GitCommand — ship_merge delete step preserved
    - Observe: `buildPushCommand("origin", "feature/topic", true)` returns valid GitCommand — ship_push_pr preserved
    - Observe: `buildBranchDeleteCommand("feature/topic", true)` returns valid GitCommand — ship_discard preserved
    - Observe: `sanitizeBranchName("feature/my-topic")` returns `"feature/my-topic"` — branch name handling preserved
  - Write property-based test in `test/branch-lifecycle-preservation.property.test.ts` using fast-check:
    - Property: For all `(specStatus, planStatus)` combinations, `checkBuildGate` returns the same results as before (Req 3.1)
    - Property: For all valid branch names, `sanitizeBranchName` and `validateBranchName` continue to work identically (Req 3.2–3.6)
    - Property: For all valid branch names, ship command builders (`buildCheckoutCommand`, `buildMergeCommand`, `buildBranchDeleteCommand`, `buildPushCommand`) produce the same GitCommand results (Req 3.2, 3.3, 3.4)
  - Verify tests pass on UNFIXED code
  - **EXPECTED OUTCOME**: Tests PASS (this confirms baseline behavior to preserve)
  - Mark task complete when tests are written, run, and passing on unfixed code
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 3. Implement branch lifecycle enforcement

  - [x] 3.1 Add new types to `src/loop-types.ts`
    - Add `BranchTopicGateResult`: `{ allowed: boolean; reasons: string[] }`
    - Add `PendingDeliveryRecord`: `{ branchName: string; topic: string; timestamp: number }`
    - Add `CommitTopicCheckResult`: `{ allowed: boolean; reason?: string }`
    - Add `UnshippedBranchWarning`: `{ branchName: string; topic: string; timestamp: number; message: string }`
    - _Bug_Condition: isBugCondition(input) — no types exist for branch lifecycle tracking_
    - _Expected_Behavior: Types enable all four enforcement scenarios from design_
    - _Preservation: Existing types in loop-types.ts remain unchanged_
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 3.2 Create `src/branch-lifecycle.ts` with pure functions
    - Implement `extractBranchTopic(branchName: string): string | null` — extracts topic from `feature/<topic>` or `forge/<topic>`, returns null for other formats (e.g., `main`, `develop`)
    - Implement `checkBranchTopicGate(branchName: string, taskTopic: string): BranchTopicGateResult` — returns `{ allowed: false, reasons }` when extracted topic ≠ taskTopic, `{ allowed: true, reasons: [] }` when they match
    - Implement `recordPendingDelivery(branchName: string, topic: string, timestamp: number): PendingDeliveryRecord` — creates a pending-delivery record for "keep branch" selections
    - Implement `detectStaleBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string, currentTime: number, thresholdMs?: number): PendingDeliveryRecord[]` — returns records whose topic ≠ currentTopic and whose timestamp is older than threshold (default: 0, meaning any pending delivery for a different topic is flagged)
    - Implement `checkCommitTopicMatch(branchName: string, commitTopic: string): CommitTopicCheckResult` — returns `{ allowed: false, reason }` when branch topic ≠ commit topic
    - Implement `detectUnshippedBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string): UnshippedBranchWarning[]` — returns warnings for branches with pending deliveries that should be surfaced at build start
    - All functions must be pure (no side effects), following the project's architecture pattern
    - Handle edge cases: empty strings, null topics, branches without prefix, nested slashes (e.g., `feature/foo/bar` → `foo/bar`)
    - _Bug_Condition: isBugCondition(input) where input.event ∈ {build_gate_check, ship_keep_branch, build_start, pre_commit}_
    - _Expected_Behavior: expectedBehavior(result) — topic mismatch blocked, pending-delivery recorded, stale branches detected, cross-topic commits prevented_
    - _Preservation: No existing functions modified; new module only_
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x] 3.3 Update SKILL documents
    - Update `skills/forge-build/SKILL.md` §2.1: replace prefix-only branch check with topic matching using `checkBranchTopicGate`
    - Update `skills/forge-build/SKILL.md`: add unshipped-branch warning at build start using `detectUnshippedBranches`
    - Update `skills/forge-build/SKILL.md`: add stale-branch detection at build start using `detectStaleBranches`
    - Update `skills/forge-ship/SKILL.md`: update option 3 ("keep branch") to record pending-delivery state using `recordPendingDelivery`
    - **SKILL-纯函数对接验证**（防止重蹈 R6/R14 覆辙——函数写好但 SKILL 未引用）：
      - 对每个新增纯函数，验证 SKILL 文档中包含显式调用路径：函数名、参数来源（从哪个上下文变量获取）、返回值用途（如何影响后续流程）
      - 检查清单：
        - `checkBranchTopicGate(branchName, taskTopic)` → forge-build SKILL §2.1 中是否写明：branchName 从 `git branch --show-current` 获取，taskTopic 从 plan/status 获取，返回 `allowed: false` 时阻断 build
        - `recordPendingDelivery(branchName, topic, timestamp)` → forge-ship SKILL 选项 3 中是否写明：调用此函数并将结果写入 `.tinkerman/status.md` 或指定持久化位置
        - `detectStaleBranches(pendingDeliveries, currentTopic, currentTime)` → forge-build SKILL 启动阶段是否写明：从持久化位置读取 pendingDeliveries，调用此函数，对返回结果展示警告
        - `detectUnshippedBranches(pendingDeliveries, currentTopic)` → forge-build SKILL 启动阶段是否写明：同上，调用此函数并展示未交付分支提醒
        - `checkCommitTopicMatch(branchName, commitTopic)` → forge-build SKILL 提交阶段是否写明：提交前调用此函数，`allowed: false` 时阻断提交
      - 任何一项缺失则补全后再标记完成
    - _Bug_Condition: SKILL documents lack topic matching, pending-delivery tracking, staleness detection_
    - _Expected_Behavior: SKILL documents reference new pure functions for all four enforcement scenarios, with explicit call paths (function name, parameter sources, return value usage)_
    - _Preservation: Existing SKILL document sections for ship_merge, ship_push_pr, ship_discard remain unchanged_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 3.4, 3.7_

  - [x] 3.4 Verify bug condition exploration test now passes
    - **Property 1: Expected Behavior** - Branch Lifecycle Enforcement Gaps Fixed
    - **IMPORTANT**: Re-run the SAME test from task 1 — do NOT write a new test
    - The test from task 1 encodes the expected behavior for all four scenarios
    - When this test passes, it confirms: topic mismatch is detected, pending-delivery is recorded, stale branches are flagged, cross-topic commits are blocked
    - Run bug condition exploration test from step 1: `npx vitest run test/branch-lifecycle-bug-condition.property.test.ts`
    - **EXPECTED OUTCOME**: Test PASSES (confirms bug is fixed)
    - _Requirements: 2.1, 2.3, 2.4, 2.5_

  - [x] 3.5 Verify preservation tests still pass
    - **Property 2: Preservation** - Existing Build Gate and Ship Effects Unchanged
    - **IMPORTANT**: Re-run the SAME tests from task 2 — do NOT write new tests
    - Run preservation property tests from step 2: `npx vitest run test/branch-lifecycle-preservation.property.test.ts`
    - **EXPECTED OUTCOME**: Tests PASS (confirms no regressions)
    - Confirm all existing behavior is preserved: `checkBuildGate` unchanged, ship command builders unchanged, branch name handling unchanged
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [x] 4. Checkpoint — Ensure all tests pass
  - Run full test suite: `npx vitest run`
  - Ensure all existing tests continue to pass (no regressions)
  - Ensure both new property test files pass:
    - `test/branch-lifecycle-bug-condition.property.test.ts`
    - `test/branch-lifecycle-preservation.property.test.ts`
  - Run type checking: `npx tsc --noEmit`
  - Run linting: `npx biome check src/ test/`
  - Ask the user if questions arise
