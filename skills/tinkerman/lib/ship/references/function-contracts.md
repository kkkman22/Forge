---
updated: 2026-08-11
---
# Function Call Contracts (Detailed)

## checkShipGate

**Signature**: `checkShipGate(review, test, progress)`

- **Parameters**:
  - `review` — `ReviewResult` parsed from `.forge/reviews/<topic>.md` frontmatter (含 `result`、`p0_count`、`p1_count`)
  - `test` — `TestResult` constructed from Layer 1 + Layer 3 verification results (含 `passed`、`failedCount`)
  - `progress` — `ProgressResult` parsed from `.forge/progress/<topic>.md` (含 `totalTasks`、`completedTasks`)
- **Returns**: `{ allowed: boolean, reasons: string[] }`；`allowed: false` 时 `reasons` 列出所有未通过的门禁
- **Purpose**: Programmatically verify the three ship gates, replacing manual item-by-item checks

---

## checkShipGateWithChecklist

**Signature**: `checkShipGateWithChecklist(review, test, progress, checklist)`

- **Parameters**:
  - Same three arguments as `checkShipGate`, plus `checklist` — `ChecklistEntry[]` for P1 Fix Checklist (含修复项和验证状态)
- **Returns**: `{ allowed: boolean, reasons: string[] }`；额外检查 P1 修复条目是否全部验证通过
- **Purpose**: Extended gate used when a P1 Fix Checklist exists, ensuring all P1 fixes are verified

---

## checkReviewFreshness

**Signature**: `checkReviewFreshness(reviewedCommit, currentHead, changedFiles)`

- **Parameters**:
  - `reviewedCommit` — `reviewed_at_commit` field from review frontmatter (`string | undefined`)
  - `currentHead` — Output of `git rev-parse HEAD`
  - `changedFiles` — Output of `git diff --name-only`
- **Returns**: `{ fresh: boolean, reason: string, changedFiles?: string[] }`
- **Purpose**: Warn when project code changed after review without blocking ship

---

## checkShipGateWithFreshness

**Signature**: `checkShipGateWithFreshness(review, test, progress, currentHead, changedFiles, checklist?)`

- **Parameters**:
  - Same three arguments as `checkShipGate`
  - `currentHead` — Output of `git rev-parse HEAD`
  - `changedFiles` — Output of `git diff --name-only <reviewedCommit>..HEAD`
  - `checklist` — Optional `ChecklistEntry[]` for P1 Fix Checklist
- **Returns**: `{ allowed: boolean, reasons: string[] }`；allowed 由 checkShipGate/checkShipGateWithChecklist 决定， freshness 警告以 `⚠️ Review freshness:` 前缀附加到 reasons（不阻断 ship）
- **Purpose**: One-shot gate that combines all ship checks plus the non-blocking review freshness warning

---

## recordPendingDelivery

> ⚠️ Superseded: The original `src/branch-lifecycle.ts` module was removed in the loop/SDK architecture refactoring.
> Pending delivery state is now tracked via `.forge/status.md` directly by the build/ship skills.
> `detectUnshippedBranches` in `src/branch-gate.ts` reads `.forge/status.md` for unshipped detection.

**Legacy Signature**: `recordPendingDelivery(branchName, topic, timestamp)` (from deleted `src/branch-lifecycle.ts`)

- **Parameters**:
  - `branchName` source: `git branch --show-current` output
  - `topic` source: `current_task` field in `.forge/status.md`
  - `timestamp` source: `Date.now()`
- **Returns**: `PendingDeliveryRecord` appended to `.forge/status.md`
- **Purpose**: Persist pending-delivery state when the user picks "Keep branch"; later consumed by `detectUnshippedBranches` at the next `/tinkerman build` startup
