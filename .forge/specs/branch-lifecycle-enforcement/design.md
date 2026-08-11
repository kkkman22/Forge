---
feature: branch-lifecycle-enforcement
layout: design
created: 2026-04-29
---

# Branch Lifecycle Enforcement Bugfix Design

## Overview

Forge's branch gate (`forge-build` §2.1) only performs "entry checks" at build start — verifying the current branch has a `feature/<topic>` or `forge/<topic>` prefix. It has no "exit flow" to enforce merge/cleanup after task completion, no topic-level matching to prevent cross-topic contamination, and no staleness detection. This allows feature branches to accumulate unrelated commits from different feature domains indefinitely.

The fix introduces four pure-function modules:
1. **Topic matching** in the branch gate (replacing prefix-only matching)
2. **Pending-delivery tracking** when the user selects "keep branch" in ship
3. **Stale branch detection** at build start
4. **Cross-topic contamination prevention** at commit time

All new logic follows the project's architecture: pure functions that build command descriptors or return decision objects, with no side effects. The SKILL layer remains responsible for I/O.

## Glossary

- **Bug_Condition (C)**: The set of inputs where the branch lifecycle is not enforced — topic mismatches pass the gate, "keep branch" has no follow-up, stale branches go undetected, and cross-topic commits are allowed
- **Property (P)**: The desired behavior — topic-matched gate checks, pending-delivery tracking, staleness detection, and contamination prevention
- **Preservation**: Existing behaviors that must remain unchanged — correct-branch builds pass without extra prompts, ship_merge/push_pr/discard work as before, auto-switch from main works, dirty-tree blocking works
- **Branch Gate**: The pre-build check in `forge-build` §2.1 that verifies the developer is on the correct feature branch
- **Topic**: The feature domain identifier extracted from a branch name (e.g., `skill-document-optimization` from `feature/skill-document-optimization`)
- **Pending-Delivery**: A branch state where ship selected "keep branch" (option 3) — the branch has completed work but hasn't been merged, pushed, or discarded
- **Cross-Topic Contamination**: Commits from one feature domain landing on a branch belonging to a different feature domain

## Bug Details

### Bug Condition

The bug manifests in four related scenarios: (1) the branch gate only checks prefix (`feature/` or `forge/`) without verifying the topic segment matches the current task, (2) selecting "keep branch" in ship leaves the branch indefinitely without tracking or reminders, (3) there is no detection of branches that have gone stale after their topic's work completed, and (4) commits can be made on a branch belonging to a different topic without any check.

**Formal Specification:**
```
FUNCTION isBugCondition(input)
  INPUT: input of type BranchLifecycleEvent
  OUTPUT: boolean

  // Scenario 1: Topic mismatch passes gate
  IF input.event == "build_gate_check"
    RETURN input.branchTopic != input.taskTopic
           AND branchHasCorrectPrefix(input.branchName)

  // Scenario 2: Keep-branch with no tracking
  IF input.event == "ship_keep_branch"
    RETURN input.pendingDeliveryRecord == NULL

  // Scenario 3: Stale branch undetected
  IF input.event == "build_start"
    RETURN existsStaleBranch(input.pendingDeliveries, input.currentTime)
           AND input.staleWarnings == EMPTY

  // Scenario 4: Cross-topic commit allowed
  IF input.event == "pre_commit"
    RETURN input.branchTopic != input.commitTopic
           AND input.commitAllowed == TRUE

  RETURN FALSE
END FUNCTION
```

### Examples

- **Topic mismatch**: Developer is on `feature/skill-document-optimization`, runs `/forge build` for `process-lifecycle-management`. Current gate sees `feature/` prefix and allows it. Expected: gate blocks with topic mismatch error.
- **Keep-branch drift**: Developer ships `skill-document-optimization` with "keep branch", then starts building `process-lifecycle-management`. System never reminds about the pending branch. 15 commits from other topics accumulate. Expected: system records pending-delivery and warns at next build.
- **Stale branch**: `feature/agent-team-migration` completed 3 tasks ago but was never merged. No warning is shown. Expected: system flags the branch as stale at next build start.
- **Cross-topic contamination**: While on `feature/skill-document-optimization`, a commit is made with topic `fix-recovery`. No check prevents this. Expected: commit-time check blocks the contamination.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- When the developer is on the correct `feature/<topic>` branch and runs `/forge build` for that topic, the gate passes without additional prompts (Req 3.1)
- `ship_merge` (checkout main → merge → delete branch) continues to work exactly as implemented in `EffectExecutor.executeShipMerge` (Req 3.2)
- `ship_push_pr` (push → gh pr create) continues to work exactly as implemented in `EffectExecutor.executeShipPushPr` (Req 3.3)
- `ship_discard` (checkout main → force delete) with double-confirmation continues to work exactly as implemented in `EffectExecutor.executeShipDiscard` (Req 3.4)
- Auto-create/checkout of `feature/<topic>` from `main` continues to work (Req 3.5)
- Dirty working tree blocks branch switch (Req 3.6)
- Lightweight path skips Spec/Plan gates but enforces the enhanced branch gate (Req 3.7)

**Scope:**
All inputs that do NOT involve topic mismatches, pending-delivery tracking, staleness detection, or cross-topic commits should be completely unaffected by this fix. This includes:
- Builds where the branch topic matches the task topic
- Ship operations that select merge, PR, or discard (options 1, 2, 4)
- All existing git-transaction command builders
- All existing effect executor behaviors

## Hypothesized Root Cause

Based on the bug description, the root causes are:

1. **Prefix-Only Branch Gate**: `forge-build` §2.1 checks whether the current branch starts with `feature/` or `forge/` but never extracts and compares the topic segment. The `checkBuildGate` function in `src/build.ts` only checks `SpecStatus` and `PlanStatus` — there is no branch-topic validation function at all.

2. **Missing Exit Flow in Ship**: `forge-ship` option 3 ("keep branch") performs no git operations and records nothing. There is no `PendingDelivery` data structure, no persistence mechanism, and no check at subsequent build starts. The `EffectExecutor` has no effect type for recording pending deliveries.

3. **No Commit-Time Topic Check**: The `executeCommit` method in `EffectExecutor` performs frozen-zone checks on staged files but has no concept of branch-topic association. The commit proceeds regardless of whether the commit's topic matches the branch's topic.

4. **No Staleness Detection**: There is no mechanism to track when a branch's topic work was completed, no timestamp recording, and no staleness threshold check at build start.

## Correctness Properties

Property 1: Bug Condition - Topic Mismatch Detection in Branch Gate

_For any_ branch name with a valid `feature/<topic>` or `forge/<topic>` format and any task topic string, the enhanced `checkBranchTopicGate` function SHALL return `allowed: false` with a topic-mismatch reason when the extracted branch topic does not equal the task topic, and SHALL return `allowed: true` when they match.

**Validates: Requirements 2.3, 1.3**

Property 2: Preservation - Matching Topic Passes Gate Unchanged

_For any_ branch name where the extracted topic equals the task topic, the enhanced branch gate SHALL return `allowed: true` with no reasons, preserving the existing pass-through behavior for correctly-matched branches.

**Validates: Requirements 3.1, 3.7**

Property 3: Bug Condition - Pending-Delivery Recording

_For any_ branch name, topic, and timestamp, the `recordPendingDelivery` function SHALL produce a valid `PendingDeliveryRecord` containing the branch name, topic, and timestamp, ensuring no "keep branch" selection goes untracked.

**Validates: Requirements 2.1, 1.1**

Property 4: Bug Condition - Stale Branch Detection

_For any_ set of pending-delivery records and a current timestamp, the `detectStaleBranches` function SHALL return exactly those records whose topic differs from the current task topic and whose timestamp is older than the staleness threshold, and SHALL return an empty list when no branches are stale.

**Validates: Requirements 2.5, 1.5**

Property 5: Bug Condition - Cross-Topic Contamination Prevention

_For any_ branch name with an extractable topic and a commit topic, the `checkCommitTopicMatch` function SHALL return `allowed: false` when the branch topic does not match the commit topic, and SHALL return `allowed: true` when they match.

**Validates: Requirements 2.4, 1.4**

Property 6: Preservation - Topic Extraction Idempotency

_For any_ valid branch name in `feature/<topic>` or `forge/<topic>` format, the `extractBranchTopic` function SHALL extract the same topic string regardless of how many times it is called, and the extracted topic round-trips correctly (i.e., `feature/${extractBranchTopic(name)}` reconstructs the original branch name for single-segment topics).

**Validates: Requirements 3.1, 3.5**

## Fix Implementation

### Changes Required

Assuming our root cause analysis is correct:

**File**: `src/branch-lifecycle.ts` (NEW)

**Functions to add:**

1. **`extractBranchTopic(branchName: string): string | null`**: Pure function that extracts the topic segment from a `feature/<topic>` or `forge/<topic>` branch name. Returns `null` for branches that don't match the expected format (e.g., `main`, `develop`).

2. **`checkBranchTopicGate(branchName: string, taskTopic: string): BranchTopicGateResult`**: Pure function that verifies the branch topic matches the task topic. Returns `{ allowed, reasons }` similar to `checkBuildGate`. Calls `extractBranchTopic` internally.

3. **`recordPendingDelivery(branchName: string, topic: string, timestamp: number): PendingDeliveryRecord`**: Pure function that creates a pending-delivery record when "keep branch" is selected.

4. **`detectStaleBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string, currentTime: number, thresholdMs?: number): PendingDeliveryRecord[]`**: Pure function that identifies stale branches from the pending-delivery list. Default threshold: triggered when a new unrelated task starts (thresholdMs = 0, meaning any pending delivery for a different topic is flagged).

5. **`checkCommitTopicMatch(branchName: string, commitTopic: string): CommitTopicCheckResult`**: Pure function that verifies a commit's topic matches the branch's topic. Returns `{ allowed, reason }`.

6. **`detectUnshippedBranches(pendingDeliveries: PendingDeliveryRecord[], currentTopic: string): UnshippedBranchWarning[]`**: Pure function that identifies branches with pending deliveries that should be surfaced as warnings at build start.

**File**: `src/loop-types.ts` (MODIFY)

**Types to add:**
- `BranchTopicGateResult`: `{ allowed: boolean; reasons: string[] }`
- `PendingDeliveryRecord`: `{ branchName: string; topic: string; timestamp: number }`
- `CommitTopicCheckResult`: `{ allowed: boolean; reason?: string }`
- `UnshippedBranchWarning`: `{ branchName: string; topic: string; timestamp: number; message: string }`

**File**: `skills/forge-build/SKILL.md` (MODIFY)

**Changes:**
- Update §2.1 branch gate to include topic matching (not just prefix matching)
- Add unshipped-branch warning at build start
- Add stale-branch detection at build start

**File**: `skills/forge-ship/SKILL.md` (MODIFY)

**Changes:**
- Update option 3 ("keep branch") to record pending-delivery state

## Testing Strategy

### Validation Approach

The testing strategy follows a two-phase approach: first, surface counterexamples that demonstrate the bug on unfixed code, then verify the fix works correctly and preserves existing behavior.

### Exploratory Bug Condition Checking

**Goal**: Surface counterexamples that demonstrate the bug BEFORE implementing the fix. Confirm or refute the root cause analysis. If we refute, we will need to re-hypothesize.

**Test Plan**: Write tests that exercise the current branch gate with topic-mismatched inputs and verify that the gate incorrectly allows them. Run these tests on the UNFIXED code to observe the absence of topic checking.

**Test Cases**:
1. **Topic Mismatch Test**: Call `checkBuildGate("locked", "approved")` — it passes even when the branch topic doesn't match the task topic, because `checkBuildGate` has no branch parameter at all (will demonstrate the gap on unfixed code)
2. **Keep-Branch No-Record Test**: After ship option 3, verify no `PendingDeliveryRecord` exists (will demonstrate the gap — no such type exists on unfixed code)
3. **Cross-Topic Commit Test**: Execute a commit on a branch with a different topic — no check prevents it (will demonstrate the gap on unfixed code)
4. **Stale Branch Test**: Build starts with old pending branches — no warning is produced (will demonstrate the gap on unfixed code)

**Expected Counterexamples**:
- `checkBuildGate` accepts any spec/plan combination regardless of branch topic — the function signature doesn't even accept a branch parameter
- No `PendingDeliveryRecord` type or recording function exists
- `executeCommit` has no topic-matching check
- No staleness detection mechanism exists

### Fix Checking

**Goal**: Verify that for all inputs where the bug condition holds, the fixed functions produce the expected behavior.

**Pseudocode:**
```
FOR ALL (branchName, taskTopic) WHERE extractBranchTopic(branchName) != taskTopic DO
  result := checkBranchTopicGate(branchName, taskTopic)
  ASSERT result.allowed == FALSE
  ASSERT result.reasons.length > 0
END FOR

FOR ALL (branchName, topic, timestamp) DO
  record := recordPendingDelivery(branchName, topic, timestamp)
  ASSERT record.branchName == branchName
  ASSERT record.topic == topic
  ASSERT record.timestamp == timestamp
END FOR

FOR ALL (branchName, commitTopic) WHERE extractBranchTopic(branchName) != commitTopic DO
  result := checkCommitTopicMatch(branchName, commitTopic)
  ASSERT result.allowed == FALSE
END FOR
```

### Preservation Checking

**Goal**: Verify that for all inputs where the bug condition does NOT hold, the fixed functions produce the same result as the original functions.

**Pseudocode:**
```
FOR ALL (branchName, taskTopic) WHERE extractBranchTopic(branchName) == taskTopic DO
  result := checkBranchTopicGate(branchName, taskTopic)
  ASSERT result.allowed == TRUE
  ASSERT result.reasons.length == 0
END FOR

FOR ALL (specStatus, planStatus) DO
  ASSERT checkBuildGate(specStatus, planStatus) == checkBuildGate_original(specStatus, planStatus)
END FOR

FOR ALL (branchName, commitTopic) WHERE extractBranchTopic(branchName) == commitTopic DO
  result := checkCommitTopicMatch(branchName, commitTopic)
  ASSERT result.allowed == TRUE
END FOR
```

**Testing Approach**: Property-based testing is recommended for preservation checking because:
- It generates many (branch, topic) pairs automatically across the input domain
- It catches edge cases like branches with nested slashes, hyphens, or unusual characters
- It provides strong guarantees that matching-topic behavior is unchanged

**Test Plan**: Observe behavior on UNFIXED code first for matching-topic builds and ship operations, then write property-based tests capturing that behavior.

**Test Cases**:
1. **Matching Topic Preservation**: Verify that `checkBranchTopicGate("feature/my-topic", "my-topic")` returns `allowed: true` for all valid topic strings
2. **Build Gate Preservation**: Verify that `checkBuildGate` continues to return the same results for all (SpecStatus, PlanStatus) combinations — the existing function is not modified
3. **Ship Effect Preservation**: Verify that `ship_merge`, `ship_push_pr`, and `ship_discard` effect types continue to work unchanged in `EffectExecutor`
4. **Branch Name Extraction Preservation**: Verify that `extractBranchTopic` correctly handles branches with nested slashes (e.g., `feature/foo/bar` → `foo/bar`)

### Unit Tests

- Test `extractBranchTopic` with various branch name formats (feature/, forge/, main, nested slashes)
- Test `checkBranchTopicGate` with matching and mismatching topics
- Test `recordPendingDelivery` produces valid records
- Test `detectStaleBranches` with various pending-delivery sets and timestamps
- Test `checkCommitTopicMatch` with matching and mismatching topics
- Test `detectUnshippedBranches` with various pending-delivery states
- Test edge cases: empty strings, null topics, branches without prefix

### Property-Based Tests

- Generate random (branchName, taskTopic) pairs and verify `checkBranchTopicGate` returns `allowed` iff topics match (Property 1 + Property 2)
- Generate random (branchName, topic, timestamp) triples and verify `recordPendingDelivery` always produces a valid record (Property 3)
- Generate random pending-delivery sets with timestamps and verify `detectStaleBranches` returns exactly the stale ones (Property 4)
- Generate random (branchName, commitTopic) pairs and verify `checkCommitTopicMatch` returns `allowed` iff topics match (Property 5)
- Generate random valid branch names and verify `extractBranchTopic` is idempotent and round-trips correctly (Property 6)

### Integration Tests

- Test full build flow: branch gate with topic matching → build proceeds or blocks
- Test full ship flow: "keep branch" → pending-delivery recorded → next build shows warning
- Test cross-topic contamination: commit on wrong branch → blocked before commit executes
- Test stale branch lifecycle: complete task → keep branch → start new task → stale warning shown
